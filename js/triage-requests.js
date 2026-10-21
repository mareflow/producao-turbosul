let pedidoFiltro = 'TODOS';

function confirmarTipoPedido(name,type) {
    return new Promise(resolve=>{
        const modal=document.createElement('div');modal.id='modal-confirmar-pedido';
        modal.className='fixed inset-0 z-[100] bg-slate-900/60 flex items-center justify-center p-4';
        modal.innerHTML=`<div role="dialog" aria-modal="true" aria-labelledby="confirmar-pedido-titulo" class="bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full">
            <h3 id="confirmar-pedido-titulo" class="text-lg font-black text-slate-800">Confirmar ${type==='STOCK'?'pedido de estoque':'pedido de compra'}?</h3>
            <p class="mt-3 text-sm font-bold text-slate-700">${PartRequests.escape(name)}</p>
            <p class="mt-3 text-sm text-slate-600">${type==='STOCK'?'A peça ficará aguardando a retirada física do estoque.':'A peça ficará aguardando o recebimento da compra.'}</p>
            <p class="mt-3 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">Após confirmar, o tipo do pedido não poderá ser alterado.</p>
            <div class="flex justify-end gap-3 mt-6"><button type="button" data-cancel-request class="px-4 py-2 rounded-lg bg-slate-100 font-bold text-sm">Cancelar</button><button type="button" data-confirm-request class="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold text-sm">Confirmar pedido</button></div></div>`;
        const finish=value=>{modal.remove();resolve(value);};
        modal.querySelector('[data-cancel-request]').onclick=()=>finish(false);
        modal.querySelector('[data-confirm-request]').onclick=()=>finish(true);
        modal.addEventListener('keydown',event=>{if(event.key==='Escape')finish(false);});
        document.body.append(modal);modal.querySelector('[data-cancel-request]').focus();
    });
}

function renderizarPecas(items) {
    const container = document.getElementById('lista-pecas'), receipts = window.currentTriageRequests || [];
    window.currentIsTrocaConjunto = ProductionFlow.isNew({analysis:items || []});
    const parts = new Map();
    for (const item of items || []) {
        const decision = ProductionFlow.normalize(item.decisao_vendas);
        if (!['TROCAR','TROCAR CONJUNTO','CONDENADA EM PRODUCAO'].includes(decision) && !item.is_condenada_producao) continue;
        const code = PartRequests.code(item.item_name), group = code.includes('CONJUNTO') || (window.currentIsTrocaConjunto && ProductionFlow.core.includes(code));
        const name = group ? 'CONJUNTO ROTATIVO (FULL)' : PartRequests.label(item.item_name);
        parts.set(name,{name,group});
    }
    window.currentTriageParts = [...parts.values()];
    container.innerHTML = [...parts.values()].map(p => {
        const codes = p.group ? ProductionFlow.core : [PartRequests.code(p.name)];
        const rows = receipts.filter(r=>codes.includes(PartRequests.code(r.part_name)));
        const received = codes.every(code=>rows.some(r=>PartRequests.code(r.part_name)===code && PartRequests.status(r)==='RECEIVED'));
        const type = received ? 'RECEIVED' : rows.map(r=>PartRequests.status(r)).find(v=>v!=='DRAFT') || 'DRAFT';
        const locked = type!=='DRAFT', e = PartRequests.escape;
        const label = received ? 'Baixa concluída' : locked ? PartRequests.typeLabel(type)+' • confirmado, aguardando baixa' : 'Escolha e confirme o tipo de pedido';
        return `<div class="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100" data-name="${e(p.name)}">
            <div><p class="text-xs font-black text-slate-800">${e(p.name)}</p><p class="text-[10px] text-slate-500 mt-1">${e(label)}</p>
            ${p.group ? '<p class="text-[10px] text-amber-700">Eixo, Rotor, CCE e Reparos — pedido único</p>' : ''}</div>
            <div class="flex gap-1 bg-slate-100 rounded-lg p-1">
                <button type="button" ${locked?'disabled':''} data-request-type="STOCK" class="btn-toggle-stock ${type==='STOCK'?'active':''} text-[10px] px-4 py-2 rounded-md font-bold disabled:opacity-50">ESTOQUE</button>
                <button type="button" ${locked?'disabled':''} data-request-type="ORDER" class="btn-toggle-order ${type==='PURCHASE'?'active':''} text-[10px] px-4 py-2 rounded-md font-bold disabled:opacity-50">PEDIR</button>
            </div></div>`;
    }).join('') || '<p class="p-6 text-xs text-slate-400">Nenhum componente para troca.</p>';
    container.querySelectorAll('[data-request-type]').forEach(button=>button.onclick=()=>sincronizarPeca(button,button.closest('[data-name]').dataset.name,button.dataset.requestType));
}

