
        const SUPABASE_URL = 'https://zghaqlaqozsskfldgsfe.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnaGFxbGFxb3pzc2tmbGRnc2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMDY1MzQsImV4cCI6MjA4NDc4MjUzNH0.aC2DMOUNhS2uK6KGI5Sf2c2vGhrCKHMnRyZhL3WwSus';
        const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        const API_QUEUE = 'https://webhook.mareflow.com.br/webhook/production/assembly-queue';
        const API_ACTION = 'https://webhook.mareflow.com.br/webhook/production/component-routing';
        let selectedOS = null;
        let queueData = [];

        window.addEventListener('load', fetchQueue);

        async function fetchQueue() {
            try {
                const response = await fetch(API_QUEUE);
                const data = await response.json();
                let rawQueue = Array.isArray(data) ? data : (data.data || []);
                
                // Filtro Inteligente: Remove OSs que já passaram do setor de Montagem antes de desenhar a barra lateral
                if (rawQueue.length > 0) {
                    const osIds = rawQueue.map(os => os.service_order_id || os.os_id || os.id);
                    
                    // Busca os dados de rastreamento de todas as OSs da fila em uma única consulta
                    const { data: trackings, error } = await supabaseClient
                        .from('component_tracking')
                        .select('*')
                        .in('service_order_id', osIds);
                        
                    if (!error && trackings) {
                        rawQueue = rawQueue.filter(os => {
                            const osId = os.service_order_id || os.os_id || os.id;
                            const osTracking = trackings.filter(t => t.service_order_id === osId);
                            
                            const pecaInteira = osTracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'PEÇA INTEIRA');
                            const stageCompleta = pecaInteira ? (pecaInteira.target_sector || pecaInteira.current_stage || pecaInteira.stage || '').toUpperCase() : '';
                            
                            const isFinalized = (stageCompleta === 'QUALIDADE' || stageCompleta === 'BALANCEAMENTO' || stageCompleta === 'EXPEDICAO' || stageCompleta === 'EXPEDIÇÃO');
                            
                            // Vincula os dados de tracking para deixar o clique posterior instantâneo
                            os.full_tracking = osTracking; 
                            
                            return !isFinalized; // Retorna true apenas para as OSs que NÃO foram finalizadas
                        });
                    }
                }
                
                queueData = rawQueue;
                renderSidebar();
            } catch (e) { console.error("Erro na fila:", e); }
        }

        function renderSidebar() {
            const list = document.getElementById('os-list');
            if (queueData.length === 0) {
                list.innerHTML = '<div class="p-8 text-center text-slate-400 text-xs italic">Fila Vazia.</div>';
                return;
            }
            list.innerHTML = queueData.map(os => {
                const osId = os.service_order_id || os.os_id || os.id;
                return `
                    <div id="os-card-${osId}" onclick="selectOS('${osId}')" class="os-card p-4 cursor-pointer bg-white border-l-4 border-transparent hover:bg-slate-50 transition rounded-xl shadow-sm">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-sm font-black text-slate-900">${os.business_id}</span>
                            <span class="px-2 py-0.5 text-[9px] font-black uppercase rounded-md bg-blue-100 text-blue-600">${os.urgency || 'Normal'}</span>
                        </div>
                        <p class="text-xs font-bold text-slate-700 uppercase mb-1">${os.model}</p>
                        <p class="text-[10px] font-medium text-slate-500 uppercase truncate">${os.client}</p>
                    </div>
                `;
            }).join('');
        }

        async function selectOS(id) {
            selectedOS = queueData.find(o => {
                const oId = o.service_order_id || o.os_id || o.id;
                return oId === id;
            });
            
            document.querySelectorAll('.os-card').forEach(c => c.classList.remove('os-card-selected'));
            const cardEl = document.getElementById(`os-card-${id}`);
            if (cardEl) cardEl.classList.add('os-card-selected');

            document.getElementById('welcome-screen').classList.add('hidden');
            document.getElementById('main-workspace').classList.remove('hidden');
            
            document.getElementById('display-os').innerText = selectedOS.business_id;
            document.getElementById('display-desc').innerText = `${selectedOS.client} | ${selectedOS.model}`;
            
            // Os dados de tracking já foram carregados e filtrados na inicialização da página
            atualizarWorkspaceMontagem();
        }

        // MÁQUINA DE ESTADOS DETALHADA DO FLUXO DE MONTAGEM E TRÂNSITO FISICO
        function getAssemblyDetailedState() {
            const tracking = selectedOS.full_tracking || selectedOS.tracking || [];
            
            const eixo = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'EIXO');
            const rotor = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'ROTOR');
            const cce = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'CCE');
            const reparos = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'REPAROS');
            
            const conjuntoRotativo = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'CONJUNTO ROTATIVO');
            const ct = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'CT');
            const cco = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'CCO');
            const pecaInteira = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'PEÇA INTEIRA');

            const stageConjunto = conjuntoRotativo ? (conjuntoRotativo.target_sector || conjuntoRotativo.current_stage || conjuntoRotativo.stage || '').toUpperCase() : '';
            const stageCompleta = pecaInteira ? (pecaInteira.target_sector || pecaInteira.current_stage || pecaInteira.stage || '').toUpperCase() : '';

            // Se o turbo inteiro foi roteado para Qualidade, Balanceamento ou Expedição, consideramos Montagem finalizada
            if (stageCompleta === 'QUALIDADE' || stageCompleta === 'BALANCEAMENTO' || stageCompleta === 'EXPEDICAO' || stageCompleta === 'EXPEDIÇÃO') {
                return 'FINALIZADO';
            }

            // REGRA: Se o Conjunto Rotativo foi enviado ao balanceamento e ainda está pendente lá
            if (conjuntoRotativo && stageConjunto === 'BALANCEAMENTO') {
                return 'NUCLEO_EM_BALANCEAMENTO';
            }

            const isConjuntoBalanceado = conjuntoRotativo && (
                conjuntoRotativo.status === 'Finalizado' || 
                conjuntoRotativo.status === 'BALANCEADO' || 
                stageConjunto === 'MONTAGEM'
            );

            if (isConjuntoBalanceado) {
                const ctStage = ct ? (ct.target_sector || ct.current_stage || ct.stage || '').toUpperCase() : '';
                const ccoStage = cco ? (cco.target_sector || cco.current_stage || cco.stage || '').toUpperCase() : '';
                const carcasasProntas = ctStage === 'MONTAGEM' && ccoStage === 'MONTAGEM';

                if (!carcasasProntas) {
                    return 'CARCACAMENTO_AGUARDANDO';
                }

                const timerKey = `timer_${selectedOS.id}_MONTAGEM_CARCACAMENTO`;
                const isCronometroAtivo = localStorage.getItem(timerKey) !== null;
                if (isCronometroAtivo) {
                    return 'CARCACAMENTO_EM_EXECUCAO';
                }

                const ctTrackingData = ct && ct.tracking_data ? (typeof ct.tracking_data === 'string' ? JSON.parse(ct.tracking_data) : ct.tracking_data) : [];
                const logSalvo = Array.isArray(ctTrackingData) ? ctTrackingData.find(log => log.service === 'Carcaçamento Completo') : null;

                if (logSalvo) {
                    return 'CARCACAMENTO_CONCLUIDO';
                }

                return 'CARCACAMENTO_PRONTO';
            } else {
                const eixoStage = eixo ? (eixo.target_sector || eixo.current_stage || eixo.stage || '').toUpperCase() : '';
                const rotorStage = rotor ? (rotor.target_sector || rotor.current_stage || rotor.stage || '').toUpperCase() : '';
                const cceStage = cce ? (cce.target_sector || cce.current_stage || cce.stage || '').toUpperCase() : '';
                const reparosStage = reparos ? (reparos.target_sector || reparos.current_stage || reparos.stage || '').toUpperCase() : '';

                const todosDisponiveis = eixoStage === 'MONTAGEM' && rotorStage === 'MONTAGEM' && cceStage === 'MONTAGEM' && reparosStage === 'MONTAGEM';

                if (!todosDisponiveis) {
                    return 'NUCLEO_AGUARDANDO';
                }

                const timerKey = `timer_${selectedOS.id}_MONTAGEM_NUCLEO`;
                const isCronometroAtivo = localStorage.getItem(timerKey) !== null;
                if (isCronometroAtivo) {
                    return 'NUCLEO_EM_EXECUCAO';
                }

                const eixoTrackingData = eixo && eixo.tracking_data ? (typeof eixo.tracking_data === 'string' ? JSON.parse(eixo.tracking_data) : eixo.tracking_data) : [];
                const logSalvo = Array.isArray(eixoTrackingData) ? eixoTrackingData.find(log => log.service === 'Montagem de Núcleo') : null;

                if (logSalvo) {
                    return 'NUCLEO_CONCLUIDO';
                }

                return 'NUCLEO_PRONTO';
            }
        }

        function getEtapaMontagemAtual() {
            const state = getAssemblyDetailedState();
            if (state.startsWith('CARCACAMENTO') || state === 'FINALIZADO') {
                return 'CARCACAMENTO';
            }
            return 'NUCLEO';
        }

        function atualizarWorkspaceMontagem() {
            const tracking = selectedOS.full_tracking || selectedOS.tracking || [];
            const state = getAssemblyDetailedState();
            const etapa = getEtapaMontagemAtual();

            const bannerStatus = document.getElementById('banner-status-montagem');
            const btnIniciar = document.getElementById('btn-iniciar-torque');
            const btnEnviar = document.getElementById('btn-concluir-etapa');
            const timerContainer = document.getElementById('assembly-timer-container');

            if (etapa === 'NUCLEO') {
                document.getElementById('assembly-step-badge').innerText = "Etapa 1: Conjunto Rotativo";
                
                const eixo = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'EIXO');
                const rotor = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'ROTOR');
                const cce = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'CCE');
                const reparos = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'REPAROS');

                renderPecasCards({ Eixo: eixo, Rotor: rotor, CCE: cce, Reparos: reparos });
            } else {
                document.getElementById('assembly-step-badge').innerText = "Etapa 2: Carcaçamento (Housings)";
                
                const ct = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'CT');
                const cco = tracking.find(t => (t.component_name || t.component || '').toUpperCase() === 'CCO');

                renderPecasCards({ CT: ct, CCO: cco });
            }

            switch (state) {
                case 'NUCLEO_AGUARDANDO':
                    bannerStatus.innerHTML = `<span class="text-amber-500 font-black text-xs uppercase tracking-widest">▲ AGUARDANDO CHEGADA DAS PEÇAS DO NÚCLEO NO SETOR</span>`;
                    btnIniciar.disabled = true;
                    btnIniciar.classList.remove('hidden');
                    btnIniciar.className = 'w-full bg-slate-400 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest transition-all cursor-not-allowed';
                    timerContainer.classList.add('hidden');
                    btnEnviar.classList.add('hidden');
                    break;

                case 'NUCLEO_PRONTO':
                    bannerStatus.innerHTML = `<span class="text-emerald-600 font-black text-xs uppercase tracking-widest">● TODAS AS 4 PEÇAS DISPONÍVEIS! INICIE O CRONÔMETRO</span>`;
                    btnIniciar.disabled = false;
                    btnIniciar.classList.remove('hidden');
                    btnIniciar.innerText = "Iniciar Torque e Montagem";
                    btnIniciar.className = 'w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest transition-all shadow-md';
                    timerContainer.classList.add('hidden');
                    btnEnviar.classList.add('hidden');
                    break;

                case 'NUCLEO_EM_EXECUCAO':
                    bannerStatus.innerHTML = `<span class="text-orange-500 font-black text-xs uppercase tracking-widest animate-pulse">● EXECUTANDO MONTAGEM DO NÚCLEO...</span>`;
                    btnIniciar.classList.add('hidden');
                    timerContainer.classList.remove('hidden');
                    btnEnviar.classList.add('hidden');
                    break;

                case 'NUCLEO_CONCLUIDO':
                    bannerStatus.innerHTML = `<span class="text-emerald-600 font-black text-xs uppercase tracking-widest">● MONTAGEM DE NÚCLEO CONCLUÍDA! PRONTO PARA ENVIAR</span>`;
                    btnIniciar.classList.add('hidden');
                    timerContainer.classList.add('hidden');
                    btnEnviar.classList.remove('hidden');
                    btnEnviar.innerText = "Enviar para o Balanceamento";
                    btnEnviar.className = 'w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest transition-all shadow-lg';
                    break;

                case 'NUCLEO_EM_BALANCEAMENTO':
                    bannerStatus.innerHTML = `<span class="text-purple-600 font-black text-xs uppercase tracking-widest animate-pulse">▲ CONJUNTO ROTATIVO ENVIADO PARA O SETOR DE BALANCEAMENTO</span>`;
                    btnIniciar.disabled = true;
                    btnIniciar.classList.remove('hidden');
                    btnIniciar.innerText = "Em Balanceamento...";
                    btnIniciar.className = 'w-full bg-purple-400 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest transition-all cursor-not-allowed';
                    timerContainer.classList.add('hidden');
                    btnEnviar.classList.add('hidden');
                    break;

                case 'CARCACAMENTO_AGUARDANDO':
                    bannerStatus.innerHTML = `<span class="text-amber-500 font-black text-xs uppercase tracking-widest">▲ AGUARDANDO LIBERAÇÃO DAS CARCAÇAS NA MONTAGEM</span>`;
                    btnIniciar.disabled = true;
                    btnIniciar.classList.remove('hidden');
                    btnIniciar.className = 'w-full bg-slate-400 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest transition-all cursor-not-allowed';
                    timerContainer.classList.add('hidden');
                    btnEnviar.classList.add('hidden');
                    break;

                case 'CARCACAMENTO_PRONTO':
                    bannerStatus.innerHTML = `<span class="text-emerald-600 font-black text-xs uppercase tracking-widest">● CARCAÇAS DISPONÍVEIS! INICIE O CRONÔMETRO</span>`;
                    btnIniciar.disabled = false;
                    btnIniciar.classList.remove('hidden');
                    btnIniciar.innerText = "Iniciar Carcaçamento";
                    btnIniciar.className = 'w-full bg-turbo-orange hover:bg-orange-700 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest transition-all shadow-md';
                    timerContainer.classList.add('hidden');
                    btnEnviar.classList.add('hidden');
                    break;

                case 'CARCACAMENTO_EM_EXECUCAO':
                    bannerStatus.innerHTML = `<span class="text-orange-500 font-black text-xs uppercase tracking-widest animate-pulse">● EXECUTANDO CARCAÇAMENTO DA TURBINA...</span>`;
                    btnIniciar.classList.add('hidden');
                    timerContainer.classList.remove('hidden');
                    btnEnviar.classList.add('hidden');
                    break;

                case 'CARCACAMENTO_CONCLUIDO':
                    bannerStatus.innerHTML = `<span class="text-emerald-600 font-black text-xs uppercase tracking-widest">● CARCAÇAMENTO FINALIZADO! ESCOLHA O PRÓXIMO DESTINO</span>`;
                    btnIniciar.classList.add('hidden');
                    timerContainer.classList.add('hidden');
                    btnEnviar.classList.remove('hidden');
                    btnEnviar.innerText = "Avançar e Roteirizar Peça (Qualidade ou Balanceamento)";
                    btnEnviar.className = 'w-full bg-turbo-orange hover:bg-orange-700 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest transition-all shadow-lg';
                    break;

                case 'FINALIZADO':
                    bannerStatus.innerHTML = `<span class="text-emerald-600 font-black text-xs uppercase tracking-widest">● TURBINA COMPLETADA E ENVIADA PARA AS ETAPAS FINAIS</span>`;
                    btnIniciar.classList.add('hidden');
                    timerContainer.classList.add('hidden');
                    btnEnviar.classList.add('hidden');
                    break;
            }
        }

        function renderPecasCards(pecasObj) {
            const grid = document.getElementById('dynamic-pieces-grid');
            const colsCount = Object.keys(pecasObj).length;
            grid.className = `grid grid-cols-1 md:grid-cols-${colsCount} gap-6`;

            grid.innerHTML = Object.keys(pecasObj).map(nome => {
                const p = pecasObj[nome];
                const stage = p ? (p.target_sector || p.current_stage || p.stage || '').toUpperCase() : '';
                const noSetor = stage === 'MONTAGEM';
                if (noSetor) {
                    return `
                        <div class="flex flex-col items-center justify-center p-6 border-2 border-emerald-500 bg-emerald-50/30 rounded-3xl">
                            <span class="text-xs font-black text-slate-800 tracking-tight uppercase">${nome}</span>
                            <i class="fa-solid fa-circle-check text-emerald-500 text-4xl my-4"></i>
                            <span class="text-[9px] font-black text-emerald-700 bg-emerald-100 px-4 py-1.5 rounded-full tracking-widest uppercase">No Setor</span>
                        </div>`;
                } else {
                    const localizacao = p ? (p.current_stage || p.target_sector || p.stage || 'Desmontagem') : 'Desmontagem';
                    return `
                        <div class="flex flex-col items-center justify-center p-6 border-2 border-slate-200 bg-slate-50/50 rounded-3xl opacity-60">
                            <span class="text-xs font-black text-slate-500 tracking-tight uppercase">${nome}</span>
                            <i class="fa-solid fa-hourglass-half text-slate-400 text-4xl my-4 animate-pulse"></i>
                            <span class="text-[9px] font-black text-slate-500 bg-slate-200 px-4 py-1.5 rounded-full tracking-widest uppercase font-mono">Em: ${localizacao.toUpperCase()}</span>
                        </div>`;
                }
            }).join('');
        }

        function iniciarCronometroMontagem() {
            if (!selectedOS) return;
            const etapa = getEtapaMontagemAtual();
            const timerKey = `timer_${selectedOS.id}_MONTAGEM_${etapa}`;
            localStorage.setItem(timerKey, new Date().toISOString());
            atualizarWorkspaceMontagem();
        }

        async function pararCronometroMontagem() {
            if (!selectedOS) return;
            const etapa = getEtapaMontagemAtual();
            const timerKey = `timer_${selectedOS.id}_MONTAGEM_${etapa}`;
            const startTimeStr = localStorage.getItem(timerKey);

            if (!startTimeStr) return;
            localStorage.removeItem(timerKey);

            const durationSeconds = Math.max(1, Math.floor((new Date() - new Date(startTimeStr)) / 1000));
            
            const pecaFisicaReferencia = etapa === 'NUCLEO' ? 'EIXO' : 'CT';
            const servicoNome = etapa === 'NUCLEO' ? 'Montagem de Núcleo' : 'Carcaçamento Completo';

            const trackingList = selectedOS.full_tracking || selectedOS.tracking || [];
            let trk = trackingList.find(t => (t.component_name || t.component || '').toUpperCase() === pecaFisicaReferencia.toUpperCase());

            let trackingData = [];
            if (trk && trk.tracking_data) {
                trackingData = typeof trk.tracking_data === 'string' ? JSON.parse(trk.tracking_data) : trk.tracking_data;
            }

            trackingData = trackingData.filter(log => log.service !== servicoNome);
            trackingData.push({
                service: servicoNome,
                start_time: startTimeStr,
                end_time: new Date().toISOString(),
                duration_seconds: durationSeconds
            });

            const osId = selectedOS.service_order_id || selectedOS.os_id || selectedOS.id;

            try {
                const { error } = await supabaseClient
                    .from('component_tracking')
                    .upsert({
                        service_order_id: osId,
                        component_name: pecaFisicaReferencia.toUpperCase().trim(),
                        tracking_data: trackingData,
                        current_stage: 'MONTAGEM',
                        status: 'Finalizado'
                    }, { onConflict: 'service_order_id,component_name' });

                if (!error) {
                    if (trk) {
                        trk.tracking_data = trackingData;
                        trk.status = 'Finalizado';
                    } else {
                        const novaPeca = {
                            service_order_id: osId,
                            component_name: pecaFisicaReferencia.toUpperCase().trim(),
                            current_stage: 'MONTAGEM',
                            status: 'Finalizado',
                            tracking_data: trackingData
                        };
                        if (!selectedOS.full_tracking) selectedOS.full_tracking = [];
                        selectedOS.full_tracking.push(novaPeca);
                    }

                    document.getElementById('resumo-peca-nome').innerText = servicoNome;
                    document.getElementById('resumo-inicio').innerText = new Date(startTimeStr).toLocaleTimeString('pt-BR');
                    document.getElementById('resumo-fim').innerText = new Date().toLocaleTimeString('pt-BR');
                    
                    const min = Math.floor(durationSeconds / 60);
                    const sec = durationSeconds % 60;
                    document.getElementById('resumo-duracao').innerText = `${min}:${sec.toString().padStart(2, '0')} min`;
                    
                    document.getElementById('modal-resumo-tempo').classList.remove('hidden');
                    document.getElementById('modal-resumo-tempo').classList.add('flex');

                    atualizarWorkspaceMontagem();
                } else {
                    alert("Erro ao gravar tempos no Supabase: " + error.message);
                }
            } catch (e) {
                console.error(e);
                alert("Falha na conexão.");
            }
        }

        function confirmarEtapaMontagem() {
            const tracking = selectedOS.full_tracking || selectedOS.tracking || [];
            const conjuntoRotativo = tracking.find(t => {
                const name = (t.component_name || t.component || '').toUpperCase();
                return name === 'CONJUNTO ROTATIVO';
            });
            
            const stageConjunto = conjuntoRotativo ? (conjuntoRotativo.target_sector || conjuntoRotativo.current_stage || conjuntoRotativo.stage || '').toUpperCase() : '';
            const isConjuntoBalanceado = conjuntoRotativo && (
                conjuntoRotativo.status === 'Finalizado' || 
                conjuntoRotativo.status === 'BALANCEADO' || 
                stageConjunto === 'MONTAGEM'
            );

            const modal = document.getElementById('custom-modal');
            const title = document.getElementById('modal-title');
            const desc = document.getElementById('modal-desc');
            const buttonsContainer = document.getElementById('modal-buttons-container');

            if (!isConjuntoBalanceado) {
                title.innerText = "Enviar para Balanceamento?";
                desc.innerText = "Isso montará o Conjunto Rotativo e o encaminhará para o primeiro balanceamento.";
                buttonsContainer.innerHTML = `
                    <div class="flex gap-3 w-full">
                        <button onclick="closeModal()" class="flex-1 py-4 px-6 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition">Cancelar</button>
                        <button onclick="enviarProximaEtapa('BALANCEAMENTO', 'Conjunto Rotativo')" class="flex-1 py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg transition">Confirmar</button>
                    </div>
                `;
            } else {
                title.innerText = "Finalizar Carcaçamento?";
                desc.innerText = "O turbo completo foi montado. Selecione o próximo destino da peça:";
                buttonsContainer.innerHTML = `
                    <div class="flex flex-col gap-3 w-full">
                        <button onclick="enviarProximaEtapa('QUALIDADE', 'Peça Inteira')" class="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg transition">Direto para Qualidade</button>
                        <button onclick="enviarProximaEtapa('BALANCEAMENTO', 'Peça Inteira')" class="w-full py-4 px-6 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg transition">Ir para Balanceamento Final</button>
                        <button onclick="closeModal()" class="w-full py-3 px-6 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition mt-2">Cancelar</button>
                    </div>
                `;
            }

            modal.classList.remove('hidden');
        }

        async function enviarProximaEtapa(setorAlvo, tipoMontagem) {
            closeModal();
            const btn = document.getElementById('btn-concluir-etapa');
            btn.disabled = true;
            btn.innerText = "ENVIANDO...";

            try {
                const response = await fetch(API_ACTION, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        os_id: selectedOS.service_order_id || selectedOS.os_id || selectedOS.id,
                        component: tipoMontagem,
                        target: setorAlvo,
                        executed_services: [tipoMontagem === 'Conjunto Rotativo' ? 'Montagem de Núcleo' : 'Carcaçamento Completo']
                    })
                });

                if (response.ok) {
                    alert(`✅ Enviado para ${setorAlvo} com Sucesso!`);
                    window.location.reload();
                } else {
                    alert("Erro ao salvar etapa.");
                    btn.disabled = false;
                }
            } catch (e) {
                alert("Falha na conexão.");
                btn.disabled = false;
            }
        }

        
        async function toggleSectorCleaning(sectorName) {
            const timerKey = `timer_sector_cleaning_start_${sectorName}`;
            const startTimeStr = localStorage.getItem(timerKey);
            const btn = document.getElementById('btn-sector-cleaning');

            if (!startTimeStr) {
                // Iniciar contagem
                localStorage.setItem(timerKey, new Date().toISOString());
                if(btn) {
                    btn.classList.replace('bg-turbo-teal', 'bg-red-600');
                    btn.classList.replace('hover:bg-teal-600', 'hover:bg-red-700');
                    btn.classList.add('animate-pulse');
                    btn.innerText = "Parar Limpeza (00:00)";
                }
            } else {
                // Parar contagem
                localStorage.removeItem(timerKey);
                if(btn) {
                    btn.classList.replace('bg-red-600', 'bg-turbo-teal');
                    btn.classList.replace('hover:bg-red-700', 'hover:bg-teal-600');
                    btn.classList.remove('animate-pulse');
                    btn.innerText = "Iniciar Limpeza Setor";
                }

                const elapsed = Math.floor((new Date() - new Date(startTimeStr)) / 1000);
                const min = Math.floor(elapsed / 60);
                const sec = elapsed % 60;
                const formattedTime = `${min}:${sec.toString().padStart(2, '0')} min`;

                let osId = null;
                if (typeof selectedOS !== 'undefined' && selectedOS) {
                    osId = selectedOS.service_order_id || selectedOS.os_id || selectedOS.id;
                }

                try {
                    const insertData = {
                        action: 'Limpeza do Setor Executada',
                        details: `O operador realizou a limpeza do setor de ${sectorName} durante ${formattedTime}.`,
                        timestamp: new Date().toISOString()
                    };
                    if (osId) insertData.service_order_id = osId;

                    
                    let res = await supabaseClient.from('history_events').insert(insertData);
                    
                    if (res.error) {
                        if (res.error.code === '23502' && !osId) {
                            console.warn("Aviso: Banco de dados exige OS para salvar no histórico.");
                        } else if (res.error.code === '23503' && res.error.message.includes('user_id')) {
                            // Foreign key violation for user_id! Try again without it.
                            delete insertData.user_id;
                            res = await supabaseClient.from('history_events').insert(insertData);
                            if (res.error) throw res.error;
                        } else {
                            throw res.error;
                        }
                    }

                    if (document.getElementById('resumo-peca-nome')) {
                        document.getElementById('resumo-peca-nome').innerText = `Limpeza Setor: ${sectorName}`;
                        document.getElementById('resumo-inicio').innerText = new Date(startTimeStr).toLocaleTimeString('pt-BR');
                        document.getElementById('resumo-fim').innerText = new Date().toLocaleTimeString('pt-BR');
                        document.getElementById('resumo-duracao').innerText = formattedTime;
                        
                        const modalResumo = document.getElementById('modal-resumo-tempo');
                        if(modalResumo) {
                            modalResumo.classList.remove('hidden');
                            modalResumo.classList.add('flex');
                        }
                    } else {
                        alert(`Limpeza concluída: ${formattedTime}`);
                    }
                } catch (e) {
                    console.error("Erro ao salvar limpeza:", e);
                    alert(`Erro Limpeza: ` + (e.message || JSON.stringify(e)));
                }
            }
        }

        function closeModal(id) {
            if(id) {
                const modal = document.getElementById(id);
                if(modal) {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                }
            } else {
                document.getElementById('custom-modal').classList.add('hidden');
            }
        }

        // FUNÇÕES DE HISTÓRICO E CONTROLE DE MODAL DA MONTAGEM
        async function carregarLinhaDoTempo(osId) {
            if (!osId) return;
            const os = selectedOS;
            
            // Preenche dados básicos no modal
            document.getElementById('detail-business-id').textContent = os.business_id;
            document.getElementById('detail-model').textContent = os.model || 'N/A';

            const timeline = document.getElementById('timeline-container');
            timeline.innerHTML = '<p class="text-xs text-slate-400 animate-pulse text-center">Buscando rastreio...</p>';
            
            document.getElementById('details-modal').classList.remove('hidden');
            document.getElementById('details-modal').classList.add('flex');

            try {
                const { data: events, error } = await supabaseClient
                    .from('history_events')
                    .select('*')
                    .eq('service_order_id', osId)
                    .order('timestamp', { ascending: true });

                if (!error && events && events.length > 0) {
                    timeline.innerHTML = events.map(ev => `
                        <div class="relative pb-3">
                            <div class="absolute -left-[21px] top-1 w-3 h-3 bg-turbo-teal rounded-full border-2 border-white"></div>
                            <p class="text-[11px] font-black text-slate-800 uppercase tracking-tight">${ev.action}</p>
                            <p class="text-[10px] text-slate-500 font-medium">${new Date(ev.timestamp).toLocaleString('pt-BR')}</p>
                            ${ev.details ? `<p class="text-[9px] text-slate-400 italic">"${ev.details}"</p>` : ''}
                        </div>`).join('');
                } else { 
                    timeline.innerHTML = '<p class="text-xs text-slate-400 italic text-center">Nenhum evento registrado ainda.</p>'; 
                }
            } catch (err) { console.error(err); }
        }

        setInterval(() => {
            if (selectedOS) {
                const etapa = getEtapaMontagemAtual();
                const timerKey = `timer_${selectedOS.id}_MONTAGEM_${etapa}`;
                const startTimeStr = localStorage.getItem(timerKey);
                
                if (startTimeStr) {
                    const elapsed = Math.floor((new Date() - new Date(startTimeStr)) / 1000);
                    const min = Math.floor(elapsed / 60);
                    const sec = elapsed % 60;
                    const badge = document.getElementById('assembly-timer-badge');
                    if (badge) badge.innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
                }
            }

            const cleaningKey = `timer_sector_cleaning_start_MONTAGEM`;
            const cleaningStart = localStorage.getItem(cleaningKey);
            if (cleaningStart) {
                const elapsed = Math.floor((new Date() - new Date(cleaningStart)) / 1000);
                const min = Math.floor(elapsed / 60);
                const sec = elapsed % 60;
                const btn = document.getElementById('btn-sector-cleaning');
                if (btn) btn.innerText = `Parar Limpeza (${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')})`;
            }

            // 3. Atualização em tempo real do cronômetro de Outras Atividades
            const otherKey = `timer_other_activities_start_MONTAGEM`;
            const otherStart = localStorage.getItem(otherKey);
            if (otherStart) {
                const elapsed = Math.floor((new Date() - new Date(otherStart)) / 1000);
                const min = Math.floor(elapsed / 60);
                const sec = elapsed % 60;
                const btnO = document.getElementById('btn-other-activities');
                if (btnO) btnO.innerText = `Parar Atividade (${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')})`;
            }


            }
        }, 1000);
    