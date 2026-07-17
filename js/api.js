// js/api.js
const API_BASE_URL = 'https://webhook.mareflow.com.br/webhook';
const API_ENDPOINTS = {
    TRIAGE_GET: `${API_BASE_URL}/logistics/triage`,
    TRIAGE_POST: `${API_BASE_URL}/logistics/save-triage`,
    SYNC_PART: `${API_BASE_URL}/logistics/sync-part`,
    PREVENDAS_GET: `https://teste.mareflow.com.br/webhook/orders/pending-dispatch`,
    PREVENDAS_POST: `https://teste.mareflow.com.br/webhook/orders/new-entry`,
    PREVENDAS_DISPATCH: `https://teste.mareflow.com.br/webhook/orders/dispatch-to-analysis`,
    WELDING_QUEUE: `${API_BASE_URL}/production/welding-queue`,
    COMPONENT_ROUTING: `${API_BASE_URL}/production/component-routing`,
    RECTIFICATION_QUEUE: `${API_BASE_URL}/production/rectification-queue`
    // Outros endpoints podem ser adicionados aqui
};