async function recarregarPecasSelecionada() {
    if (!selecionada) return;
    const ctx = await PartRequests.context(supabaseClient,selecionada._supabaseId || selecionada.id,'');
    window.currentTriageRequests = ctx.receipts;
    const items = [...ctx.analysis];
    for (const r of ctx.receipts) if (!items.some(i=>PartRequests.code(i.item_name)===PartRequests.code(r.part_name))) items.push({item_name:r.part_name,decisao_vendas:'TROCAR'});
    renderizarPecas(items);
}

async function sincronizarPeca(btn,partName,availability) {
    if (!selecionada) return;
    const type = availability==='STOCK'?'STOCK':'PURCHASE';
    if (!await confirmarTipoPedido(partName,type)) return;
    btn.disabled=true;
    try {
        await PartRequests.confirm(supabaseClient,selecionada._supabaseId || selecionada.id,partName,type);
        await recarregarPecasSelecionada(); await atualizarContadores();
    } catch(error) { alert('Não foi possível confirmar o pedido: '+error.message); }
    finally { if (btn.isConnected) btn.disabled=false; }
}

function filtrarPedidos(type) { pedidoFiltro=type; renderizarPendencias(); }

async function renderizarPendencias(quiet = false) {
    const container = document.getElementById('lista-pecas-pendentes');
    if (!container) return;
    if (quiet!==true) container.innerHTML='<p class="p-6 text-xs text-slate-400">Carregando pedidos...</p>';
    try {
        const requests = await PartRequests.list(supabaseClient), e = PartRequests.escape;
        const filtered = requests.filter(r=>pedidoFiltro==='TODOS'||r.type===pedidoFiltro);
        const filters = '<div class="flex gap-2 mb-4">'+[['TODOS','Todos'],['PURCHASE','Compras'],['STOCK','Estoque']].map(([type,label])=>
            `<button type="button" data-request-filter="${type}" class="px-4 py-2 rounded-lg text-xs font-bold ${pedidoFiltro===type?'bg-blue-600 text-white':'bg-slate-100 text-slate-600'}">${label} (${type==='TODOS'?requests.length:requests.filter(r=>r.type===type).length})</button>`).join('')+'</div>';
        container.innerHTML=filters+(filtered.length?`<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="text-left text-xs text-slate-500 bg-slate-50"><tr><th class="p-4">O.S.</th><th class="p-4">Peça</th><th class="p-4">Tipo de pedido</th><th class="p-4">Cliente / Modelo</th><th class="p-4">Baixa física</th></tr></thead><tbody>${filtered.map((r,index)=>
            `<tr class="border-b border-slate-100"><td class="p-4 font-bold text-blue-600">${e(r.order.business_id)}</td><td class="p-4 font-bold">${e(r.name)}</td><td class="p-4"><span class="rounded px-2 py-1 text-xs font-bold ${r.type==='STOCK'?'bg-teal-50 text-teal-700':'bg-amber-50 text-amber-700'}">${PartRequests.typeLabel(r.type)}</span></td><td class="p-4">${e(r.order.client)}<br><span class="text-xs text-slate-400">${e(r.order.model)}</span></td><td class="p-4"><button type="button" data-receive-request="${index}" class="bg-green-600 text-white px-4 py-2 text-xs font-bold rounded-lg">${r.type==='STOCK'?'Confirmar retirada':'Confirmar recebimento'}</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="p-8 text-center text-sm text-slate-400">Nenhum pedido confirmado pendente.</p>');
        container.querySelectorAll('[data-request-filter]').forEach(button=>button.onclick=()=>filtrarPedidos(button.dataset.requestFilter));
        container.querySelectorAll('[data-receive-request]').forEach(button=>button.onclick=()=>{const r=filtered[Number(button.dataset.receiveRequest)];marcarRecebido(r.os_id,r.name,r.group,r.type);});
    } catch(error) {console.error(error);container.innerHTML='<p class="p-6 text-red-600 text-xs">Não foi possível atualizar os pedidos.</p>';}
}

function marcarRecebido(osId,partName,isConjunto=false,type='PURCHASE') {
    osParaBaixa=osId; pecaParaBaixa=partName; isBaixaConjunto=isConjunto;
    document.getElementById('modal-baixa-msg').textContent=(type==='STOCK'?'Confirmar a retirada física do estoque de ':'Confirmar o recebimento da compra de ')+partName+'? A peça será liberada para o setor de destino.';
    document.getElementById('modal-baixa-peca').classList.remove('hidden');document.getElementById('modal-baixa-peca').classList.add('flex');
}

async function confirmarBaixaExecutar() {
    if (!osParaBaixa || !pecaParaBaixa) return;
    const btn=document.getElementById('btn-executar-baixa');btn.disabled=true;
    try {
        await PartRequests.receive(supabaseClient,osParaBaixa,pecaParaBaixa);fecharModalBaixa();
        await recarregarPecasSelecionada();await renderizarPendencias();await atualizarContadores();
    } catch(error) {alert('Não foi possível dar baixa: '+error.message);}
    finally {btn.disabled=false;}
}

async function atualizarContadores() {
    const triage=allOrders.filter(o=>o.status==='Aguardando Triagem').length, standby=allOrders.filter(o=>o.status==='Standby').length;
    const production=allOrders.filter(o=>o.tem_peca_condenada_producao).length, pending=(await PartRequests.list(supabaseClient)).length;
    for(const [id,count] of Object.entries({'count-triage':triage,'count-pending':pending,'count-side-triage':triage,'count-side-condenadas':production,'count-side-standby':standby})) {const el=document.getElementById(id);if(el)el.textContent='('+count+')';}
}

function coletarDadosDasPecas() {
    const rows=window.currentTriageRequests || [],pecasEstado=[];let temFaltante=false,temIndefinido=false;
    for(const part of window.currentTriageParts || []) for(const code of part.group?ProductionFlow.core:[PartRequests.code(part.name)]) {
        const row=rows.find(r=>PartRequests.code(r.part_name)===code), status=PartRequests.status(row);
        if(status==='DRAFT')temIndefinido=true;if(status!=='RECEIVED')temFaltante=true;
        pecasEstado.push({name:PartRequests.label(code),availability:row?.availability || 'PENDING',is_resolved:status==='RECEIVED'});
    }
    return {pecasEstado,temFaltante,temIndefinido};
}

async function salvarTriagem(statusFinalOverride=null) {
    if(!selecionada)return;
    try {
        await recarregarPecasSelecionada();
        const {temFaltante,temIndefinido}=coletarDadosDasPecas();
        if(temIndefinido){alert('Confirme compra ou retirada do estoque para cada peça antes de liberar a triagem.');return;}
        if(temFaltante&&!statusFinalOverride){document.getElementById('modal-confirm-msg').textContent='Há pedidos aguardando recebimento ou retirada física. Como deseja prosseguir?';document.getElementById('modal-confirm').classList.remove('hidden');document.getElementById('modal-confirm').classList.add('flex');return;}
        const code=document.getElementById('input-marking-code').value.trim();
        if(!code||['Gerando...','ERRO'].includes(code)){alert('Aguarde a geração da marcação.');return;}
        const fields={identificacao_e_marcacao_code:code,identificacao_e_marcacao_type:document.getElementById('select-marking-type').value,
            observation:document.getElementById('obs-triagem').value,serial_number:document.getElementById('input-serial-number').value.trim().toUpperCase()};
        const id=selecionada._supabaseId || selecionada.id;
        await ProductionFlow.setOrderStatus(supabaseClient,id,statusFinalOverride || 'Aguardando Desmontagem OS',fields,['Aguardando Triagem','Standby']);
        await PartRequests.checked(supabaseClient.from('history_events').insert({service_order_id:id,action:'TRIAGEM LIBERADA',description:'O.S. liberada; pedidos pendentes permanecem aguardando baixa física.'}));
        location.reload();
    } catch(error){alert('Não foi possível liberar a triagem: '+error.message);}
}

async function salvarSolicitacaoPecaProducao() {
    const errorDiv=document.getElementById('sol-peca-erro'),btn=document.getElementById('btn-confirmar-sol-peca');errorDiv.classList.add('hidden');
    try {
        if(!osSolicitacaoSelecionada)throw new Error('Selecione uma O.S. em andamento.');
        let name=document.getElementById('sol-peca-nome-select').value;
        if(name==='OUTRO')name=document.getElementById('sol-peca-nome-custom').value.trim();
        if(!name)throw new Error('Informe a peça.');
        const availability=document.querySelector('input[name="sol-peca-disponibilidade"]:checked')?.value;
        if(!availability)throw new Error('Selecione compra ou retirada do estoque.');
        const type=availability==='STOCK'?'STOCK':'PURCHASE';
        if(!await confirmarTipoPedido(name,type))return;
        btn.disabled=true;
        await PartRequests.confirm(supabaseClient,osSolicitacaoSelecionada.id,name,type,{sector:document.getElementById('sol-peca-setor').value,note:document.getElementById('sol-peca-obs').value.trim()});
        fecharModalSolicitarPecaProducao();await carregarDados();
        if(activeTab==='pending')await renderizarPendencias();
    } catch(error){errorDiv.textContent=error.message;errorDiv.classList.remove('hidden');}
    finally {btn.disabled=false;}
}

async function colocarEmStandby() {
    if(!selecionada)return;
    try {
        await ProductionFlow.setOrderStatus(supabaseClient,selecionada._supabaseId||selecionada.id,'Standby',{observation:document.getElementById('obs-triagem').value},['Aguardando Triagem']);
        location.reload();
    } catch(error){alert(error.message);}
}

async function liberarDeStandby() {
    if(!selecionada)return;
    try {
        await ProductionFlow.setOrderStatus(supabaseClient,selecionada._supabaseId||selecionada.id,'Aguardando Triagem',{},['Standby']);
        location.reload();
    } catch(error){alert(error.message);}
}
