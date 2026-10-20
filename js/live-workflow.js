// Filas atualizadas sem recarregar a página nem substituir formulários em edição.
const LiveWorkflow = {
    watch(client, refresh, options = {}) {
        let timer, running = false, pending = false, stopped = false;
        const changes = new Set();
        const state = { refreshes: 0, lastRefresh: null };
        const request = (payload) => {
            const id = payload?.new?.service_order_id || payload?.new?.id || payload?.old?.service_order_id || payload?.old?.id;
            if (id) changes.add(id);
            pending = true;
            clearTimeout(timer);
            timer = setTimeout(run, 600);
        };
        const run = async () => {
            if (stopped || document.hidden || running || !pending) return;
            running = true; pending = false;
            const ids = [...changes]; changes.clear();
            const before = options.snapshot?.() || new Map();
            try {
                const result = await refresh(true);
                if (result === false) throw new Error('Não foi possível atualizar a fila.');
                state.refreshes++; state.lastRefresh = new Date().toISOString();
                const after = options.snapshot?.() || new Map();
                for (const id of new Set([...before.keys(), ...after.keys()])) if (before.get(id) !== after.get(id)) ids.push(id);
                options.onRefresh?.(ids);
            } catch (error) { console.warn('Atualização da fila:', error); options.onError?.(error); }
            finally { running = false; if (pending) request(); }
        };
        // Usa as consultas autenticadas já existentes, sem novas publicações de dados.
        const interval = setInterval(() => { if (!document.hidden) request(); }, 5000);
        const visible = () => { if (!document.hidden) request(); };
        document.addEventListener('visibilitychange', visible);
        window.addEventListener('focus', visible);
        window.addEventListener('online', visible);
        const stop = () => {
            stopped = true; clearTimeout(timer); clearInterval(interval);
            document.removeEventListener('visibilitychange', visible);
            window.removeEventListener('focus', visible); window.removeEventListener('online', visible);
        };
        window.addEventListener('pagehide', stop, { once: true });
        return { state, request, stop };
    },
    snapshot() {
        const orders = typeof allOrders !== 'undefined' ? allOrders : typeof currentOrders !== 'undefined' ? currentOrders : typeof queueData !== 'undefined' ? queueData : [];
        return new Map(orders.map(order => [order.service_order_id || order.os_id || order.id, JSON.stringify(order)]));
    },
    init() {
        const page = location.pathname.split('/').pop().replace('.html', '');
        const loaders = { 'pre-vendas': 'loadPendingOrders', 'analise-tecnica': 'loadAnalysisOrders', comercial: 'loadSalesOrders',
            triagem: 'carregarDados', desmontagem: 'loadDisassemblyQueue', admin: 'loadAdminDashboard', 'quadro-producao': 'loadOrders',
            retifica: 'fetchQueue', solda: 'fetchQueue', metrologia: 'fetchQueue', bancada: 'fetchQueue', balanceamento: 'fetchQueue',
            montagem: 'fetchQueue', qualidade: 'fetchQueue', expedicao: 'fetchQueue' };
        const refresh = window[loaders[page]];
        const client = typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient;
        if (!client || !refresh) return;
        const badge = document.createElement('div');
        badge.className = 'fixed bottom-2 right-3 z-40 rounded-lg bg-white border border-slate-200 px-2 py-1 text-[10px] text-slate-500 shadow-sm';
        badge.setAttribute('aria-live', 'polite');
        badge.dataset.liveWorkflow = 'ACTIVE'; badge.textContent = 'Atualização automática • a cada 5 s';
        document.body.append(badge);
        this.controller = this.watch(client, refresh, {
            snapshot: () => this.snapshot(),
            onError() { badge.textContent = 'Atualização indisponível • tentando novamente'; },
            onRefresh(ids) {
                badge.dataset.lastRefresh = new Date().toISOString();
                badge.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR') + ' • automático';
                const selected = typeof currentSelection !== 'undefined' ? currentSelection : typeof selectedOS !== 'undefined' ? selectedOS : typeof selecionada !== 'undefined' ? selecionada : null;
                const id = selected?.service_order_id || selected?.os_id || selected?.id || (typeof activeOSId !== 'undefined' ? activeOSId : null);
                if (!id || !ids.includes(id)) return;
                let notice = document.getElementById('workflow-changed-notice');
                if (!notice) {
                    notice = document.createElement('button'); notice.type = 'button'; notice.id = 'workflow-changed-notice';
                    notice.className = 'fixed bottom-10 right-3 z-40 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 px-3 py-2 text-xs shadow-md';
                    notice.textContent = 'Esta O.S. foi atualizada. Clique para recarregar os detalhes.';
                    notice.onclick = () => location.reload(); document.body.append(notice);
                }
            }
        });
    }
};
window.LiveWorkflow = LiveWorkflow;
document.addEventListener('DOMContentLoaded', () => LiveWorkflow.init());
