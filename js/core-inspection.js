// Uma conferência por chegada: aprovação e reposição não apagam não conformidades anteriores.
const CoreInspection = {
    drafts: new Map(),
    render(order, component) {
        if (ProductionFlow.component(component) !== 'CONJUNTO ROTATIVO' || !ProductionFlow.isNew(order)) return '';
        const state = ProductionFlow.coreInspection(order), e = Rework.escape;
        if (!state.receipt) return '<p class="mb-4 text-xs text-amber-800">Recebimento sem conferência cadastrada. Atualize a fila.</p>';
        if (state.review) return `<p class="mb-4 text-xs font-bold ${state.approved?'text-emerald-700':'text-red-700'}">Conferência: ${e(state.review.result)} — ${e(state.review.note)}</p>`;
        return `<section class="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-300" data-core-inspection data-order="${e(order.id || order.service_order_id || order.os_id)}" data-receipt="${e(state.receipt.receipt_id)}">
            <h5 class="text-sm font-black text-amber-950">Conferência do conjunto novo</h5>
            <p class="mt-2 text-xs text-amber-900">Confira se o conjunto recebido corresponde à O.S. e está correto para uso. Só a aprovação libera a Montagem. A reprovação registra a não conformidade e abre reposição na Triagem.</p>
            <label class="block mt-3 text-xs font-bold text-amber-950">Resultado da análise / motivo da não conformidade
                <textarea data-core-note required rows="3" class="mt-2 w-full p-3 rounded-lg border border-amber-300 bg-white text-sm text-slate-800" placeholder="Descreva o que foi conferido ou o problema encontrado">${e(this.drafts.get(state.receipt.receipt_id) || '')}</textarea>
            </label>
            <div class="flex flex-wrap gap-2 mt-3"><button type="button" data-core-decision="APPROVE" class="bg-emerald-600 text-white font-bold text-xs px-4 py-3 rounded-lg">Aprovar e enviar à Montagem</button>
            <button type="button" data-core-decision="REJECT" class="bg-red-600 text-white font-bold text-xs px-4 py-3 rounded-lg">Registrar não conformidade e pedir reposição</button></div>
            <p data-core-error role="alert" class="mt-2 text-xs text-red-700"></p></section>`;
    },
    async decide(panel, approved) {
        const ctx = Rework.context(), error = panel.querySelector('[data-core-error]');
        error.textContent = '';
        if (ctx.id !== panel.dataset.order || ctx.sector !== 'BANCADA') throw new Error('Selecione novamente a O.S. na Bancada.');
        const note = panel.querySelector('[data-core-note]').value.trim();
        if (!note) {panel.querySelector('[data-core-note]').focus();throw new Error('Informe o resultado da análise e, na reprovação, o motivo da não conformidade.');}
        if (!await Rework.ensureFinished()) return false;
        const names = ProductionFlow.fullNames();
        if (Object.keys(localStorage).some(key => names.some(name => key.startsWith(`timer_${ctx.id}_${name}_`) || key.startsWith(`timer_paused_${ctx.id}_${name}_`)))) {
            throw new Error('Finalize os cronômetros do conjunto antes de concluir a conferência.');
        }
        if (!confirm(approved ? 'Aprovar o conjunto conferido e encaminhar à Montagem?' : 'Registrar a não conformidade e abrir uma solicitação de reposição na Triagem? O motivo ficará no histórico da peça.')) return false;
        const {error:failure} = await Rework.client().rpc('inspect_new_core',{p_order:ctx.id,p_receipt:panel.dataset.receipt,p_approved:approved,p_note:note});
        if (failure) throw failure;
        this.drafts.delete(panel.dataset.receipt);
        alert(approved ? 'Conjunto aprovado e encaminhado à Montagem.' : 'Não conformidade registrada. Reposição pendente na Triagem.');
        location.reload();return true;
    }
};
window.CoreInspection = CoreInspection;
document.addEventListener('click',async event => {
    const button = event.target.closest('[data-core-decision]');if (!button) return;
    const panel = button.closest('[data-core-inspection]'),buttons=panel.querySelectorAll('button');
    buttons.forEach(item=>item.disabled=true);
    try {await CoreInspection.decide(panel,button.dataset.coreDecision==='APPROVE');}
    catch(error){panel.querySelector('[data-core-error]').textContent=error.message;}
    finally{buttons.forEach(item=>item.disabled=false);}
});

document.addEventListener('input',event => {
    if (!event.target.matches('[data-core-note]')) return;
    const panel=event.target.closest('[data-core-inspection]');
    if (panel) CoreInspection.drafts.set(panel.dataset.receipt,event.target.value);
});
