// Identidade única dos anexos ao longo de compras e produção.
const AccessoryFlow = {
    parts: [
        { name: 'ATUADOR', code: 'ATUADOR' },
        { name: 'GEOMETRIA VARIÁVEL', code: 'GEOMETRIA' },
        { name: 'CANOTE DA GEOMETRIA', code: 'CANOTE' },
        { name: 'FLANGE DA GEOMETRIA', code: 'FLANGE' }
    ],
    normalize(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    },
    part(name, allowCode = true) {
        return this.parts.find(p => (allowCode ? [p.name, p.code] : [p.name]).some(alias => this.normalize(alias) === this.normalize(name)));
    },
    decision(item) {
        const sales = this.normalize(item.decisao_vendas);
        const value = sales && sales !== 'PENDING' ? sales : this.normalize(item.status);
        if (['OK', 'PEÇA OK', 'PECA OK', 'APROVADO'].includes(value)) return 'OK';
        return ['RECONDICIONAR', 'TROCAR'].includes(value) ? value : null;
    },
    async routeApproved(client, orderId) {
        const results = await Promise.all([
            client.from('checklist_analysis_general').select('*').eq('service_order_id', orderId),
            client.from('triage_parts').select('*').eq('service_order_id', orderId),
            client.from('component_tracking').select('*').eq('service_order_id', orderId)
        ]);
        for (const result of results) if (result.error) throw result.error;
        const [analysis, receipts, tracking] = results.map(r => r.data || []);
        for (const item of analysis) {
            const part = this.part(item.item_name, false);
            const decision = this.decision(item);
            if (!part || !decision) continue;
            const receipt = receipts.find(r => this.part(r.part_name)?.code === part.code);
            const existing = tracking.find(t => this.part(t.component_name)?.code === part.code);
            const received = receipt?.availability === 'STOCK' && receipt.is_resolved === true;
            let stage = decision === 'RECONDICIONAR' ? 'DESMONTAGEM' : 'MONTAGEM';
            let status = decision === 'RECONDICIONAR' ? 'Aguardando' : 'PEÇA OK';
            if (decision === 'TROCAR') {
                stage = received ? 'MONTAGEM' : 'COMPRA';
                status = received ? 'ESTOQUE DISPONÍVEL' : 'AGUARDANDO_COMPRA';
                if (!received) {
                    const { error } = await client.from('triage_parts').upsert({
                        service_order_id: orderId, part_name: part.name,
                        availability: 'ORDER', is_resolved: false, resolved_at: null
                    }, { onConflict: 'service_order_id,part_name' });
                    if (error) throw error;
                }
            }
            // Repetir a aprovação não retrocede uma peça que já está em processamento.
            const keepProgress = existing?.verdict_vendas === decision &&
                !(decision === 'TROCAR' && (!received || existing.current_stage === 'COMPRA'));
            const { error: trackError } = await client.from('component_tracking').upsert({
                service_order_id: orderId, component_name: part.code,
                current_stage: keepProgress ? existing.current_stage : stage,
                current_sector: keepProgress ? existing.current_stage : stage,
                status: keepProgress ? existing.status : status,
                verdict_vendas: decision, last_update: new Date().toISOString()
            }, { onConflict: 'service_order_id,component_name' });
            if (trackError) throw trackError;
            const { error } = await client.from('checklist_analysis_general').update({
                availability: decision === 'TROCAR' && !received ? 'ORDER' : 'STOCK',
                is_resolved: decision !== 'TROCAR' || received
            }).eq('id', item.id);
            if (error) throw error;
        }
    }
};
window.AccessoryFlow = AccessoryFlow;
