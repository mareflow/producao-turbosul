const ProductionFlow = {
    core: ['EIXO', 'ROTOR', 'CCE', 'REPAROS'],
    sectors: ['DESMONTAGEM', 'RETIFICA', 'SOLDA', 'METROLOGIA', 'BANCADA', 'BALANCEAMENTO', 'MONTAGEM'],
    normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(); },
    isClosed(order) {
        return ['FINALIZADO', 'FINALIZADA', 'CONCLUIDO', 'CONCLUIDA', 'ENTREGUE', 'CANCELADO', 'CANCELADA', 'ARQUIVADO', 'ARQUIVADA'].includes(this.normalize(order.status));
    },
    isProductionActive(order) {
        return this.phase(order) === 'PRODUCAO';
    },
    sort(orders) {
        const weight = { URGENTE: 4, ALTA: 3, NORMAL: 2, BAIXA: 1 };
        return [...(Array.isArray(orders) ? orders : [])].sort((a, b) =>
            (weight[this.normalize(b.urgency)] || 2) - (weight[this.normalize(a.urgency)] || 2) ||
            new Date(a.created_at || a.entry_date || a.timestamp || 0) - new Date(b.created_at || b.entry_date || b.timestamp || 0));
    },
    phase(order) {
        const status = this.normalize(order.status);
        if (this.isClosed(order)) return 'ENCERRADA';
        if (/EXPEDICAO|PRONTO PARA ENTREGA|AGUARDANDO (NOTA FISCAL|NF)/.test(status)) return 'EXPEDICAO';
        if (status.includes('QUALIDADE')) return 'QUALIDADE';
        if (/ANALISE|AGUARDANDO CASCO/.test(status)) return 'ANALISE_TECNICA';
        if (/COMERCIAL|VENDA/.test(status) && !/PRE.?VENDA/.test(status)) return 'VENDAS';
        if (/TRIAGEM/.test(status) || status === 'STANDBY') return 'TRIAGEM';
        if (/ENTRADA|PRE.?VENDA|PENDENTE/.test(status)) return 'PRE_VENDAS';
        return 'PRODUCAO';
    },
    stations(order) {
        const phase = this.phase(order);
        if (phase === 'ENCERRADA') return [];
        if (phase !== 'PRODUCAO') return [phase];
        const stages = this.tracking(order).map(t => this.normalize(t.current_stage || t.current_sector));
        const active = this.sectors.filter(s => stages.includes(s));
        if (stages.some(s => ['COMPRA','ESTOQUE','TRIAGEM'].includes(s))) active.push('TRIAGEM');
        if (!active.length && /DESMONTAGEM|PRODUCAO/.test(this.normalize(order.status))) active.push('DESMONTAGEM');
        if (!active.length && /BALANCEAMENTO/.test(this.normalize(order.status))) active.push('BALANCEAMENTO');
        return active;
    },
    async setOrderStatus(client, id, status, fields = {}, allowed = []) {
        const { data: order, error: readError } = await client.from('service_orders').select('id,status').eq('id', id).maybeSingle();
        if (readError) throw readError;
        if (!order || (this.isClosed(order) && order.status !== status) || (allowed.length && order.status !== status && !allowed.includes(order.status))) {
            throw new Error('A O.S. não está mais nesta etapa. Atualize a fila.');
        }
        const { data: updated, error } = await client.from('service_orders').update({ ...fields, status, updated_at: new Date().toISOString() })
            .eq('id', id).eq('status', order.status).select('id').maybeSingle();
        if (error) throw error;
        if (!updated) throw new Error('A O.S. foi alterada em outra tela. Atualize a fila.');
    },
    async transitionOrder(client, id, status, fields = {}, allowed = []) {
        await this.setOrderStatus(client, id, status, fields, allowed);
        const now = new Date().toISOString();
        const stage = this.isClosed({ status }) ? 'FINALIZADO' : 'EXPEDICAO';
        const { error: trackingError } = await client.from('component_tracking').update({ current_stage: stage, current_sector: stage,
            status: stage === 'FINALIZADO' ? 'Finalizado' : 'Aguardando', last_update: now }).eq('service_order_id', id);
        if (trackingError) throw trackingError;
    },
    component(value) {
        const key = this.normalize(value);
        return ({ 'CONJUNTO NOVO': 'CONJUNTO ROTATIVO', 'PECA INTEIRA': 'PEÇA INTEIRA', 'CARCACA DE TURBINA (CT)': 'CT',
            'GEOMETRIA VARIAVEL': 'GEOMETRIA', 'CANOTE DA GEOMETRIA': 'CANOTE', 'FLANGE DA GEOMETRIA': 'FLANGE' })[key] || String(value || '').trim().toUpperCase();
    },
    isNew(order) {
        return (order.triage_parts || order.analysis || []).some(item => this.core.includes(this.component(item.item_name)) && this.normalize(item.decisao_vendas) === 'TROCAR CONJUNTO') ||
            (order.full_tracking || order.tracking || []).some(t => t.verdict_vendas === 'TROCAR CONJUNTO');
    },
    coreNames() { return [...this.core, 'CONJUNTO ROTATIVO']; },
    pendingStage(rows) {
        const pending = (rows || []).filter(r => r.is_resolved !== true);
        if (pending.some(r => r.availability === 'PURCHASE_REQUEST')) return 'COMPRA';
        if (pending.length && pending.every(r => r.availability === 'STOCK_REQUEST')) return 'ESTOQUE';
        return 'TRIAGEM';
    },
    received(order) {
        return this.core.every(name => (order.purchase_parts || []).some(p => this.component(p.part_name) === name && p.availability === 'STOCK' && p.is_resolved === true));
    },
    tracking(order) {
        const list = order.full_tracking || order.tracking || [];
        const aggregate = list.find(t => this.component(t.component_name) === 'CONJUNTO ROTATIVO');
        if (!this.isNew(order) && !aggregate) return list;
        const members = list.filter(t => this.core.includes(this.component(t.component_name)));
        const commonStage = members.length === 4 && members.every(t => t.current_stage === members[0].current_stage) ? members[0].current_stage : 'MONTAGEM';
        const stage = Array.isArray(order.purchase_parts) && this.isNew(order) && !this.received(order) ? this.pendingStage(order.purchase_parts.filter(p=>this.core.includes(this.component(p.part_name)))) : (aggregate?.current_stage || commonStage);
        return [...list.filter(t => !this.core.includes(this.component(t.component_name)) && this.component(t.component_name) !== 'CONJUNTO ROTATIVO'),
            { ...aggregate, component_name: 'CONJUNTO ROTATIVO', current_stage: stage, current_sector: stage,
                status: aggregate?.status || (stage === 'COMPRA' ? 'AGUARDANDO_COMPRA' : 'CONJUNTO NOVO') }];
    },
    serviceDone(logs, service) {
        const history = typeof logs === 'string' ? JSON.parse(logs) : (logs || []);
        const lastReturn = history.filter(log => log.action === 'ROTEAMENTO' && log.from === 'MONTAGEM')
            .reduce((max, log) => Math.max(max, Date.parse(log.timestamp) || 0), 0);
        return history.some(log => log.service === service && (Date.parse(log.end_time) || 0) >= lastReturn);
    },
    destinations(component, sector = Rework.context().sector) {
        return this.sectors.filter(s => s !== sector);
    },
    render(component, enabled = true) {
        const ctx = Rework.context();
        if (!ctx.id) return '';
        return `<div class="mt-3 w-full text-left" data-routing-component="${Rework.escape(component)}" data-routing-order="${Rework.escape(ctx.id)}">
            <p class="text-[10px] font-black text-slate-400 uppercase mb-3">Encaminhar para:</p>
            <div class="grid grid-cols-2 gap-2">${this.destinations(component, ctx.sector).map(s => `<button type="button" data-routing-send data-routing-target="${s}" ${!enabled ? 'disabled' : ''}
                class="${s === 'MONTAGEM' ? 'col-span-2 bg-emerald-600 text-white' : 'bg-slate-50 text-slate-700'} py-3 rounded-lg text-[10px] uppercase font-black disabled:opacity-40 hover:brightness-95">${s === 'MONTAGEM' ? 'Pronto p/ Montagem' : ({DESMONTAGEM:'Desmontagem',RETIFICA:'Retífica',SOLDA:'Solda',METROLOGIA:'Metrologia',BANCADA:'Bancada',BALANCEAMENTO:'Balanceamento'})[s] || s}</button>`).join('')}</div></div>`;
    },
    async move(component, target, options = {}) {
        const { id, sector } = Rework.context();
        if (!id || ![...this.sectors, 'QUALIDADE'].includes(target)) throw new Error('Setor ou O.S. inválidos.');
        if (!await Rework.ensureFinished()) return false;
        const client = Rework.client();
        const { data: order, error: orderReadError } = await client.from('service_orders').select('status').eq('id', id).maybeSingle();
        if (orderReadError) throw orderReadError;
        if (!order || this.isClosed(order)) throw new Error('Esta O.S. está encerrada. Atualize a fila.');
        if (!this.isProductionActive(order) && sector !== 'QUALIDADE') throw new Error('A O.S. ainda não foi liberada para este setor. Atualize a fila.');
        const results = await Promise.all([
            client.from('component_tracking').select('*').eq('service_order_id', id),
            client.from('checklist_analysis_general').select('*').eq('service_order_id', id),
            client.from('triage_parts').select('*').eq('service_order_id', id)
        ]);
        for (const r of results) if (r.error) throw r.error;
        const [tracking, analysis, receipts] = results.map(r => r.data || []);
        const name = this.component(component);
        const newCore = this.isNew({ analysis });
        const whole = name === 'PEÇA INTEIRA';
        const grouped = name === 'CONJUNTO ROTATIVO' || (newCore && this.core.includes(name));
        const current = tracking.find(t => t.component_name === (grouped ? 'CONJUNTO ROTATIVO' : name));
        if (current && !['REABERTA', sector].includes(current.current_stage)) throw new Error('A peça já está em outro setor. Atualize a tela.');
        const names = whole ? [...new Set([...tracking.filter(t => t.current_stage === sector || this.coreNames().includes(t.component_name) || ['CT', 'CCO'].includes(t.component_name)).map(t => t.component_name), 'PEÇA INTEIRA'])] : grouped ? this.coreNames() : [name];
        const pending = receipts.some(p => names.includes(this.component(p.part_name)) && (p.availability === 'ORDER' || p.is_resolved !== true));
        if (pending) throw new Error('A peça ainda aguarda baixa de recebimento na Triagem.');
        const activeTimer = Object.keys(localStorage).some(key => names.some(part => key === `timer_${id}_${part}` || key === `timer_paused_${id}_${part}` || key.startsWith(`timer_${id}_${part}_`) || key.startsWith(`timer_paused_${id}_${part}_`)) ||
            (sector === 'MONTAGEM' && (key.startsWith(`timer_${id}_MONTAGEM_`) || key.startsWith(`timer_paused_${id}_MONTAGEM_`))));
        if (activeTimer) throw new Error('Finalize os cronômetros dos serviços desta O.S. antes de encaminhar.');
        const note = String(options.note || '').trim();
        const now = new Date().toISOString();
        const payload = names.map(part => {
            const existing = tracking.find(t => t.component_name === part);
            const logs = typeof existing?.tracking_data === 'string' ? JSON.parse(existing.tracking_data) : (existing?.tracking_data || []);
            return { service_order_id: id, component_name: part, current_stage: target, current_sector: target,
                status: options.status || (target === 'MONTAGEM' && name === 'EIXO' && sector === 'BALANCEAMENTO' ? 'BALANCEADO' : 'Aguardando'),
                executed_services: [...new Set([...(existing?.executed_services || []), ...(options.services || [])])],
                tracking_data: [...logs, { action: 'ROTEAMENTO', from: existing?.current_stage || sector, to: target, ...(note ? {reason:note} : {}), timestamp: now }],
                last_update: now };
        });
        if (!whole && tracking.some(t => t.component_name === 'PEÇA INTEIRA') && this.sectors.includes(target)) {
            payload.push({ service_order_id: id, component_name: 'PEÇA INTEIRA', current_stage: 'REABERTA', current_sector: null, status: 'Revisão de componentes', last_update: now });
        }
        const { error } = await client.from('component_tracking').upsert(payload, { onConflict: 'service_order_id,component_name' });
        if (error) throw error;
        const status = whole && target === 'QUALIDADE' ? 'Aguardando Controle de Qualidade' : whole && target === 'BALANCEAMENTO' ? 'Aguardando Balanceamento' : 'Em Produção';
        const { error: orderError } = await client.from('service_orders').update({ status, updated_at: now }).eq('id', id);
        if (orderError) throw orderError;
        const { data: { session } } = await client.auth.getSession();
        const { error: historyError } = await client.from('history_events').insert({ service_order_id: id, user_id: session?.user?.id || null,
            action: 'ROTEAMENTO ENTRE SETORES', description: `${grouped ? 'CONJUNTO ROTATIVO' : name}: ${sector} → ${target}.${note ? ' Motivo: '+note : ''}`, timestamp: now });
        if (historyError) throw historyError;
        return true;
    },
    async send(component, target, options) {
        try {
            if (await this.move(component, target, options)) { alert('Peça encaminhada para ' + target + '.'); location.reload(); }
        } catch (error) { alert('Não foi possível encaminhar: ' + error.message); }
    }
};
window.ProductionFlow = ProductionFlow;
document.addEventListener('click', async event => {
    const button = event.target.closest('[data-routing-send]');
    if (!button) return;
    const panel = button.closest('[data-routing-component]');
    if (panel.dataset.routingOrder !== Rework.context().id) return;
    button.disabled = true;
    const card = panel.closest('[id]');
    const services = Array.from(card?.querySelectorAll('input[data-service]:checked') || []).map(input => input.dataset.service).filter(Boolean);
    await ProductionFlow.send(panel.dataset.routingComponent, button.dataset.routingTarget, {services});
    button.disabled = false;
});
