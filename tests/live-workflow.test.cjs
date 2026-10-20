const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let next = 0;
const timeouts = new Map(), intervals = new Map(), events = new Map();
const addEventListener = (name, fn) => events.set(name, fn);
const removeEventListener = name => events.delete(name);
const document = {hidden:false, addEventListener, removeEventListener};
const context = vm.createContext({window:{addEventListener,removeEventListener}, document, location:{pathname:'/admin.html'}, console,
    setTimeout(fn) {timeouts.set(++next,fn);return next;}, clearTimeout(id){timeouts.delete(id);},
    setInterval(fn,ms){intervals.set(++next,{fn,ms});return next;}, clearInterval(id){intervals.delete(id);}});
vm.runInContext(fs.readFileSync('js/live-workflow.js','utf8'),context);
async function tick(){const jobs=[...timeouts.values()];timeouts.clear();for(const fn of jobs)await fn();}
(async()=>{
    let refreshes=0, status='Aguardando Análise Técnica', changed=[], release;
    const controller=context.window.LiveWorkflow.watch({},async quiet=>{
        assert.equal(quiet,true,'Atualização não deve sobrescrever formulários');refreshes++;
        if(release==='wait')await new Promise(resolve=>{release=resolve;});
        status='Aguardando Triagem';
    },{snapshot:()=>new Map([['001',status]]),onRefresh:ids=>{changed=ids;}});
    assert.equal([...intervals.values()][0].ms,5000);
    controller.request();controller.request();controller.request();await tick();
    assert.equal(refreshes,1,'Atualizações próximas são agrupadas');assert.deepEqual(Array.from(changed),['001']);
    release='wait';controller.request();const pending=tick();await Promise.resolve();
    controller.request();await tick();assert.equal(refreshes,2,'Não pode iniciar consultas sobrepostas');
    release();await pending;await tick();assert.equal(refreshes,3,'Mudança durante consulta é atendida depois');
    document.hidden=true;controller.request();await tick();assert.equal(refreshes,3);
    document.hidden=false;events.get('visibilitychange')();await tick();assert.equal(refreshes,4);
    events.get('online')();await tick();assert.equal(refreshes,5);
    controller.stop();assert.equal(intervals.size,0);controller.request();await tick();assert.equal(refreshes,5);
    console.log('OK: atualização em 5 s, agrupamento, consultas sequenciais, reconexão, aba suspensa e preservação do formulário');
})().catch(error=>{console.error(error);process.exitCode=1;});
