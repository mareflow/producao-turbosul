// Serviço da O.S.: não cria componentes nem interfere em seu roteamento.
const GeneralDisassembly = {
    action: 'DESMONTAGEM GERAL DA PEÇA', service: 'Desmontagem geral da peça',
    cache: new Map(), loading: new Map(), busy: false, selectedId: null, error: '',
    client() { return typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient; },
    parse(event) {
        // details é legível em todos os históricos; description guarda a sessão estruturada.
        try { const value = JSON.parse(event.description); return value.kind === 'general_disassembly_session' ? value : null; }
        catch { return null; }
    },
    seconds(session, now = Date.now()) {
        return Math.max(0, Number(session.duration_seconds) || 0) + (session.state === 'running'
            ? Math.max(0, Math.floor((now - Date.parse(session.running_since)) / 1000) || 0) : 0);
    },
    time(seconds) {
        return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    },
    transition(session, action, now = new Date().toISOString()) {
        const next = { ...session };
        if (action === 'resume' && session.state === 'paused') {
            next.state = 'running'; next.running_since = now;
        } else if ((action === 'pause' && session.state === 'running') || (action === 'finish' && ['paused', 'running'].includes(session.state))) {
            next.duration_seconds = this.seconds(session, Date.parse(now));
            next.running_since = null; next.state = action === 'finish' ? 'finished' : 'paused';
            if (action === 'finish') next.end_time = now;
        } else throw new Error('A contagem foi alterada. Atualize os dados e tente novamente.');
        return next;
    },
    async events(client, id, ids) {
        const rows = [];
        for (let offset = 0; ; offset += 500) {
            let query = client.from('history_events').select('id, service_order_id, description').eq('action', this.action);
            if (id) query = query.eq('service_order_id', id);
            if (ids) query = query.in('service_order_id', ids);
            const { data, error } = await query.order('id', { ascending: true }).range(offset, offset + 499);
            if (error) throw error;
            rows.push(...(data || []));
            if ((data || []).length < 500) return rows;
        }
    },
    async sessions(client, id) {
        return (await this.events(client, id)).map(event => {
            const value = this.parse(event);
            return value ? { ...value, event_id: event.id, stored_description: event.description } : null;
        }).filter(Boolean);
    },
    async completed(client) { return (await this.sessions(client)).filter(s => s.state === 'finished'); },
    async openOrderIds(client, ids) {
        return new Set((await this.events(client, null, ids)).filter(event => {
            const session = this.parse(event); return session && session.state !== 'finished';
        }).map(event => event.service_order_id));
    },
    async change(client, orderId, action) {
        const { data, error: authError } = await client.auth.getSession();
        const user = data?.session?.user;
        if (authError || !user) throw new Error('Entre no sistema para registrar a desmontagem geral.');
        const active = (await this.sessions(client, orderId)).find(s => s.state !== 'finished');
        const now = new Date().toISOString();
        let next;
        if (action === 'start') {
            if (active) throw new Error('Já existe uma desmontagem geral aberta para esta O.S.');
            const { data: order, error } = await client.from('service_orders').select('status').eq('id', orderId).single();
            if (error) throw error;
            if (!order || !['Em Produção', 'Aguardando Desmontagem OS', 'Em Desmontagem Operacional'].includes(order.status)) {
                throw new Error('A O.S. não está mais em produção. Atualize a fila.');
            }
            next = { kind: 'general_disassembly_session', service: this.service, sector: 'DESMONTAGEM',
                session_id: crypto.randomUUID(), user_id: user.id, user_name: user.user_metadata?.name || user.email || 'Operador',
                start_time: now, running_since: now, duration_seconds: 0, state: 'running' };
        } else {
            if (!active) throw new Error('Não há uma desmontagem geral aberta nesta O.S.');
            if (active.user_id !== user.id) throw new Error('Esta contagem pertence a ' + active.user_name + '. O operador que iniciou deve pausá-la ou finalizá-la.');
            next = this.transition(active, action, now);
        }
        delete next.event_id; delete next.stored_description;
        const status = { running: 'Em execução', paused: 'Pausada', finished: 'Finalizada' }[next.state];
        const payload = { action: this.action, description: JSON.stringify(next),
            details: `${this.service} — ${status}. Operador: ${next.user_name}. Tempo registrado: ${this.time(next.duration_seconds)}.` };
        const result = active ? await client.from('history_events').update(payload).eq('id', active.event_id)
            .eq('description', active.stored_description).select('id').single()
            : await client.from('history_events').insert({ ...payload, service_order_id: orderId, user_id: user.id, timestamp: now }).select('id').single();
        if (result.error) throw result.error;
        if (!result.data) throw new Error('Não foi possível confirmar a gravação da contagem.');
        return next;
    },
    async load(id) {
        if (this.loading.has(id)) return this.loading.get(id);
        const task = this.sessions(this.client(), id).then(sessions => { this.cache.set(id, sessions); });
        this.loading.set(id, task);
        try { await task; } finally { this.loading.delete(id); }
    },
    async select(order) {
        const id = order?.id;
        this.selectedId = id; this.error = ''; this.paint();
        if (!id) return;
        try { await this.load(id); } catch (error) { if (this.selectedId === id) this.error = 'Não foi possível carregar a contagem. ' + error.message; }
        if (this.selectedId === id) this.paint();
    },
    paint() {
        const panel = document.getElementById('general-disassembly-monitor');
        if (!panel) return;
        const sessions = this.cache.get(this.selectedId) || [], active = sessions.find(s => s.state !== 'finished');
        panel.querySelector('[data-general-total]').textContent = this.time(sessions.reduce((sum, s) => sum + this.seconds(s), 0));
        panel.querySelector('[data-general-state]').textContent = !this.selectedId ? 'Selecione uma O.S.' : !this.cache.has(this.selectedId) ? 'Carregando contagem...' : active
            ? `${active.state === 'running' ? 'Em execução' : 'Pausada'} · ${active.user_name} · ${this.time(this.seconds(active))}` : 'Pronto para iniciar';
        panel.querySelector('[data-general-error]').textContent = this.error;
        panel.querySelectorAll('[data-general-action]').forEach(button => {
            const action = button.dataset.generalAction;
            button.hidden = action === 'start' ? !!active : action === 'resume' ? active?.state !== 'paused' : action === 'pause' ? active?.state !== 'running' : !active;
            button.disabled = this.busy || !this.selectedId;
        });
    },
    async act(action) {
        if (this.busy || !this.selectedId) return;
        const id = this.selectedId;
        this.busy = true; this.error = ''; this.paint();
        try {
            if (this.loading.has(id)) await this.loading.get(id);
            await this.change(this.client(), id, action);
        }
        catch (error) { if (this.selectedId === id) this.error = 'Não foi possível registrar: ' + error.message; }
        finally {
            try { await this.load(id); } catch (error) { if (this.selectedId === id) this.error = 'Não foi possível atualizar a contagem: ' + error.message; }
            this.busy = false; this.paint();
        }
    },
    async ensureFinished(orderId) {
        try {
            await this.load(orderId);
            if (this.cache.get(orderId).some(s => s.state !== 'finished')) {
                this.error = 'Finalize a desmontagem geral antes de concluir esta etapa.'; this.paint(); return false;
            }
            return true;
        } catch (error) { this.error = 'Não foi possível conferir a contagem: ' + error.message; this.paint(); return false; }
    },
    init() {
        const panel = document.getElementById('general-disassembly-monitor');
        if (!panel) return;
        panel.addEventListener('click', event => {
            const button = event.target.closest('[data-general-action]');
            if (button) this.act(button.dataset.generalAction);
        });
        this.paint();
        setInterval(() => this.paint(), 1000);
        setInterval(async () => {
            if (document.hidden || !this.selectedId || this.busy) return;
            const id = this.selectedId;
            try { await this.load(id); } catch (error) { if (id === this.selectedId) this.error = 'Não foi possível atualizar a contagem: ' + error.message; }
            if (id === this.selectedId) this.paint();
        }, 5000);
    }
};
window.GeneralDisassembly = GeneralDisassembly;
document.addEventListener('DOMContentLoaded', () => GeneralDisassembly.init());
