const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), source = fs.readFileSync(path.join(root, 'desmontagem.html'), 'utf8');
const start = source.indexOf('<div class="bg-slate-900 text-white rounded-xl p-4');
let depth = 0, end;
for (const tag of source.slice(start).matchAll(/<\/?div\b[^>]*>/g)) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (!depth) { end = start + tag.index + tag[0].length; break; }
}
if (!end) throw Error('Monitor não encontrado');
const fixture = `
let tables=JSON.parse(sessionStorage.getItem('general-demo')||'null')||{history_events:[],service_orders:[{id:'demo-1',status:'Aguardando Desmontagem OS'},{id:'demo-2',status:'Em Produção'}]};
const supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:'demo-operator',user_metadata:{name:'Operador de teste'}}}}})},from(table){let op='select',payload,filters=[],one=false,bounds;const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},order(){return q;},range(a,b){bounds=[a,b];return q;},single(){one=true;return q;},insert(p){op='insert';payload=p;return q;},update(p){op='update';payload=p;return q;},then(resolve,reject){let rows=tables[table].filter(r=>filters.every(f=>f(r)));if(op==='insert'){const row={id:tables.history_events.length+1,...payload};tables.history_events.push(row);rows=[row];}if(op==='update')rows.forEach(r=>Object.assign(r,payload));if(op!=='select')sessionStorage.setItem('general-demo',JSON.stringify(tables));if(bounds)rows=rows.slice(bounds[0],bounds[1]+1);return Promise.resolve({data:one?rows[0]||null:structuredClone(rows),error:null}).then(resolve,reject);}};return q;}};
async function showDemoPerformance(){const rows=await GeneralDisassembly.completed(supabaseClient);document.getElementById('demo-results').textContent=rows.length+' execuções concluídas · Total '+GeneralDisassembly.time(rows.reduce((s,r)=>s+r.duration_seconds,0))+' · Operador de teste';}
function selectDemo(id){document.getElementById('demo-selected').textContent=id==='demo-1'?'O.S. TESTE-001':'O.S. TESTE-002';GeneralDisassembly.select({id});}
`;
fs.writeFileSync(path.join(__dirname, 'general-disassembly-fixture.js'), fixture);
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><base href="/"><title>Prévia da desmontagem geral — dados fictícios</title><script src="https://cdn.tailwindcss.com"></script><script>tailwind.config={theme:{extend:{colors:{'turbo-teal':'#0d9488'}}}};</script><script src="tests/general-disassembly-fixture.js"></script><script src="js/general-disassembly.js"></script></head><body class="bg-slate-100 p-8"><h1 class="font-bold text-lg">DESMONTAGEM — PRÉVIA COM DADOS FICTÍCIOS</h1><p class="text-sm mb-4">Banco em memória; nenhuma gravação no Supabase real.</p><div class="flex gap-3 mb-5"><button class="bg-white border rounded px-3 py-2" onclick="selectDemo('demo-1')">Selecionar O.S. TESTE-001</button><button class="bg-white border rounded px-3 py-2" onclick="selectDemo('demo-2')">Selecionar O.S. TESTE-002</button></div><h2 id="demo-selected" class="font-bold mb-3">Selecione uma O.S.</h2>${source.slice(start, end)}<button class="bg-white border rounded px-3 py-2 mt-5" onclick="showDemoPerformance()">Consultar tempos concluídos</button><p id="demo-results" class="mt-3"></p></body></html>`;
fs.writeFileSync(path.join(__dirname, 'general-disassembly-preview.html'), html);
console.log('Prévia: http://127.0.0.1:3000/tests/general-disassembly-preview.html — somente dados fictícios');
