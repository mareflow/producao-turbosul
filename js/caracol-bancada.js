const CaracolBancada = {
    state:null, token:0, dirty:false, busy:false,
    id() { return selectedOS?.id || selectedOS?.service_order_id || selectedOS?.os_id; },
    panel() { return document.getElementById('caracol-bancada-panel'); },
    escape(value) { return Rework.escape(value); },
    ready(component) { return !CaracolChecklist.isCT(component) || !!this.state?.ready && !this.dirty && this.state.id===this.id(); },
    notice(text) { const node=this.panel()?.querySelector('[data-caracol-message]'); if(node)node.textContent=text; },
    async select() {
        const token=++this.token,id=this.id(); this.state=null;this.dirty=false;this.busy=false;
        this.panel().hidden=true;
        const ct=(selectedOS.full_tracking || selectedOS.tracking || []).find(row=>CaracolChecklist.isCT(row.component_name));
        if(!CaracolChecklist.atBench(ct))return;
        this.panel().hidden=false;this.panel().innerHTML='<p class="p-5 text-sm">Carregando checklist 3 do Caracol...</p>';
        try {
            const ctx=await CaracolChecklist.load(supabaseClient,id);
            if(token!==this.token || id!==this.id())return;
            this.state=ctx;this.draw();renderComponents();
        } catch(error) { if(token===this.token)this.panel().innerHTML=`<p class="p-5 text-sm text-red-700">Não foi possível carregar o checklist: ${this.escape(error.message)}. Selecione a O.S. para tentar novamente.</p>`; }
    },
    draw() {
        const ctx=this.state;if(!ctx)return;
        const original=new Map(ctx.baseline.map(row=>[CaracolChecklist.norm(row.item_name),row]));
        const saved=new Map((ctx.audit?.rows || []).map(row=>[CaracolChecklist.norm(row.item_name),row]));
        const condemned=ctx.audit ? ctx.audit.condemned : original.has(CaracolChecklist.norm(CaracolChecklist.condemned));
        this.panel().innerHTML=`<div class="p-5 border-b border-slate-200"><h3 class="font-black text-slate-800 uppercase text-sm">3. Checklist do Caracol (Caixa Quente)</h3><p class="text-xs text-slate-500 mt-1">A revisão pode ser feita durante os serviços. Compare com a Análise Técnica e valide antes de encaminhar a CT para outro setor.</p><p data-caracol-message role="status" class="mt-2 text-xs font-bold text-indigo-700">${ctx.ready?'Checklist validado para esta entrada na Bancada.':'Validação pendente: os serviços estão liberados, mas o encaminhamento da CT está bloqueado.'}</p></div>
        <form class="p-5 space-y-4"><label class="flex gap-2 items-center text-sm font-bold text-red-700"><input type="checkbox" data-caracol-condemned ${condemned?'checked':''}> Condenar Caracol completo (trocar)</label>
        <div data-caracol-items ${condemned?'hidden':''} class="space-y-2">${CaracolChecklist.items.map((name,index)=>{
            const key=CaracolChecklist.norm(name),base=original.get(key),row=saved.get(key)||base;
            return `<div data-caracol-row data-index="${index}" class="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 border rounded-xl"><div class="text-xs font-bold">${this.escape(name)}<p class="mt-1 font-normal text-slate-500">Análise: ${this.escape(base?.status || 'NÃO INFORMADO')}</p>${base?.observation?`<p class="font-normal text-slate-500">${this.escape(base.observation)}</p>`:''}</div><label class="text-xs">Veredito na Bancada<select data-caracol-status class="block w-full border rounded-lg p-2 mt-1">${CaracolChecklist.statuses.map(status=>`<option ${status===(row?.status||'NÃO INFORMADO')?'selected':''}>${status}</option>`).join('')}</select></label><label class="text-xs">Observação<input data-caracol-note class="block border rounded-lg p-2 w-full mt-1" value="${this.escape(row?.observation||'')}"></label></div>`;
        }).join('')}</div>
        <label class="flex items-center gap-2 text-xs font-bold"><input data-caracol-reviewed type="checkbox" required> Conferi o checklist 3 do Caracol nesta entrada na Bancada.</label>
        <details class="border rounded-xl p-3"><summary class="cursor-pointer font-bold text-xs">Liberação do líder quando houver divergência</summary><div class="grid md:grid-cols-2 gap-3 mt-3"><label class="text-xs">Senha do líder<input data-caracol-password type="password" autocomplete="off" class="block w-full border rounded-lg p-2 mt-1"></label><label class="text-xs">O que foi feito para tratar a divergência<textarea data-caracol-leader-note class="block w-full border rounded-lg p-2 mt-1" rows="2"></textarea></label></div></details>
        <button type="submit" class="bg-indigo-600 text-white font-bold uppercase text-xs px-5 py-3 rounded-xl">Salvar e validar checklist do Caracol</button></form>`;
        const changed=()=>{this.dirty=true;this.state.ready=false;this.notice('Há alterações não validadas. Salve o checklist antes de encaminhar a CT.');renderComponents();};
        this.panel().querySelector('form').oninput=changed;
        this.panel().querySelector('[data-caracol-condemned]').onchange=event=>{this.panel().querySelector('[data-caracol-items]').hidden=event.target.checked;changed();};
        this.panel().querySelector('form').onsubmit=event=>{event.preventDefault();this.save();};
    },
    async save() {
        if(this.busy || !this.state)return;
        const ctx=this.state,token=this.token,panel=this.panel(),form=panel.querySelector('form');
        const rows=[...panel.querySelectorAll('[data-caracol-row]')].map(row=>({item_name:CaracolChecklist.items[Number(row.dataset.index)],status:row.querySelector('[data-caracol-status]').value,observation:row.querySelector('[data-caracol-note]').value.trim()}));
        const condemned=panel.querySelector('[data-caracol-condemned]').checked,reviewed=panel.querySelector('[data-caracol-reviewed]').checked;
        const leader={authorized:panel.querySelector('[data-caracol-password]').value==='TURBOSUL2026',note:panel.querySelector('[data-caracol-leader-note]').value.trim()};
        this.busy=true;form.querySelectorAll('input,select,textarea,button').forEach(node=>node.disabled=true);
        try {
            await CaracolChecklist.save(supabaseClient,ctx.id,ctx.entry,ctx.baselineSignature,rows,condemned,reviewed,leader);
            const fresh=await CaracolChecklist.load(supabaseClient,ctx.id);
            if(token!==this.token || ctx.id!==this.id())return;
            this.state=fresh;this.dirty=false;this.draw();renderComponents();
        } catch(error) { if(token===this.token){this.dirty=true;this.state.ready=false;this.notice(error.message);renderComponents();} }
        finally {if(token===this.token){this.busy=false;form.querySelectorAll('input,select,textarea,button').forEach(node=>node.disabled=false);}}
    },
    async ensure(component, expectedId) {
        if(!CaracolChecklist.isCT(component))return true;
        if(expectedId && expectedId!==this.id())return false;
        if(this.dirty || this.busy || !this.state){this.notice('Salve e valide o checklist 3 do Caracol antes de encaminhar a CT.');return false;}
        const id=this.id(),token=this.token;
        try {
            const fresh=await CaracolChecklist.load(supabaseClient,id);
            if(id!==this.id() || token!==this.token)return false;
            const changed=this.state.entry!==fresh.entry || this.state.baselineSignature!==fresh.baselineSignature;
            this.state=fresh;
            if(changed){this.draw();renderComponents();return false;}
            if(!fresh.ready){this.notice('O checklist precisa ser validado para esta entrada e análise do Caracol.');renderComponents();return false;}
            return true;
        } catch(error){this.state.ready=false;this.notice('Não foi possível conferir o checklist: '+error.message);renderComponents();return false;}
    }
};
window.CaracolBancada=CaracolBancada;
