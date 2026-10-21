// Auditoria, inspeção e resultado pertencem à entrada atual da O.S. na Qualidade.
const QualityFlow = {
    actions: {audit:'AUDITORIA DE QUALIDADE VALIDADA',final:'INSPEÇÃO FINAL VALIDADA',pending:'DECISÃO DE QUALIDADE PENDENTE',approved:'CONTROLE DE QUALIDADE APROVADO',rejected:'CONTROLE DE QUALIDADE REPROVADO'},
    id(order) { return order.service_order_id || order.os_id || order.id; },
    cycle(order) { return `${this.id(order)}:${order.updated_at || 'entrada-legada'}`; },
    parse(event) { try {return JSON.parse(event.details);} catch {return null;} },
    signature(rows, key, fields) { return JSON.stringify(rows.map(row=>[ProductionFlow.normalize(row[key]),...fields.map(f=>row[f] ?? '')]).sort((a,b)=>a[0].localeCompare(b[0]))); },
    async checked(query) {const result=await query;if(result.error)throw result.error;return result.data;},
    async events(client,id,actions=Object.values(this.actions)) {
        const rows=[];
        for(let offset=0;;offset+=500){
            let query=client.from('history_events').select('*').in('action',actions);
            if(id)query=query.eq('service_order_id',id);
            const page=await this.checked(query.order('id',{ascending:true}).range(offset,offset+499));
            rows.push(...page);if(page.length<500)return rows;
        }
    },
    async load(client,id) {
        const [order,audit,checks,baseline,events]=await Promise.all([
            this.checked(client.from('service_orders').select('id,status,updated_at').eq('id',id).maybeSingle()),
            this.checked(client.from('checklist_qualidade').select('*').eq('service_order_id',id)),
            this.checked(client.from('checklist_quality').select('*').eq('service_order_id',id)),
            this.checked(client.from('checklist_analysis_general').select('item_name,status').eq('service_order_id',id)),this.events(client,id)
        ]);
        if(!order)throw new Error('O.S. não encontrada.');
        return {order,audit,checks,baseline,events,cycle:this.cycle(order)};
    },
    assertCurrent(ctx,cycle) {
        if(ctx.order.status!=='Aguardando Controle de Qualidade'||ctx.cycle!==cycle)throw new Error('A O.S. mudou de etapa ou iniciou outra inspeção. Atualize a fila.');
    },
    marker(ctx,kind) {return [...ctx.events].reverse().map(e=>this.parse(e)).find(d=>d?.kind===kind&&d.cycle===ctx.cycle);},
    auditValid(ctx) {
        const marker=this.marker(ctx,'quality_audit');
        if(!marker)return false;
        const audit=ctx.audit.filter(r=>(marker.rowNames || []).includes(r.item_name));
        const names=new Set(audit.map(r=>ProductionFlow.normalize(r.item_name)));
        return this.complete(audit,marker.names || [],'item_name')&&marker.signature===this.signature(audit,'item_name',['status','observation']) &&
            marker.baseline===this.signature(ctx.baseline.filter(r=>names.has(ProductionFlow.normalize(r.item_name))),'item_name',['status']);
    },
    finalValid(ctx) {
        const marker=this.marker(ctx,'quality_final');
        return this.auditValid(ctx)&&!!marker&&marker.auditRevision===this.marker(ctx,'quality_audit').revision&&marker.audit===this.marker(ctx,'quality_audit').signature&&
            marker.signature===this.signature(ctx.checks,'check_item',['is_ok']);
    },
    complete(rows,names,key) {
        return rows.length===names.length&&new Set(rows.map(r=>ProductionFlow.normalize(r[key]))).size===names.length&&
            names.every(name=>rows.some(r=>ProductionFlow.normalize(r[key])===ProductionFlow.normalize(name)));
    },
    divergences(rows,baseline) {
        const original=new Map(baseline.map(r=>[ProductionFlow.normalize(r.item_name),r.status || 'NÃO INFORMADO']));
        return rows.filter(r=>ProductionFlow.normalize(r.status)!==ProductionFlow.normalize(original.get(ProductionFlow.normalize(r.item_name)) || 'NÃO INFORMADO'))
            .map(r=>`${r.item_name}: análise ${original.get(ProductionFlow.normalize(r.item_name)) || 'NÃO INFORMADO'}; qualidade ${r.status}`);
    },
    async markerSave(client,id,action,details) {
        await this.checked(client.from('history_events').insert({service_order_id:id,action,description:action,details:JSON.stringify(details),timestamp:new Date().toISOString()}));
    },
    async saveAudit(client,id,cycle,rows,names,reviewed,leader={}) {
        const ctx=await this.load(client,id);this.assertCurrent(ctx,cycle);
        if(!reviewed.tab1||!reviewed.tab2||!this.complete(rows,names,'item_name'))throw new Error('Confira as duas abas e confirme a auditoria de anexos e geral.');
        const differences=this.divergences(rows,ctx.baseline);
        Rework.validateLeader(differences.length>0,leader.authorized,leader.note);
        const values=rows.map(r=>({service_order_id:id,item_name:ctx.audit.find(a=>ProductionFlow.normalize(a.item_name)===ProductionFlow.normalize(r.item_name))?.item_name || r.item_name.trim().toUpperCase(),status:r.status,observation:r.observation || ''}));
        await this.checked(client.from('checklist_qualidade').upsert(values,{onConflict:'service_order_id,item_name'}));
        const rowNames=values.map(r=>r.item_name);
        const stored=(await this.checked(client.from('checklist_qualidade').select('*').eq('service_order_id',id))).filter(r=>rowNames.includes(r.item_name));
        const storedNames=new Set(stored.map(r=>ProductionFlow.normalize(r.item_name)));
        await this.markerSave(client,id,this.actions.audit,{kind:'quality_audit',cycle,revision:crypto.randomUUID(),names,rowNames,signature:this.signature(stored,'item_name',['status','observation']),
            baseline:this.signature(ctx.baseline.filter(r=>storedNames.has(ProductionFlow.normalize(r.item_name))),'item_name',['status']),differences,leader});
    },
    async saveFinal(client,id,cycle,checks,names,leader={}) {
        const ctx=await this.load(client,id);this.assertCurrent(ctx,cycle);
        if(!this.auditValid(ctx))throw new Error('Salve e libere as auditorias de anexos e geral antes da inspeção final.');
        if(!this.complete(checks,names,'check_item')||checks.some(r=>typeof r.is_ok!=='boolean'))throw new Error('Informe Conforme ou Não conforme para todos os itens da inspeção final.');
        Rework.validateLeader(checks.some(r=>!r.is_ok),leader.authorized,leader.note);
        await this.checked(client.from('checklist_quality').upsert(checks.map(r=>({service_order_id:id,check_item:r.check_item,is_ok:r.is_ok})),{onConflict:'service_order_id,check_item'}));
        const stored=await this.checked(client.from('checklist_quality').select('*').eq('service_order_id',id));
        await this.markerSave(client,id,this.actions.final,{kind:'quality_final',cycle,signature:this.signature(stored,'check_item',['is_ok']),audit:this.marker(ctx,'quality_audit').signature,auditRevision:this.marker(ctx,'quality_audit').revision,leader});
    },
    async finish(client,event,details) {
        const result={...details,state:'completed'};
        await this.checked(client.from('history_events').update({action:details.outcome==='REJECTED'?this.actions.rejected:this.actions.approved,details:JSON.stringify(result)}).eq('id',event.id));
        return result;
    },
    async applied(client,event,details) {
        const [order,tracking]=await Promise.all([
            this.checked(client.from('service_orders').select('id,status,updated_at').eq('id',event.service_order_id).maybeSingle()),
            this.checked(client.from('component_tracking').select('*').eq('service_order_id',event.service_order_id))]);
        if(!order)return false;
        if(details.outcome==='APPROVED')return ['Pronto para Entrega','Standby - Aguardando Nota Fiscal','Finalizado'].includes(order.status)&&tracking.every(t=>['EXPEDICAO','FINALIZADO'].includes(t.current_stage));
        return (order.status!=='Aguardando Controle de Qualidade'||this.cycle(order)!==details.cycle)&&tracking.some(t=>t.component_name==='PEÇA INTEIRA'&&this.hasRoute(t,details.token));
    },
    hasRoute(row,token) {return ProductionFlow.logs(row).some(log=>log.action==='ROTEAMENTO'&&String(log.reason || '').includes(token));},
    async decide(client,id,cycle,outcome,options={}) {
        if(!['APPROVED','REJECTED'].includes(outcome))throw new Error('Resultado inválido.');
        const ctx=await this.load(client,id);
        const prior=[...ctx.events].reverse().find(e=>{const d=this.parse(e);return d?.kind==='quality_result'&&d.cycle===cycle;});
        let event=prior,details=event&&this.parse(event);
        if(details&&details.outcome!==outcome)throw new Error('Já existe outra decisão nesta inspeção. Atualize a fila.');
        if(details?.state==='completed')return {...details,alreadyCompleted:true};
        if(event&&await this.applied(client,event,details))return this.finish(client,event,details);
        if(!event){
            this.assertCurrent(ctx,cycle);
            if(outcome==='APPROVED'&&(!this.finalValid(ctx)||!options.reviewed?.tab1||!options.reviewed?.tab2))throw new Error('Confira e salve as três etapas antes de aprovar a turbina.');
            if(outcome==='REJECTED'&&(!String(options.reason || '').trim()||options.destination!=='DESMONTAGEM'))throw new Error('Informe o motivo da reprovação. O destino da correção é Desmontagem.');
            const auth=await client.auth.getSession();if(auth.error)throw auth.error;
            const token=crypto.randomUUID();
            details={kind:'quality_result',cycle,token,state:'pending',outcome,reason:String(options.reason || '').trim(),destination:outcome==='APPROVED'?'EXPEDICAO':options.destination,
                inspector:auth.data?.session?.user?.user_metadata?.name || auth.data?.session?.user?.email || auth.data?.session?.user?.id || 'Não identificado',
                failedChecks:(options.checks || []).filter(r=>r.is_ok===false).map(r=>r.check_item),
                auditSnapshot:(options.audit || []).filter(r=>r.status!=='NÃO INFORMADO'||r.observation),reviewed:options.reviewed || {}};
            event=await this.checked(client.from('history_events').insert({service_order_id:id,user_id:auth.data?.session?.user?.id || null,action:this.actions.pending,
                description:outcome==='REJECTED'?`Turbina reprovada na Qualidade. Motivo: ${details.reason}. Correção: ${details.destination}.`:'Turbina aprovada na Qualidade para Expedição.',
                details:JSON.stringify(details),timestamp:new Date().toISOString()}).select('id,service_order_id').single());
        }
        try {
            if(outcome==='APPROVED')await ProductionFlow.transitionOrder(client,id,'Pronto para Entrega',{},['Aguardando Controle de Qualidade','Pronto para Entrega']);
            else {
                const tracking=await this.checked(client.from('component_tracking').select('*').eq('service_order_id',id));
                const routed=tracking.some(t=>t.component_name==='PEÇA INTEIRA'&&t.current_stage===details.destination&&this.hasRoute(t,details.token));
                if(routed)await ProductionFlow.setOrderStatus(client,id,'Em Produção',{},['Aguardando Controle de Qualidade','Em Produção']);
                else {
                    this.assertCurrent(ctx,cycle);
                    const moved=await ProductionFlow.move('PEÇA INTEIRA',details.destination,{note:`Reprovação da Qualidade: ${details.reason} [${details.token}]`});
                    if(!moved)throw new Error('Conclua o retrabalho antes de registrar o resultado.');
                }
            }
            return await this.finish(client,event,details);
        }catch(error){
            if(await this.applied(client,event,details))return this.finish(client,event,details);
            throw error;
        }
    },
    async results(client) {
        const events=await this.events(client,null,[this.actions.approved,this.actions.rejected,this.actions.pending]);
        for(const event of events.filter(e=>e.action===this.actions.pending)){
            const d=this.parse(event);if(d?.kind==='quality_result'&&await this.applied(client,event,d)){
                const completed=await this.finish(client,event,d);event.action=completed.outcome==='REJECTED'?this.actions.rejected:this.actions.approved;event.details=JSON.stringify(completed);
            }
        }
        return events;
    },
    metrics(events,start='',end='') {
        const from=start?new Date(start+'T00:00:00').getTime():-Infinity,to=end?new Date(end+'T23:59:59.999').getTime():Infinity;
        const decisions=new Map();
        for(const event of events){
            const d=this.parse(event);if(d?.kind==='quality_result'&&d.state!=='completed')continue;
            if(![this.actions.approved,this.actions.rejected].includes(event.action))continue;
            decisions.set(d?.cycle || `legacy:${event.id}`,{...event,result:d,outcome:d?.outcome || (event.action===this.actions.rejected?'REJECTED':'APPROVED')});
        }
        const rows=[...decisions.values()].filter(e=>{const date=Date.parse(e.timestamp);return date>=from&&date<=to;});
        const rejected=rows.filter(e=>e.outcome==='REJECTED').length;
        return {rows,total:rows.length,rejected,approved:rows.length-rejected,rate:rows.length?rejected/rows.length*100:0};
    }
};
window.QualityFlow=QualityFlow;
