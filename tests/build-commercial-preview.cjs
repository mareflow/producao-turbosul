// Reproduz a fila e o formulário reais com leituras fictícias; escritas são proibidas.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const fixture = `
const fixtureOrder = {id:'commercial-demo',business_id:'ORÇ-003 (TESTE)',client:'DADOS FICTÍCIOS',model:'PRÉVIA ISOLADA DO COMERCIAL',status:'Aguardando Aprovação Comercial',urgency:'Urgente',updated_at:'2026-10-21T20:10:00Z',sector_pdfs:{},observation:'Teste local'};
const fixtureChecklist = ['EIXO','ROTOR','CCE','REPAROS','CCO','CT'].map(item_name=>({item_name,status:'PEÇA OK',decisao_vendas:'OK'}));
const fixtureClient = {from(table){let one=false;const q={select(){return q;},in(){return q;},eq(){return q;},single(){one=true;return q;},
then(resolve,reject){const rows=table==='service_orders'?[structuredClone(fixtureOrder)]:table==='checklist_analysis_general'?structuredClone(fixtureChecklist):[];return Promise.resolve({data:one?rows[0]||null:rows,error:null}).then(resolve,reject);}};return q;}};
window.supabase={createClient:()=>fixtureClient};
window.fetch=async()=>{throw Error('Prévia isolada: nenhum webhook ou backend é chamado');};
async function fixtureRefresh(){for(let i=0;i<30;i++)await loadSalesOrders(true);document.getElementById('fixture-result').textContent='30 atualizações executadas • '+document.querySelectorAll('#fila-de-vendas-container .os-card').length+' card na fila';}
document.addEventListener('DOMContentLoaded',()=>LiveWorkflow.watch(fixtureClient,quiet=>loadSalesOrders(quiet)));
`;
fs.writeFileSync(path.join(__dirname, 'commercial-fixture.js'), fixture);
let html = fs.readFileSync(path.join(root, 'comercial.html'), 'utf8').replace('<head>', '<head><base href="/">');
html = html.replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>', '<script src="tests/commercial-fixture.js"></script>');
html = html.replace('<script src="js/auth.js"></script>', '');
html = html.replace('<!-- CONTEÚDO PRINCIPAL (Layout de 2 Colunas) -->', '<div class="bg-amber-100 p-3 text-sm font-bold">PRÉVIA LOCAL — DADOS FICTÍCIOS — SEM GRAVAÇÃO NO BANCO <button onclick="fixtureRefresh()" class="ml-4 border border-slate-500 rounded px-3 py-1">Simular 30 atualizações</button><span id="fixture-result" class="ml-4"></span></div>');
fs.writeFileSync(path.join(__dirname, 'commercial-preview.html'), html);
console.log('Prévia em http://127.0.0.1:3000/tests/commercial-preview.html — dados fictícios');
