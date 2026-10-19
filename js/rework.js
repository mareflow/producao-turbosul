// Uma execução de retrabalho por evento: não sobrescreve tempos de serviços normais.
const Rework = {
    cache: new Map(), loading: new Map(), busy: new Set(), approvedChecklists: new Map(),
    validateLeader(hasDivergence, authorized, observation) {
        if (hasDivergence && (!authorized || !String(observation || '').trim())) {
            throw new Error('A divergência exige liberação do líder e observação sobre o que foi feito.');
        }
    },
    context() {
        const order = typeof currentSelection !== 'undefined' ? currentSelection :
            (typeof selectedOS !== 'undefined' ? selectedOS : null);
        const sector = location.pathname.split('/').pop().replace('.html', '').toUpperCase();
        return { order, id: order?.service_order_id || order?.os_id || order?.id, sector };
    },
    client() { return typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient; },
    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    parse(event) {
        try { const value = JSON.parse(event.details); return value.kind === 'rework_session' ? value : null; }
        catch { return null; }
    },
    async events(client, orderId) {
        const rows = [];
        for (let offset = 0; ; offset += 500) {
            let query = client.from('history_events').select('id, details, description').eq('action', 'RETRABALHO');
            if (orderId) query = query.eq('service_order_id', orderId);
            const { data, error } = await query.order('id', { ascending: true }).range(offset, offset + 499);
            if (error) throw error;
            rows.push(...(data || []));
            if ((data || []).length < 500) return rows;
        }
    },
    seconds(session, now = Date.now()) {
        return Math.max(0, Math.floor(session.duration_seconds || 0) +
            (session.state === 'running' ? Math.max(0, Math.floor((now - Date.parse(session.running_since)) / 1000)) : 0));
    },
    time(seconds) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; },
    transition(session, action, note = '', now = new Date().toISOString()) {
        const next = JSON.parse(JSON.stringify(session));
        if (action === 'resume') {
            if (session.state !== 'paused') throw new Error('Somente retrabalho pausado pode ser retomado.');
            if (!note.trim()) throw new Error('Descreva o que será feito no retrabalho.');
            next.state = 'running'; next.running_since = now;
            next.segments.push({ start_time: now, observation: note.trim() });
        } else {
            if (!['pause', 'finish'].includes(action) || session.state === 'finished') throw new Error('Execução já finalizada ou ação inválida.');
            if (action === 'pause' && session.state !== 'running') throw new Error('O retrabalho não está em execução.');
            next.duration_seconds = this.seconds(session, Date.parse(now));
            if (session.state === 'running') {
                next.segments[next.segments.length - 1].end_time = now;
            }
            next.running_since = null;
            next.state = action === 'finish' ? 'finished' : 'paused';
            if (action === 'finish') next.end_time = now;
        }
        return next;
    },
    async load(id, force = false) {
        if (!force && this.cache.has(id)) return;
        if (this.loading.has(id)) return this.loading.get(id);
        const work = (async () => {
            const data = await this.events(this.client(), id);
            this.cache.set(id, data.map(event => ({ ...this.parse(event), event_id: event.id, stored_details: event.details })).filter(s => s.kind));
        })();
        this.loading.set(id, work);
        try { await work; } finally { this.loading.delete(id); }
    },
    async ensureFinished(component) {
        const { id, sector } = this.context();
        if (!id) return false;
        try {
            await this.load(id, true);
            const active = this.cache.get(id).some(s => s.sector === sector && s.state !== 'finished' && (!component || s.component.toUpperCase() === component.toUpperCase()));
            if (active) { alert('Finalize o retrabalho aberto antes de encaminhar a peça ou concluir a etapa.'); return false; }
            return true;
        } catch (error) { alert('Não foi possível conferir o retrabalho: ' + error.message); return false; }
    },
    render(component, enabled = true) {
        const ctx = this.context();
        if (!ctx.id) return '';
        if (!this.cache.has(ctx.id)) this.load(ctx.id).then(() => this.refresh()).catch(() => this.refresh());
        return `<section data-rework-order="${this.escape(ctx.id)}" data-rework-sector="${this.escape(ctx.sector)}" data-rework-component="${this.escape(component)}" data-rework-enabled="${enabled}">
            ${this.body(ctx.id, ctx.sector, component, enabled)}</section>`;
    },
    body(id, sector, component, enabled) {
        const sessions = (this.cache.get(id) || []).filter(s => s.sector === sector && s.component === component);
        const active = sessions.find(s => s.state !== 'finished');
        const total = sessions.reduce((sum, s) => sum + this.seconds(s), 0);
        const time = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        const button = (action, label) => `<button type="button" data-rework-action="${action}" ${!enabled ? 'disabled' : ''} class="px-3 py-2 rounded-lg text-xs font-bold bg-red-600 text-white disabled:opacity-40">${label}</button>`;
        return `<div class="my-4 p-3 border border-red-200 rounded-xl bg-red-50 text-left w-full">
            <details ${active ? 'open' : ''}><summary class="cursor-pointer font-black text-xs uppercase text-red-700">Retrabalho · Total <span data-rework-total>${time(total)}</span></summary>
            <p class="text-xs text-slate-600 mt-2">Observação obrigatória a cada início ou retomada.</p>
            ${active ? `<p class="text-xs font-bold mt-2">${active.state === 'running' ? 'Em execução' : 'Pausado'} · <span data-rework-elapsed>${time(this.seconds(active))}</span></p><p class="text-xs mt-1 whitespace-pre-wrap">${this.escape(active.segments.at(-1)?.observation || active.observation)}</p>` : ''}
            <div class="flex flex-wrap gap-2 mt-3">${active ? (active.state === 'running' ? button('pause', 'Pausar') : button('resume', 'Retomar')) + button('finish', 'Finalizar') : button('start', 'Iniciar retrabalho')}</div>
            ${!this.cache.has(id) ? '<p class="text-xs mt-2">Aguardando leitura dos registros. Clique em iniciar para tentar novamente.</p>' : ''}
            <div class="mt-3 space-y-2">${sessions.filter(s => s.state === 'finished').map(s => `<p class="text-xs border-t border-red-100 pt-2"><b>${time(s.duration_seconds)}</b> · ${this.escape(s.user_name || 'Operador')}<br>${s.segments.map(segment => this.escape(segment.observation)).join('<br>')}</p>`).join('')}</div>
            </details></div>`;
    },
    refresh() {
        document.querySelectorAll('[data-rework-order]').forEach(panel => {
            const sessions = (this.cache.get(panel.dataset.reworkOrder) || []).filter(s => s.sector === panel.dataset.reworkSector && s.component === panel.dataset.reworkComponent);
            const signature = JSON.stringify(sessions) + this.cache.has(panel.dataset.reworkOrder);
            if (panel.reworkSignature === signature) {
                const total = panel.querySelector('[data-rework-total]');
                if (total) total.textContent = this.time(sessions.reduce((sum, s) => sum + this.seconds(s), 0));
                const active = sessions.find(s => s.state !== 'finished');
                const elapsed = panel.querySelector('[data-rework-elapsed]');
                if (elapsed && active) elapsed.textContent = this.time(this.seconds(active));
                return;
            }
            panel.reworkSignature = signature;
            const open = panel.querySelector('details')?.open;
            panel.innerHTML = this.body(panel.dataset.reworkOrder, panel.dataset.reworkSector, panel.dataset.reworkComponent, panel.dataset.reworkEnabled === 'true');
            if (open) panel.querySelector('details').open = true;
        });
    },
    requestNote() {
        return new Promise(resolve => {
            const dialog = document.createElement('dialog');
            dialog.className = 'rounded-2xl p-6 w-full max-w-lg shadow-2xl';
            dialog.innerHTML = `<form><h3 class="font-black text-lg">Observação do retrabalho</h3><p class="text-sm my-3">Descreva o que será refeito e o motivo.</p><textarea required aria-label="Observação do retrabalho" rows="4" class="w-full border rounded-lg p-3"></textarea><p role="alert" class="text-red-600 text-sm"></p><div class="flex justify-end gap-3 mt-4"><button type="button" data-cancel>Cancelar</button><button type="submit" class="bg-red-600 text-white rounded-lg px-4 py-2">Iniciar contagem</button></div></form>`;
            const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
            dialog.querySelector('[data-cancel]').onclick = () => finish(null);
            dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
            dialog.querySelector('form').onsubmit = event => {
                event.preventDefault();
                const note = dialog.querySelector('textarea').value.trim();
                if (!note) { dialog.querySelector('[role="alert"]').textContent = 'A observação é obrigatória.'; return; }
                finish(note);
            };
            document.body.appendChild(dialog); dialog.showModal();
        });
    },
    async act(panel, action) {
        const { reworkOrder: id, reworkSector: sector, reworkComponent: component } = panel.dataset;
        const key = `${id}:${sector}:${component}`;
        if (this.busy.has(key) || panel.dataset.reworkEnabled !== 'true') return;
        this.busy.add(key);
        try {
            const note = ['start', 'resume'].includes(action) ? await this.requestNote() : '';
            if (note === null) return;
            if (['start', 'resume'].includes(action) && !note.trim()) throw new Error('A observação do retrabalho é obrigatória.');
            await this.load(id, true);
            const sessions = this.cache.get(id);
            const active = sessions.find(s => s.sector === sector && s.component === component && s.state !== 'finished');
            const { data: { session }, error: authError } = await this.client().auth.getSession();
            if (authError || !session) throw new Error('Entre no sistema para registrar retrabalho.');
            let next;
            if (action === 'start') {
                if (active) throw new Error('Já existe um retrabalho aberto para esta peça neste setor.');
                const now = new Date().toISOString();
                next = { kind: 'rework_session', session_id: crypto.randomUUID(), component, sector, service: 'RETRABALHO',
                    observation: note, user_id: session.user.id, user_name: session.user.user_metadata?.name || session.user.email,
                    start_time: now, running_since: now, duration_seconds: 0, state: 'running', segments: [{ start_time: now, observation: note }] };
            } else {
                if (!active) throw new Error('Nenhum retrabalho aberto para esta peça.');
                next = this.transition(active, action, note);
            }
            delete next.event_id; delete next.stored_details;
            const status = { running: 'Em execução', paused: 'Pausado', finished: 'Finalizado' }[next.state];
            const description = `Retrabalho ${status}: ${component} / ${sector}. Observações: ${next.segments.map(s => s.observation).join(' | ')}. Tempo registrado: ${Math.floor(next.duration_seconds / 60)}m ${next.duration_seconds % 60}s.`;
            const payload = { action: 'RETRABALHO', details: JSON.stringify(next), description };
            let result;
            if (active) result = await this.client().from('history_events').update(payload).eq('id', active.event_id).eq('details', active.stored_details).select('id').single();
            else result = await this.client().from('history_events').insert({ ...payload, service_order_id: id, user_id: session.user.id, timestamp: next.start_time }).select('id').single();
            if (result.error) throw result.error;
            await this.load(id, true); this.refresh();
        } catch (error) { alert('Não foi possível registrar o retrabalho: ' + (error.message || error)); }
        finally { this.busy.delete(key); }
    }
};
window.Rework = Rework;
document.addEventListener('click', event => {
    const button = event.target.closest('[data-rework-action]');
    if (button) Rework.act(button.closest('[data-rework-order]'), button.dataset.reworkAction);
});
setInterval(() => Rework.refresh(), 1000);
