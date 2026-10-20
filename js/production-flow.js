const ProductionFlow = {
    core: ['EIXO', 'ROTOR', 'CCE', 'REPAROS'],
    sectors: ['DESMONTAGEM', 'RETIFICA', 'SOLDA', 'METROLOGIA', 'BANCADA', 'BALANCEAMENTO', 'MONTAGEM'],
    normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(); },
    isClosed(order) {
        return ['FINALIZADO', 'FINALIZADA', 'CONCLUIDO', 'CONCLUIDA', 'ENTREGUE', 'CANCELADO', 'CANCELADA', 'ARQUIVADO', 'ARQUIVADA'].includes(this.normalize(order.status));
    },
    isProductionActive(order) {
        const status = this.normalize(order.status);
        return !this.isClosed(order) && !/QUALIDADE|EXPEDICAO|PRONTO PARA ENTREGA|STANDBY/.test(status);
    },
    async transitionOrder(client, id, status, fields = {}, allowed = []) {
        const { data: order, error: readError } = await client.from('service_orders').select('id,status').eq('id', id).maybeSingle();
        if (readError) throw readError;
        if (!order || (this.isClosed(order) && order.status !== status) || (allowed.length && order.status !== status && !allowed.includes(order.status))) {
            throw new Error('A O.S. não está mais nesta etapa. Atualize a fila.');
        }
        const now = new Date().toISOString();
        const { data: updated, error } = await client.from('service_orders').update({ ...fields, status, updated_at: now }).eq('id', id).eq('status', order.status).select('id').maybeSingle();
        if (error) throw error;
        if (!updated) throw new Error('A O.S. foi alterada em outra tela. Atualize a fila.');
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
    received(order) {
        return this.core.every(name => (order.purchase_parts || []).some(p => this.component(p.part_name) === name && p.availability === 'STOCK' && p.is_resolved === true));
    },
    tracking(order) {
        const list = order.full_tracking || order.tracking || [];
        const aggregate = list.find(t => this.component(t.component_name) === 'CONJUNTO ROTATIVO');
        if (!this.isNew(order) && !aggregate) return list;
        const members = list.filter(t => this.core.includes(this.component(t.component_name)));
        const commonStage = members.length === 4 && members.every(t => t.current_stage === members[0].current_stage) ? members[0].current_stage : 'MONTAGEM';
        const stage = Array.isArray(order.purchase_parts) && this.isNew(order) && !this.received(order) ? 'COMPRA' : (aggregate?.current_stage || commonStage);
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
    render(component, enabled = true) {
        const ctx = Rework.context();
        if (!ctx.id) return '';
        return `<div class="mt-3 w-full text-left" data-routing-component="${Rework.escape(component)}" data-routing-order="${Rework.escape(ctx.id)}">
            <label class="text-xs font-bold text-slate-600">Encaminhar / retornar para</label>
            <div class="flex flex-wrap gap-2 mt-1"><select aria-label="Setor de destino de ${Rework.escape(component)}" class="min-w-0 flex-1 border rounded-lg px-2 py-2 text-xs" ${!enabled ? 'disabled' : ''}>
                ${this.sectors.filter(s => s !== ctx.sector && (s !== 'BALANCEAMENTO' || ['EIXO', 'CONJUNTO ROTATIVO', 'PEÇA INTEIRA'].includes(this.component(component)))).map(s => `<option value="${s}">${s}</option>`).join('')}</select>
                <button type="button" data-routing-send ${!enabled ? 'disabled' : ''} class="bg-slate-700 text-white px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40">Encaminhar</button></div></div>`;
    },
    async move(component, target, options = {}) {
        const { id, sector } = Rework.context();
        if (!id || ![...this.sectors, 'QUALIDADE'].includes(target)) throw new Error('Setor ou O.S. inválidos.');
        if (!await Rework.ensureFinished()) return false;
        const client = Rework.client();
        const { data: order, error: orderReadError } = await client.from('service_orders').select('status').eq('id', id).maybeSingle();
        if (orderReadError) throw orderReadError;
        if (!order || this.isClosed(order)) throw new Error('Esta O.S. está encerrada. Atualize a fila.');
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
        if (target === 'BALANCEAMENTO' && !grouped && !['EIXO', 'PEÇA INTEIRA'].includes(name)) throw new Error('O Balanceamento recebe eixo, conjunto rotativo ou turbina completa.');
        const current = tracking.find(t => t.component_name === (grouped ? 'CONJUNTO ROTATIVO' : name));
        if (current && !['REABERTA', sector].includes(current.current_stage)) throw new Error('A peça já está em outro setor. Atualize a tela.');
        const names = whole ? [...new Set([...tracking.filter(t => t.current_stage === sector || this.coreNames().includes(t.component_name) || ['CT', 'CCO'].includes(t.component_name)).map(t => t.component_name), 'PEÇA INTEIRA'])] : grouped ? this.coreNames() : [name];
        const pending = receipts.some(p => names.includes(this.component(p.part_name)) && (p.availability === 'ORDER' || p.is_resolved !== true));
        if (pending) throw new Error('A peça ainda aguarda baixa de recebimento na Triagem.');
        const activeTimer = Object.keys(localStorage).some(key => names.some(part => key.startsWith(`timer_${id}_${part}_`) || key.startsWith(`timer_paused_${id}_${part}_`)) ||
            (sector === 'MONTAGEM' && (key.startsWith(`timer_${id}_MONTAGEM_`) || key.startsWith(`timer_paused_${id}_MONTAGEM_`))));
        if (activeTimer) throw new Error('Finalize os cronômetros dos serviços desta O.S. antes de encaminhar.');
        const note = options.note ?? prompt(`Motivo do encaminhamento de ${grouped ? 'CONJUNTO ROTATIVO' : name} para ${target}:`);
        if (note === null) return false;
        if (!note.trim()) throw new Error('Informe o motivo do encaminhamento.');
        const now = new Date().toISOString();
        const payload = names.map(part => {
            const existing = tracking.find(t => t.component_name === part);
            const logs = typeof existing?.tracking_data === 'string' ? JSON.parse(existing.tracking_data) : (existing?.tracking_data || []);
            return { service_order_id: id, component_name: part, current_stage: target, current_sector: target,
                status: options.status || (target === 'MONTAGEM' && name === 'EIXO' && sector === 'BALANCEAMENTO' ? 'BALANCEADO' : 'Aguardando'),
                executed_services: [...new Set([...(existing?.executed_services || []), ...(options.services || [])])],
                tracking_data: [...logs, { action: 'ROTEAMENTO', from: existing?.current_stage || sector, to: target, reason: note.trim(), timestamp: now }],
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
            action: 'ROTEAMENTO ENTRE SETORES', description: `${grouped ? 'CONJUNTO ROTATIVO' : name}: ${sector} → ${target}. Motivo: ${note.trim()}`, timestamp: now });
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
    await ProductionFlow.send(panel.dataset.routingComponent, panel.querySelector('select').value);
    button.disabled = false;
});
