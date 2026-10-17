/**
 * Turbosul - Sistema de Condenação de Peça em Produção & Divergências de Processo
 * Permite que qualquer setor da fábrica (Desmontagem, Metrologia, Retífica, Solda,
 * Bancada, Balanceamento, Montagem) condene um componente com autorização por senha do Líder.
 * Registra o evento no histórico (Divergência de Processo), envia solicitação à Triagem/Estoque,
 * atualiza o rastreio do componente e opcionalmente coloca a O.S em Standby.
 */

(function () {
    const SUPERVISOR_PASS = 'TURBOSUL2026';

    const CondenarPecaManager = {
        currentOsId: null,
        currentBusinessId: null,
        currentComponent: null,
        currentSector: null,
        onSuccessCb: null,

        getSupabase() {
            if (window.supabaseClient) return window.supabaseClient;
            if (typeof supabase !== 'undefined' && supabase.createClient) {
                const SUPABASE_URL = 'https://zghaqlaqozsskfldgsfe.supabase.co';
                const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnaGFxbGFxb3pzc2tmbGRnc2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMDY1MzQsImV4cCI6MjA4NDc4MjUzNH0.aC2DMOUNhS2uK6KGI5Sf2c2vGhrCKHMnRyZhL3WwSus';
                window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                return window.supabaseClient;
            }
            console.error('Supabase client não encontrado.');
            return null;
        },

        initModal() {
            if (document.getElementById('modal-condenar-peca')) return;

            const modalHtml = `
            <div id="modal-condenar-peca" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[999] flex items-center justify-center hidden p-4 animate-fade-in">
                <div class="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-red-100 flex flex-col">
                    <!-- CABEÇALHO -->
                    <div class="bg-gradient-to-r from-red-600 to-rose-700 p-6 text-white flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                <i class="fa-solid fa-triangle-exclamation text-xl text-white"></i>
                            </div>
                            <div>
                                <h3 class="font-black text-lg uppercase tracking-tight leading-tight">Condenar Peça em Produção</h3>
                                <p class="text-xs text-red-100 font-medium">Divergência de Processo • Pedido de Compra Automático na Triagem</p>
                            </div>
                        </div>
                        <button type="button" onclick="CondenarPecaManager.fecharModal()" class="text-white/80 hover:text-white transition p-1">
                            <i class="fa-solid fa-xmark text-xl"></i>
                        </button>
                    </div>

                    <!-- CORPO -->
                    <div class="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
                        <!-- BANNER DO ITEM -->
                        <div class="bg-red-50/70 border border-red-200/80 rounded-2xl p-4 flex flex-wrap gap-2 items-center justify-between text-xs">
                            <div>
                                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Ordem de Serviço</span>
                                <span id="cp-modal-os" class="font-black text-slate-800 font-mono text-sm">OS-XXXX</span>
                            </div>
                            <div>
                                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Componente</span>
                                <span id="cp-modal-comp" class="font-black text-red-700 uppercase text-sm">CARCAÇA</span>
                            </div>
                            <div>
                                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Setor Solicitante</span>
                                <span id="cp-modal-setor" class="font-bold text-slate-700 uppercase bg-white px-2 py-0.5 rounded border border-slate-200">RETÍFICA</span>
                            </div>
                        </div>

                        <!-- MOTIVO DA CONDENAÇÃO -->
                        <div>
                            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                                Motivo Técnico / Erro de Processo <span class="text-red-500">*</span>
                            </label>
                            <select id="cp-modal-motivo" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-red-500 focus:bg-white transition">
                                <option value="Trinca / Fissura estrutural">Trinca / Fissura estrutural constatada</option>
                                <option value="Desgaste excessivo fora de tolerância">Desgaste excessivo fora de tolerância de retífica</option>
                                <option value="Empeno ou deformação irrecuperável">Empeno ou deformação irrecuperável</option>
                                <option value="Erro operacional / Usinagem">Erro operacional de processo / usinagem</option>
                                <option value="Ruptura / Quebra de componente">Ruptura / Quebra de componente em máquina</option>
                                <option value="Incompatibilidade dimensional">Incompatibilidade dimensional grave</option>
                                <option value="Dano durante montagem / balanceamento">Dano durante montagem / balanceamento</option>
                                <option value="Outro motivo técnico">Outro motivo técnico</option>
                            </select>
                        </div>

                        <!-- JUSTIFICATIVA TÉCNICA DETALHADA -->
                        <div>
                            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                                Observações Técnicas Detalhadas <span class="text-red-500">*</span>
                            </label>
                            <textarea id="cp-modal-obs" rows="3" placeholder="Descreva exatamente o que ocorreu com a peça, medidas encontradas e o motivo da condenação..." class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 outline-none focus:border-red-500 focus:bg-white transition resize-none"></textarea>
                        </div>

                        <!-- INFORMAÇÃO DE PEDIDO DE COMPRA AUTOMÁTICO -->
                        <div class="bg-blue-50/80 border border-blue-200 rounded-xl p-3 flex items-start space-x-3 text-xs text-blue-900">
                            <i class="fa-solid fa-cart-shopping text-blue-600 text-sm mt-0.5"></i>
                            <div>
                                <span class="font-black block uppercase tracking-wider text-[10px]">Pedido de Compra Automático na Triagem</span>
                                <span class="text-[11px] text-blue-700 leading-snug">Ao confirmar, o sistema registrará automaticamente um pedido de compra (ORDER) na Triagem para reposição imediata desta peça.</span>
                            </div>
                        </div>

                        <!-- OPÇÃO STANDBY -->
                        <div class="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex items-start space-x-3">
                            <input type="checkbox" id="cp-modal-standby" checked class="w-4 h-4 mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer">
                            <label for="cp-modal-standby" class="text-xs text-amber-900 font-bold cursor-pointer leading-tight">
                                Colocar Ordem de Serviço em Standby
                                <span class="block text-[10px] text-amber-700/80 font-normal mt-0.5">Recomendado se a linha não puder avançar sem este componente de reposição.</span>
                            </label>
                        </div>

                        <!-- LIBERAÇÃO DO LÍDER -->
                        <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                            <div class="flex items-center gap-2">
                                <i class="fa-solid fa-user-shield text-slate-700 text-sm"></i>
                                <span class="text-xs font-black text-slate-800 uppercase tracking-wider">Autorização de Liderança Obrigatória</span>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 ml-1">Nome do Líder / Supervisor <span class="text-red-500">*</span></label>
                                    <input type="text" id="cp-modal-lider" placeholder="Ex: Robson (Líder)" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500">
                                </div>
                                <div>
                                    <label class="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 ml-1">Senha de Autorização <span class="text-red-500">*</span></label>
                                    <input type="password" id="cp-modal-senha" placeholder="••••••••" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-red-500">
                                </div>
                            </div>
                        </div>

                        <div id="cp-modal-erro" class="hidden text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-200"></div>
                    </div>

                    <!-- RODAPÉ -->
                    <div class="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                        <button type="button" onclick="CondenarPecaManager.fecharModal()" class="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition uppercase tracking-wider">
                            Cancelar
                        </button>
                        <button type="button" id="cp-btn-confirmar" onclick="CondenarPecaManager.confirmarCondenacao()" class="bg-red-600 hover:bg-red-700 text-white font-black px-6 py-2.5 rounded-xl uppercase text-xs tracking-wider shadow-md shadow-red-200 transition-all flex items-center gap-2">
                            <i class="fa-solid fa-cart-shopping"></i> Confirmar & Gerar Pedido de Compra
                        </button>
                    </div>
                </div>
            </div>`;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
        },

        abrirModal(serviceOrderId, businessId, componentName, setor, onSuccessCallback) {
            this.initModal();

            this.currentOsId = serviceOrderId;
            this.currentBusinessId = businessId || 'OS-N/A';
            this.currentComponent = (componentName || '').trim();
            this.currentSector = (setor || 'PRODUÇÃO').toUpperCase().trim();
            this.onSuccessCb = onSuccessCallback || null;

            document.getElementById('cp-modal-os').innerText = this.currentBusinessId;
            document.getElementById('cp-modal-comp').innerText = this.currentComponent;
            document.getElementById('cp-modal-setor').innerText = this.currentSector;
            document.getElementById('cp-modal-obs').value = '';
            document.getElementById('cp-modal-lider').value = '';
            document.getElementById('cp-modal-senha').value = '';
            document.getElementById('cp-modal-standby').checked = true;

            const erroDiv = document.getElementById('cp-modal-erro');
            erroDiv.innerText = '';
            erroDiv.classList.add('hidden');

            const btn = document.getElementById('cp-btn-confirmar');
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-cart-shopping"></i> Confirmar & Gerar Pedido de Compra`;

            const modal = document.getElementById('modal-condenar-peca');
            modal.classList.remove('hidden');
        },

        fecharModal() {
            const modal = document.getElementById('modal-condenar-peca');
            if (modal) modal.classList.add('hidden');
        },

        mostrarErro(msg) {
            const erroDiv = document.getElementById('cp-modal-erro');
            erroDiv.innerText = msg;
            erroDiv.classList.remove('hidden');
        },

        getStandardNames(component) {
            const raw = (component || '').trim();
            const upper = raw.toUpperCase();
            let standard = upper;
            let trackingCode = upper;

            if (upper === 'CT' || upper.includes('CARCAÇA DE TURBINA') || upper.includes('CARCACA DE TURBINA')) {
                standard = 'CARCAÇA DE TURBINA (CT)';
                trackingCode = 'CT';
            } else if (upper === 'GEOMETRIA' || upper.includes('GEOMETRIA VARIÁVEL') || upper.includes('GEOMETRIA VARIAVEL')) {
                standard = 'GEOMETRIA VARIÁVEL';
                trackingCode = 'GEOMETRIA';
            } else if (upper === 'CANOTE' || upper.includes('CANOTE')) {
                standard = 'CANOTE DA GEOMETRIA';
                trackingCode = 'CANOTE';
            } else if (upper === 'FLANGE' || upper.includes('FLANGE')) {
                standard = 'FLANGE DA GEOMETRIA';
                trackingCode = 'FLANGE';
            } else if (upper === 'CCO') {
                standard = 'CCO';
                trackingCode = 'CCO';
            } else if (upper === 'CCE') {
                standard = 'CCE';
                trackingCode = 'CCE';
            } else if (upper === 'ROTOR') {
                standard = 'ROTOR';
                trackingCode = 'ROTOR';
            } else if (upper === 'EIXO') {
                standard = 'EIXO';
                trackingCode = 'EIXO';
            } else if (upper === 'ATUADOR') {
                standard = 'ATUADOR';
                trackingCode = 'ATUADOR';
            } else if (upper === 'REPAROS') {
                standard = 'REPAROS';
                trackingCode = 'REPAROS';
            }

            return { standard, trackingCode, raw: upper };
        },

        async confirmarCondenacao() {
            const motivo = document.getElementById('cp-modal-motivo').value;
            const obs = document.getElementById('cp-modal-obs').value.trim();
            const lider = document.getElementById('cp-modal-lider').value.trim();
            const senha = document.getElementById('cp-modal-senha').value.trim();
            const colocarStandby = document.getElementById('cp-modal-standby').checked;

            if (!obs) {
                this.mostrarErro('Por favor, informe a justificativa técnica detalhada.');
                return;
            }
            if (!lider) {
                this.mostrarErro('Por favor, informe o nome do Líder/Supervisor.');
                return;
            }
            if (!senha) {
                this.mostrarErro('Digite a senha do Líder para autorizar.');
                return;
            }
            if (senha !== SUPERVISOR_PASS) {
                this.mostrarErro('❌ Senha incorreta! Autorização negada.');
                return;
            }

            const supabase = this.getSupabase();
            if (!supabase) {
                this.mostrarErro('Erro de conexão com o banco de dados.');
                return;
            }

            const btn = document.getElementById('cp-btn-confirmar');
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Gerando pedido de compra...`;

            try {
                // 1. Obtém sessão do usuário logado (se houver)
                let userId = null;
                try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    userId = sessionData?.session?.user?.id || null;
                } catch (e) { }

                const names = this.getStandardNames(this.currentComponent);
                const now = new Date().toISOString();

                // 2. Registra o evento de Divergência de Processo no history_events
                const eventPayload = {
                    service_order_id: this.currentOsId,
                    user_id: userId,
                    action: 'Divergência de Processo (Condenação de Peça em Produção)',
                    details: `[PEDIDO DE COMPRA AUTOMÁTICO NA TRIAGEM] Componente "${names.standard}" condenado no setor "${this.currentSector}". Gerado pedido de compra na Triagem. Líder: "${lider}". Motivo: "${motivo}". Justificativa Técnica: "${obs}".`,
                    description: `Divergência de Processo: Peça ${names.standard} condenada na ${this.currentSector}. Pedido de compra gerado na Triagem.`,
                    timestamp: now
                };

                const { error: histError } = await supabase
                    .from('history_events')
                    .insert(eventPayload);

                if (histError) console.warn("Aviso ao inserir history_events:", histError);

                // 3. ✅ GERA AUTOMATICAMENTE O PEDIDO DE COMPRA NA TRIAGEM (triage_parts)
                // Insere/atualiza o item como 'ORDER' e não resolvido
                await supabase
                    .from('triage_parts')
                    .upsert({
                        service_order_id: this.currentOsId,
                        part_name: names.standard,
                        availability: 'ORDER',
                        is_resolved: false,
                        resolved_at: null
                    }, { onConflict: 'service_order_id,part_name' });

                // Se houver registro com código abreviado diferente do standard, sincroniza também
                if (names.trackingCode !== names.standard) {
                    await supabase
                        .from('triage_parts')
                        .upsert({
                            service_order_id: this.currentOsId,
                            part_name: names.trackingCode,
                            availability: 'ORDER',
                            is_resolved: false,
                            resolved_at: null
                        }, { onConflict: 'service_order_id,part_name' });
                }

                // 4. ✅ ATUALIZA CHECKLIST GERAL (se a peça constava na análise técnica inicial)
                try {
                    await supabase
                        .from('checklist_analysis_general')
                        .update({
                            availability: 'ORDER',
                            is_resolved: false,
                            decisao_vendas: 'CONDENADA EM PRODUÇÃO'
                        })
                        .eq('service_order_id', this.currentOsId)
                        .or(`item_name.ilike.%${names.trackingCode}%,item_name.ilike.%${names.standard}%`);
                } catch (chkErr) {
                    console.warn("Aviso ao atualizar checklist_analysis_general:", chkErr);
                }

                // 5. ✅ ATUALIZA O RASTREAMENTO DO COMPONENTE PARA O SETOR DE COMPRA (component_tracking)
                const { data: existingTrack } = await supabase
                    .from('component_tracking')
                    .select('id, tracking_data')
                    .eq('service_order_id', this.currentOsId)
                    .or(`component_name.ilike.%${names.trackingCode}%,component_name.ilike.%${names.standard}%`)
                    .maybeSingle();

                let currentTrackingData = [];
                if (existingTrack && existingTrack.tracking_data) {
                    currentTrackingData = typeof existingTrack.tracking_data === 'string'
                        ? JSON.parse(existingTrack.tracking_data)
                        : existingTrack.tracking_data;
                    if (!Array.isArray(currentTrackingData)) currentTrackingData = [];
                }

                currentTrackingData.push({
                    action: 'CONDENACAO_PRODUCAO',
                    purchase_order_generated: true,
                    sector: this.currentSector,
                    reason: motivo,
                    notes: obs,
                    leader: lider,
                    timestamp: now
                });

                const trackingPayload = {
                    service_order_id: this.currentOsId,
                    component_name: names.trackingCode,
                    current_stage: 'COMPRA',
                    current_sector: 'COMPRA',
                    status: 'CONDENADO EM PRODUÇÃO',
                    status_description: `Peça condenada no setor ${this.currentSector}: ${motivo}. Pedido de compra gerado automaticamente na Triagem.`,
                    tracking_data: currentTrackingData,
                    last_update: now
                };

                if (existingTrack) {
                    await supabase
                        .from('component_tracking')
                        .update(trackingPayload)
                        .eq('id', existingTrack.id);
                } else {
                    await supabase
                        .from('component_tracking')
                        .insert(trackingPayload);
                }

                // 6. ✅ NOTIFICA WEBHOOK EXTERNO DE LOGÍSTICA / COMPRAS
                try {
                    await fetch('https://webhook.mareflow.com.br/webhook/logistics/sync-part', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            os_id: this.currentOsId,
                            part_name: names.standard,
                            availability: 'ORDER',
                            origin: 'CONDENACAO_PRODUCAO',
                            purchase_order_auto: true,
                            sector: this.currentSector,
                            reason: motivo,
                            notes: obs,
                            leader: lider
                        })
                    });
                } catch (wErr) {
                    console.warn("Aviso ao notificar webhook de compra:", wErr);
                }

                // 7. Se selecionado "Colocar O.S em Standby", atualiza a service_orders
                if (colocarStandby) {
                    await supabase
                        .from('service_orders')
                        .update({
                            status: 'Standby',
                            blockage_reason: `Peça Condenada em Produção (${names.standard}) - Pedido de Compra Gerado`,
                            blockage_notes: `Componente ${names.standard} condenado no setor ${this.currentSector} pelo líder ${lider}. Motivo: ${motivo}. Pedido de compra gerado automaticamente na Triagem.`,
                            updated_at: now
                        })
                        .eq('id', this.currentOsId);
                }

                // 8. Feedback visual e fechamento
                this.fecharModal();
                this.exibirToastSucesso(`Peça ${names.standard} condenada! Pedido de compra gerado automaticamente na Triagem.`);

                if (typeof this.onSuccessCb === 'function') {
                    this.onSuccessCb(names.standard);
                }
            } catch (err) {
                console.error("Erro ao registrar condenação de peça:", err);
                this.mostrarErro("Falha ao salvar no banco de dados: " + (err.message || err));
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-cart-shopping"></i> Tentar Novamente`;
            }
        },

        exibirToastSucesso(msg) {
            const toast = document.createElement('div');
            toast.className = 'fixed bottom-5 right-5 z-[9999] bg-slate-900 text-white px-5 py-4 rounded-2xl shadow-2xl border-l-4 border-red-500 flex items-center gap-3 animate-bounce';
            toast.innerHTML = `
                <i class="fa-solid fa-cart-shopping text-red-500 text-lg"></i>
                <div>
                    <p class="font-bold text-xs uppercase tracking-wider text-red-400">Pedido de Compra Gerado na Triagem</p>
                    <p class="text-xs text-slate-200">${msg}</p>
                </div>
            `;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.classList.remove('animate-bounce');
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.5s ease';
                setTimeout(() => toast.remove(), 500);
            }, 4500);
        }
    };

    window.CondenarPecaManager = CondenarPecaManager;
})();
