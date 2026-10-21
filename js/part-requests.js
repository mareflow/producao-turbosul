// Decisão da triagem, pedido confirmado e baixa física são etapas distintas.
const PartRequests = {
    states: { PURCHASE: 'PURCHASE_REQUEST', STOCK: 'STOCK_REQUEST' },
    escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
    code(name) { return ProductionFlow.component(name); },
    label(name) {
        const code = this.code(name);
        return ({CT:'CARCAÇA DE TURBINA (CT)',GEOMETRIA:'GEOMETRIA VARIÁVEL',CANOTE:'CANOTE DA GEOMETRIA',FLANGE:'FLANGE DA GEOMETRIA'})[code] || code;
    },
    status(row) {
        if (row?.is_resolved === true) return 'RECEIVED';
        return Object.keys(this.states).find(type => this.states[type] === row?.availability) || 'DRAFT';
    },
    stage(type) { return type === 'PURCHASE' ? 'COMPRA' : type === 'STOCK' ? 'ESTOQUE' : 'TRIAGEM'; },
    typeLabel(type) { return type === 'STOCK' ? 'Retirada do estoque' : 'Compra'; },
    matches(ctx,row) { const code=this.code(row.part_name); return ctx.codes.includes(code) || (ctx.group && code.includes('CONJUNTO')); },
    async checked(query) { const result = await query; if (result.error) throw result.error; return result.data; },
    async context(client, id, part) {
        const [order, analysis, receipts] = await Promise.all([
            this.checked(client.from('service_orders').select('id,status').eq('id',id).maybeSingle()),
            this.checked(client.from('checklist_analysis_general').select('*').eq('service_order_id',id)),
            this.checked(client.from('triage_parts').select('*').eq('service_order_id',id))
        ]);
        if (!order || ProductionFlow.isClosed(order)) throw new Error('Esta O.S. está encerrada. Atualize a fila.');
        const code = this.code(part);
        const group = code.includes('CONJUNTO') || (ProductionFlow.core.includes(code) && ProductionFlow.isNew({analysis:analysis || []}));
        const codes = group ? ProductionFlow.core : [code];
        return { order, analysis:analysis || [], receipts:receipts || [], codes, group, name:group ? 'CONJUNTO ROTATIVO (FULL)' : this.label(part) };
    },
    async confirm(client, id, part, type, options = {}) {
        if (!this.states[type]) throw new Error('Selecione compra ou retirada do estoque.');
        const ctx = await this.context(client,id,part);
        const existing = ctx.receipts.filter(r => this.matches(ctx,r));
        if (existing.some(r => this.status(r) === 'RECEIVED')) throw new Error('Esta peça já teve baixa. O recebimento não pode ser desfeito por esta seleção.');
        if (existing.some(r => !['DRAFT',type].includes(this.status(r)))) throw new Error('O pedido já foi confirmado e seu tipo não pode ser alterado.');
        const draft = existing.filter(r => this.status(r) === 'DRAFT');
        const missing = ctx.codes.filter(code => !existing.some(r => this.code(r.part_name) === code));
        const value = {availability:this.states[type],is_resolved:false,resolved_at:null};
        if (draft.length) {
            const updated = await this.checked(client.from('triage_parts').update(value).in('id',draft.map(r=>r.id))
                .eq('is_resolved',false).in('availability',['PENDING','ORDER','STOCK']).select('id'));
            if ((updated || []).length !== draft.length) throw new Error('O pedido foi alterado em outra tela. Atualize a lista.');
        }
        if (missing.length) await this.checked(client.from('triage_parts').insert(missing.map(code=>({service_order_id:id,part_name:this.label(code),...value}))));
        const stage = this.stage(type), now = new Date().toISOString();
        const components = ctx.group ? ProductionFlow.coreNames() : ctx.codes;
        await this.checked(client.from('component_tracking').upsert(components.map(component_name=>({
            service_order_id:id,component_name,current_stage:stage,current_sector:stage,
            status:type === 'STOCK' ? 'AGUARDANDO_RETIRADA_ESTOQUE' : 'AGUARDANDO_COMPRA',
            status_description:`${this.typeLabel(type)} confirmada; aguardando baixa física.`,
            ...(ctx.group ? {verdict_vendas:'TROCAR CONJUNTO'} : {}),last_update:now
        })),{onConflict:'service_order_id,component_name'}));
        const ids = ctx.analysis.filter(a=>ctx.codes.includes(this.code(a.item_name))).map(a=>a.id);
        if (ids.length) await this.checked(client.from('checklist_analysis_general').update(value).in('id',ids));
        const action=type === 'STOCK' ? 'PEDIDO DE ESTOQUE CONFIRMADO' : 'PEDIDO DE COMPRA CONFIRMADO';
        const description=`${ctx.name}: ${this.typeLabel(type)} confirmada pela triagem. Aguardando baixa física.${options.sector ? ' Setor solicitante: '+options.sector+'.' : ''}${options.note ? ' Observação: '+options.note : ''}`;
        const history=await this.checked(client.from('history_events').select('id').eq('service_order_id',id).eq('action',action).eq('description',description));
        if (!(history || []).length) await this.checked(client.from('history_events').insert({service_order_id:id,action,description,
            details:JSON.stringify({kind:'part_request',type,parts:ctx.codes}),timestamp:now}));
        return {...ctx,type};
    },
    async receive(client,id,part) {
        const ctx = await this.context(client,id,part);
        const rows = ctx.receipts.filter(r=>this.matches(ctx,r));
        if (ctx.codes.some(code=>!rows.some(r=>this.code(r.part_name)===code))) throw new Error('Confirme o pedido antes de dar baixa.');
        if (rows.every(r=>this.status(r)==='RECEIVED')) return {...ctx,alreadyReceived:true};
        const type = this.status(rows[0]);
        if (!this.states[type] || rows.some(r=>this.status(r)!==type)) throw new Error('Confirme um único tipo de pedido antes de dar baixa.');
        const now = new Date().toISOString(), components = ctx.group ? ProductionFlow.coreNames() : ctx.codes;
        await this.checked(client.from('component_tracking').upsert(components.map(component_name=>({
            service_order_id:id,component_name,
            current_stage:ctx.group ? 'MONTAGEM' : component_name==='EIXO' ? 'BALANCEAMENTO' : ['CT','CCO'].includes(component_name) ? 'DESMONTAGEM' : 'MONTAGEM',
            current_sector:ctx.group ? 'MONTAGEM' : component_name==='EIXO' ? 'BALANCEAMENTO' : ['CT','CCO'].includes(component_name) ? 'DESMONTAGEM' : 'MONTAGEM',
            status:ctx.group ? 'CONJUNTO NOVO' : 'PEÇA RECEBIDA',
            status_description:`Baixa física: ${this.typeLabel(type)}.`,
            ...(ctx.group ? {verdict_vendas:'TROCAR CONJUNTO'} : {}),last_update:now
        })),{onConflict:'service_order_id,component_name'}));
        const value = {availability:'STOCK',is_resolved:true,resolved_at:now};
        const ids = ctx.analysis.filter(a=>ctx.codes.includes(this.code(a.item_name))).map(a=>a.id);
        if (ids.length) await this.checked(client.from('checklist_analysis_general').update(value).in('id',ids));
        const updated = await this.checked(client.from('triage_parts').update(value).in('id',rows.map(r=>r.id))
            .eq('availability',this.states[type]).eq('is_resolved',false).select('id'));
        if ((updated || []).length !== rows.length) throw new Error('A baixa foi alterada em outra tela. Atualize os pedidos.');
        await this.checked(client.from('history_events').insert({service_order_id:id,
            action:type==='STOCK' ? 'BAIXA DE RETIRADA DO ESTOQUE' : 'BAIXA DE COMPRA',
            description:`${ctx.name}: ${type==='STOCK' ? 'retirada do estoque confirmada' : 'compra recebida'}. Peça liberada para o setor de destino.`,timestamp:now}));
        return {...ctx,type};
    },
    async list(client) {
        const rows = await this.checked(client.from('triage_parts').select('*, service_orders(id,business_id,client,model,status)')
            .in('availability',Object.values(this.states)).eq('is_resolved',false));
        const active = (rows || []).filter(r=>r.service_orders && !ProductionFlow.isClosed(r.service_orders));
        const ids = [...new Set(active.map(r=>r.service_order_id))];
        const [analysis, tracking] = ids.length ? await Promise.all([
            this.checked(client.from('checklist_analysis_general').select('service_order_id,item_name,decisao_vendas').in('service_order_id',ids)),
            this.checked(client.from('component_tracking').select('service_order_id,verdict_vendas').eq('component_name','CONJUNTO ROTATIVO').in('service_order_id',ids))
        ]) : [[],[]];
        const fullOrders=new Set(tracking.filter(t=>t.verdict_vendas==='TROCAR CONJUNTO').map(t=>t.service_order_id));
        const grouped = new Map();
        for (const row of active) {
            const full = this.code(row.part_name).includes('CONJUNTO') || (ProductionFlow.core.includes(this.code(row.part_name)) && (fullOrders.has(row.service_order_id) || ProductionFlow.isNew({analysis:analysis.filter(a=>a.service_order_id===row.service_order_id)})));
            const type = this.status(row), name = full ? 'CONJUNTO ROTATIVO (FULL)' : this.label(row.part_name);
            const key = [row.service_order_id,name,type].join(':');
            if (!grouped.has(key)) grouped.set(key,{order:row.service_orders,os_id:row.service_order_id,name,type,group:full});
        }
        return [...grouped.values()];
    }
};
window.PartRequests = PartRequests;
