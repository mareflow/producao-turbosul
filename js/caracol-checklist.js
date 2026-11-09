// O checklist 3 é conferido na Análise Técnica e na entrada do CT na Bancada.
const CaracolChecklist = {
    items: ['Trinca Base Face ou Gases', 'Quebra Base Face', 'Espessura da Base Minima 9mm', 'Embuchamento da CT', 'Desgaste Saida Escape Flangeada', 'Desgaste Face Encaixe CCE', 'Trinca Face Assentamento CCE', 'Trinca Parede Lateral Protetor', 'Trinca ou Quebra da Voluta', 'Borboleta ou Moeda Folga', 'Bucha Guia Borboleta', 'Braco Wastegate', 'Pino de Centro', 'Assentamento Borboleta Moeda', 'Coletor Anexo', 'Plaina Coletor Uniao Biturbo', 'Empenamento Faces Alojamento', 'Necessita Gabarito Usinagem', 'Tipo de Solda'],
    condemned: 'CONDENAR CARACOL COMPLETO (TROCAR)',
    statuses: ['NÃO INFORMADO', 'PEÇA OK', 'RECONDICIONAR', 'TROCAR', 'ITEM FALTANTE'],
    action: 'CHECKLIST DO CARACOL VALIDADO - BANCADA',
    norm(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(); },
    isItem(name) { return [...this.items, this.condemned].some(item => this.norm(item) === this.norm(name)); },
    without(rows) { return (rows || []).filter(row => !this.isItem(row.item_name || row.name)); },
    isCT(name) { return ['CT', 'CARACOL', 'CARCACA DE TURBINA', 'CARCACA DE TURBINA (CT)'].includes(this.norm(name)); },
    atBench(tracking) { return ['BANCADA', 'BANCADA DE USINAGEM'].includes(this.norm(tracking?.current_stage || tracking?.current_sector)); },
    entry(tracking) {
        let logs = tracking?.tracking_data || [];
        if (typeof logs === 'string') logs = JSON.parse(logs);
        return logs.filter(log => log.action === 'ROTEAMENTO' && ['BANCADA', 'BANCADA DE USINAGEM'].includes(this.norm(log.to)))
            .map(log => log.timestamp).sort().at(-1) || 'entrada-inicial';
    },
    signature(rows) { return JSON.stringify((rows || []).filter(r => this.isItem(r.item_name)).map(r => [this.norm(r.item_name), this.norm(r.status), r.observation || '']).sort((a,b) => a[0].localeCompare(b[0]))); },
    parse(event) { try { const data = JSON.parse(event.description); return data.kind === 'caracol_bancada_audit' ? data : null; } catch { return null; } },
    async checked(query) { const result = await query; if (result.error) throw result.error; return result.data; },
    async load(client, id) {
        const [general, legacy, tracking, order] = await Promise.all([
            this.checked(client.from('checklist_analysis_general').select('item_name,status,observation').eq('service_order_id',id)),
            this.checked(client.from('checklist_analysis_caracol').select('item_name,status,observation').eq('service_order_id',id)),
            this.checked(client.from('component_tracking').select('*').eq('service_order_id',id)),
            this.checked(client.from('service_orders').select('status').eq('id',id).single())
        ]);
        const baseline = new Map();
        for (const row of [...(legacy || []), ...(general || [])]) if (this.isItem(row.item_name)) baseline.set(this.norm(row.item_name), row);
        const part = (tracking || []).find(row => this.isCT(row.component_name));
        const events = [];
        for (let offset = 0; ; offset += 500) {
            const rows = await this.checked(client.from('history_events').select('id,description').eq('service_order_id',id).eq('action',this.action).order('id',{ascending:true}).range(offset,offset+499));
            events.push(...(rows || [])); if ((rows || []).length < 500) break;
        }
        const ctx = { id, order, part, baseline:[...baseline.values()], entry:this.entry(part) };
        ctx.baselineSignature = this.signature(ctx.baseline);
        ctx.audit = events.reverse().map(event => this.parse(event)).find(audit => audit && audit.entry === ctx.entry && audit.baseline === ctx.baselineSignature);
        let validAudit=false;
        if(ctx.audit)try{this.prepare(ctx.audit.rows,ctx.audit.condemned,ctx.audit.reviewed);validAudit=true;}catch{}
        ctx.ready = validAudit && this.atBench(part) && !ProductionFlow.isClosed(order);
        return ctx;
    },
    prepare(rows, condemned, reviewed) {
        if (!reviewed) throw new Error('Confirme que conferiu o checklist 3 do Caracol.');
        if (condemned) return [{item_name:this.condemned,status:'TROCAR',observation:rows.find(r=>this.norm(r.item_name)===this.norm(this.condemned))?.observation || ''}];
        const names = new Set(rows.map(row=>this.norm(row.item_name)));
        if (names.size !== this.items.length || rows.length !== this.items.length || !this.items.every(name=>names.has(this.norm(name))) || rows.some(row=>!this.statuses.includes(row.status))) throw new Error('Confira todos os itens do checklist do Caracol.');
        if (rows.every(row=>row.status==='NÃO INFORMADO')) throw new Error('Preencha os vereditos do checklist do Caracol antes de validar.');
        return rows;
    },
    differences(rows, baseline) {
        const current = new Map(rows.map(row=>[this.norm(row.item_name),row]));
        const original = new Map(baseline.map(row=>[this.norm(row.item_name),row]));
        return [...new Set([...current.keys(),...original.keys()])].filter(key=>this.norm(current.get(key)?.status || 'NÃO INFORMADO')!==this.norm(original.get(key)?.status || 'NÃO INFORMADO'))
            .map(key=>({item_name:current.get(key)?.item_name || original.get(key).item_name,analysis:original.get(key)?.status || 'NÃO INFORMADO',bench:current.get(key)?.status || 'NÃO INFORMADO'}));
    },
    async save(client, id, expectedEntry, expectedBaseline, rows, condemned, reviewed, leader={}) {
        const ctx = await this.load(client,id);
        if (!this.atBench(ctx.part) || ProductionFlow.isClosed(ctx.order)) throw new Error('O Caracol não está mais na Bancada. Atualize a fila.');
        if (ctx.entry!==expectedEntry || ctx.baselineSignature!==expectedBaseline) throw new Error('A análise ou a entrada do Caracol mudou. Reabra a O.S. e confira novamente.');
        rows = this.prepare(rows,condemned,reviewed);
        const differences = this.differences(rows,ctx.baseline);
        Rework.validateLeader(differences.length>0,leader.authorized,leader.note);
        const {data,error} = await client.auth.getSession();
        if(error || !data?.session?.user) throw new Error('Entre no sistema para validar o checklist.');
        const user = data.session.user;
        const payload = {kind:'caracol_bancada_audit',entry:ctx.entry,baseline:ctx.baselineSignature,rows,condemned,reviewed:true,differences,
            leader_note:differences.length ? leader.note.trim() : '',user_id:user.id,user_name:user.user_metadata?.name || user.email,timestamp:new Date().toISOString()};
        await this.checked(client.from('history_events').insert({service_order_id:id,user_id:user.id,action:this.action,description:JSON.stringify(payload),
            details:`Checklist 3 do Caracol conferido na Bancada por ${payload.user_name}. ${differences.length ? 'Divergências autorizadas pelo líder. Tratamento: '+payload.leader_note : 'Sem divergências com a Análise Técnica.'}`,timestamp:payload.timestamp}));
        return payload;
    }
};
window.CaracolChecklist = CaracolChecklist;
