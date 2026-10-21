// Prévia isolada: cliente em memória, sem autenticação ou gravação no Supabase real.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const test=fs.readFileSync(path.join(__dirname,'quality-flow.test.cjs'),'utf8');
const mock=test.slice(test.indexOf('const tables='),test.indexOf('const ctx='))
    .replace('const data=clone(rows.slice',"if(op!=='select')sessionStorage.setItem('quality-demo-fixture',JSON.stringify(tables));const data=clone(rows.slice");
const fixture=`const assert={ok(value){if(!value)throw Error('Campo inválido no teste');},deepEqual(){}};
${mock}
tables.service_orders=[{id:'quality-demo',business_id:'TESTE-QUALIDADE',status:'Aguardando Controle de Qualidade',updated_at:'2026-10-21T10:00:00Z',client:'DADOS FICTÍCIOS',model:'PRÉVIA LOCAL — SEM DADOS REAIS',serial_number:'DEMO-001',urgency:'Normal'}];
tables.component_tracking=['PEÇA INTEIRA','EIXO','ROTOR','CCE','REPAROS','CT','CCO'].map(component_name=>({service_order_id:'quality-demo',component_name,current_stage:'QUALIDADE',current_sector:'QUALIDADE',tracking_data:[],executed_services:[]}));
const cached=sessionStorage.getItem('quality-demo-fixture');if(cached){Object.assign(tables,JSON.parse(cached));next=Math.max(0,...Object.values(tables).flat().map(r=>Number(r.id)||0))+1;}
function fixtureReset(){sessionStorage.removeItem('quality-demo-fixture');location.reload();}
function fixtureReturn(){tables.service_orders[0].status='Aguardando Controle de Qualidade';tables.service_orders[0].updated_at=new Date().toISOString();tables.component_tracking.forEach(r=>{r.current_stage='QUALIDADE';r.current_sector='QUALIDADE';});sessionStorage.setItem('quality-demo-fixture',JSON.stringify(tables));location.reload();}
window.supabase={createClient:()=>client};
window.fetch=async()=>({ok:true});
`;
fs.writeFileSync(path.join(__dirname,'quality-fixture.js'),fixture);
let html=fs.readFileSync(path.join(root,'qualidade.html'),'utf8').replace('<head>','<head><base href="/">');
html=html.replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>','<script src="tests/quality-fixture.js"></script>');
html=html.replace('<script src="js/rework.js"></script>','<script src="js/rework.js"></script><script>Rework.context=()=>({order:selectedOS,id:selectedOS?.id,sector:"QUALIDADE"});</script>');
html=html.replace('<script src="js/auth.js"></script>','').replace('<script src="js/live-workflow.js"></script>','');
html=html.replace('<title>Setor de Qualidade | TurboSul</title>','<title>Prévia isolada da Qualidade — dados fictícios</title>');
html=html.replace('Resultados da Qualidade','PRÉVIA LOCAL — DADOS FICTÍCIOS');
html=html.replace('<div id="welcome-screen"','<div class="flex gap-3 text-xs"><button id="fixture-reset" onclick="fixtureReset()" class="border p-2 rounded">Reiniciar dados fictícios</button><button id="fixture-return" onclick="fixtureReturn()" class="border p-2 rounded">Simular retorno à Qualidade</button></div><div id="welcome-screen"');
fs.writeFileSync(path.join(__dirname,'quality-preview.html'),html);
console.log('Prévia em http://127.0.0.1:3000/tests/quality-preview.html — dados fictícios em memória');
