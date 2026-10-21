# Contexto do sistema TurboSul

Levantamento em 19/10/2026 para orientar as próximas edições. Revisão estática dos módulos locais e inspeção somente de leitura no Supabase. Não representa homologação de todos os fluxos no navegador. Nenhum dado operacional, permissão ou rotina do banco foi alterado.

## Arquitetura e ambiente

- Aplicação multipágina: 17 HTML, JavaScript nativo, CSS e scripts inline. Sem framework de aplicação, servidor próprio ou comandos de build/teste definidos no package.json.
- Inventário estático: 23.978 linhas nos HTML e JavaScript, incluindo arquivos temporários. Catálogo js/pecas.json com 1.650 entradas de partNumber/modelo; existe também a planilha PART NUMBER E MODELO.xlsx.
- Interface com Tailwind via CDN, Font Awesome e Google Fonts. Gráficos administrativos e exportações XLSX nas telas. PDFs desenhados por jsPDF/AutoTable.
- Supabase JS carregado por CDN @2 nas páginas. package-lock fixa a instalação local em 2.108.2; o CDN não segue necessariamente esse lockfile.
- vercel.json configura cleanUrls e trailingSlash=false. Isso indica configuração de hospedagem, mas o deploy ativo não foi inspecionado.
- index.html redireciona para login.html.
- Há alterações locais preexistentes em 15 HTML e js/ui.js; foram preservadas.

## Banco confirmado pelo plugin

Conexão: turbosul - ia.mareflow. Projeto: Turbo Sul, ref zghaqlaqozsskfldgsfe, us-east-2, ACTIVE_HEALTHY, PostgreSQL 17.6. O endereço do projeto coincide com o usado no código.

O esquema public contém 16 tabelas, 11 views e 6 funções. Não há Edge Functions cadastradas. O histórico retornou 3 migrations remotas, sem diretório local de migrations neste checkout.

Na consulta de contexto: 1 O.S. em Aguardando Desmontagem OS, 7 rastreamentos de componentes, 7 registros de triagem, 16 itens de análise, 12 eventos, 14 perfis públicos e 16 usuários Auth. Os números são uma fotografia, não uma garantia sobre dados futuros.

## Fluxo de negócio

1. Pré-vendas agenda a entrada de um orçamento ORÇ-, registra cliente, modelo, part number, unidade, programação, urgência, reclamação e condição de base de troca.
2. A entrada é despachada para análise técnica. Há tratamento separado de casco recebido, pendente/standby ou pago.
3. Análise técnica aplica padrões 1 a 8, avalia componentes e anexos, salva checklist e gera laudo; a O.S. vai para aprovação comercial.
4. Comercial revisa decisões por peça, pode restaurar o diagnóstico ou determinar troca de conjunto. Aprovação converte ORÇ- em O.S-, exige previsão de saída e despacho; encaminha normalmente à triagem.
5. Triagem identifica disponibilidade STOCK/ORDER, compras, baixa de peças, marcação e número de série, e libera produção. Recebimento de conjunto novo pode encaminhar seus componentes diretamente à montagem.
6. Desmontagem registra checklist, divergências e serviços e distribui peças para setores. Retífica, solda, metrologia e bancada operam por componente; a mesma O.S. pode estar em vários setores.
7. Montagem reúne EIXO, ROTOR, CCE e REPAROS para o núcleo. O conjunto segue ao balanceamento e retorna para carcaçamento com CT e CCO. Conjunto novo pode pular a montagem/balanceamento de núcleo isolado.
8. O balanceamento também trata eixo solo e peça inteira. O balanceamento final encaminha para qualidade.
9. Qualidade compara auditoria com análise técnica, registra checklist final e libera Pronto para Entrega.
10. Expedição encerra saída interna para OFICINA/ESTOQUE sem NF, ou saída para CLIENTE com número/chave de NF. Sem NF, coloca em standby.

Os caminhos são condicionais; não existe uma sequência única linear para todos os componentes.

## Mapa dos módulos

| Arquivo | Responsabilidade e funcionalidades |
|---|---|
| login.html / js/auth.js | Login por username ou email; seleção entre múltiplos setores; normalização de roles; redirecionamento; proteção de páginas; logout. |
| pre-vendas.html | Cadastro e fila de entradas, matriz/Itajaí, autocomplete de peças, urgência, base de troca, detalhes e histórico, despacho individual para análise. |
| analise-tecnica.html | Padrões de manutenção, anexos e reparos, diagnóstico, resumo de checklist, laudo PDF, Excel, fila de cascos e liberação/pagamento de casco. |
| comercial.html | Parecer técnico e decisão comercial por item, troca de conjunto, reset, aprovação/reprovação, verificação de número de O.S., dados logísticos, PDFs e Excel. |
| triagem.html | Estoque/compras, pendências, recebimento de compras, solicitação de peça durante produção, conjunto completo, sincronização com análise/rastreio, série e marcação, standby e histórico. |
| desmontagem.html | Desmontagem/limpeza, checklist com comparação técnica, autorização de divergência, PDF de auditoria, roteamento de componentes, serviços especiais/retrabalho, cronômetros e atividades do setor. |
| retifica.html | Fila por rastreamento, serviços por componente, roteamento, itens especiais/retrabalho, tempos, limpeza e atividades extras. Script atualmente não passa no parser. |
| solda.html | Fila de solda por componente, serviços, destinos, itens especiais/retrabalho, cronômetros, limpeza, atividades e histórico. |
| metrologia.html | Inspeção/aferição, checklist de anexos, comparação com análise, autorização de divergência, gravação em metrology_data da O.S., tempos e roteamento. |
| bancada.html | Serviços por componente, itens especiais/retrabalho, cronômetros e roteamento para retífica, solda, metrologia, montagem ou balanceamento. |
| montagem.html | Disponibilidade do núcleo/carcaças, máquina de estados local de montagem, cronômetros, criação dos rastreamentos CONJUNTO ROTATIVO e PEÇA INTEIRA, sincronização do status geral. |
| balanceamento.html | Eixo solo, conjunto e turbo completo; tempo, aferições, observações, reprovação/condenação e encaminhamento. Botão de limpeza contém apenas alerta de demonstração. |
| qualidade.html | Auditoria por item, checklist final, divergências e liberação para expedição; usa duas tabelas distintas de qualidade. |
| expedicao.html | Fila e filtros, destinos, nota fiscal, standby de faturamento, encerramento e histórico. |
| quadro-producao.html | Quadro com produção/standby/todos, busca, colunas por etapa, O.S. em múltiplos setores e modal de rastreamento de peças; consulta limitada às 500 O.S. mais recentes. |
| admin.html | KPIs, gráficos, esteira/setores, filas e filtros, visão detalhada, edição/cancelamento/exclusão de O.S., chegada de compras, divergências, produtividade e gestão de funcionários. |

## Arquivos compartilhados e auxiliares

- js/supabase.js: inicialização do cliente, URL e chave anon pública. Diversas telas repetem a configuração inline.
- js/api.js: catálogo parcial de URLs externas; muitas telas declaram seus próprios endpoints.
- js/ui.js: toast, footer e ordenação por urgência, depois data mais antiga.
- js/condenar_peca.js: modal de condenação com justificativa e autorização de supervisor; cria pedido ORDER na triagem, atualiza análise e rastreio, registra evento, notifica webhook e opcionalmente põe a O.S. em standby.
- js/pdf_generator.js: laudo técnico, orçamento comercial e auditoria de divergências; upload ao bucket pdfs e referências em service_orders.sector_pdfs. Falha de upload retorna blob local, que não é documento persistente.
- js/tailwind-cfg.js e css/global.css: estilos e identidade visual compartilhados, embora muito estilo também esteja nas páginas.
- fetch_os.js: apesar do nome, altera decisões comerciais de IDs fixos no banco. Foi lido, não executado.
- temp_desmontagem.js e temp_err.js: fragmentos auxiliares/temporários; temp_err.js contém erro de sintaxe e não foi encontrado como script incluído nas telas.

## Modelo de dados

service_orders é o agregado principal: UUID interno, business_id único e os_number único, cliente/modelo/part number, unidade, urgência/dificuldade, status, datas, base de troca/casco, bloqueios, logística, série/marcação, metrologia JSON e links de PDF.

| Tabela | Papel |
|---|---|
| service_orders | Dados e estado global da O.S. |
| component_tracking | Uma peça por O.S./nome; current_stage, current_sector, status, serviços executados e tracking_data JSON com tempos/operadores. |
| triage_parts | Disponibilidade, pendência e recebimento por O.S./peça. |
| checklist_analysis_general | Diagnóstico por item, decisão comercial e disponibilidade/resolução. |
| checklist_analysis_caracol | Checklist específico do caracol; existe, mas a análise atual concentra os itens no checklist geral. |
| checklist_vistoria | Vistoria/anexos; também referenciada em views. |
| checklist_desmontagem | Avaliação operacional e observações por item. |
| checklist_retifica | Checklist e serviços de retífica; a tela atual usa principalmente rastreamento. |
| checklist_metrologia | Medições por componente; a tela atual salva os anexos em service_orders.metrology_data. |
| checklist_montagem | Dados de montagem e balance_measurements; fluxo atual usa principalmente rastreamento. |
| checklist_qualidade | Auditoria técnica de itens. |
| checklist_quality | Conferência final por check_item/is_ok. |
| history_events | Histórico de ações, descrição/detalhes, horário e usuário opcional. |
| workshop_services_performed | Estrutura de serviços/tempos; FK de usuário aponta para users, enquanto o sistema atual usa Auth/profiles. |
| users | Estrutura antiga de usuários, vazia na consulta. |
| profiles | Perfil atual vinculado pelo UUID, nome/login/email, role, is_active e campo password. |

As identidades de componentes variam entre nomes extensos e códigos: CT/CARCAÇA DE TURBINA (CT), GEOMETRIA/GEOMETRIA VARIÁVEL, CANOTE/CANOTE DA GEOMETRIA, FLANGE/FLANGE DA GEOMETRIA. Alterações devem considerar a normalização e a chave única por nome.

## Views, funções e gatilhos

Views: view_production_board, view_fila_setores, view_expedicao_fila, view_os_master_data, view_analise_tecnica_fila, view_ordem_servico_timeline, view_montagem_completa, view_qualidade_fila, view_rastreio_completo, view_fila_retifica e view_desmontagem_fila.

Há views com regras antigas: view_production_board usa Aguardando Vendas em vez de todos os estados comerciais atuais; view_qualidade_fila projeta os_number como serial_number; view_ordem_servico_timeline busca colaboradores em users, não profiles. A equivalência entre views, telas e workflows externos precisa ser tratada ao editar.

Funções:

- delete_profile: apaga profile e auth.users.
- update_employee_profile: altera nome/role do profile e metadados Auth.
- update_employee_full: altera nome/login/role/senha e sincroniza Auth.
- handle_profile_sync: trigger que sincroniza alterações de profiles para Auth.
- sync_history_events_desc: trigger que preenche description/details quando um dos dois está vazio.
- generate_next_serial_number: gera prefixo de ano/mês e próximo número; não foi encontrada chamada RPC dessa função no frontend.

Gatilhos públicos identificados: trg_profile_sync e trg_sync_history_events_desc, em inserção/atualização.

## Integrações externas

- https://webhook.mareflow.com.br/webhook: logistics/triage, logistics/save-triage, logistics/sync-part, filas e ações de produção/component-routing, final-quality-routing e quality-action.
- https://teste.mareflow.com.br/webhook: endpoints de pedidos mantidos em configurações de pré-vendas/análise.
- Há migração parcial dos workflows externos para gravações diretas. Uma constante de endpoint declarada não significa que a operação ainda o utiliza.
- Balanceamento ainda depende de POST externo para concluir o roteamento; triagem depende de webhooks em parte do fluxo de standby/sincronização.
- O código dos workflows n8n/Mareflow não está neste repositório e não foi obtido pelo plugin Supabase. Seus efeitos e disponibilidade não foram validados; nenhum webhook foi acionado nesta revisão.
- Bucket pdfs é público. Políticas permitem leitura, inserção e atualização para PUBLIC no bucket.

## Achados prioritários confirmados

### Segurança

1. 15/16 tabelas public sem RLS, com permissões amplas para anon/authenticated. checklist_desmontagem tem RLS, mas política ALL USING true para PUBLIC. As barreiras da interface não protegem o banco.
2. profiles contém password textual; os 14 perfis têm valor preenchido. A criação de funcionário salva a senha recebida nesse campo. Os valores não foram extraídos nem incluídos neste documento.
3. delete_profile, update_employee_full e update_employee_profile são SECURITY DEFINER, executáveis por anon e sem validação interna de administrador. Permitem operações privilegiadas sobre Auth.
4. Roles vêm prioritariamente de user_metadata; o fluxo ignora profiles.is_active quando já há role na sessão. Falta autorização confiável no servidor.
5. triagem.html e quadro-producao.html não incluem js/auth.js nem verificam sessão localmente.
6. Autorizações de supervisor usam senha fixa no JavaScript público. Não equivalem a autenticação de supervisor no servidor.
7. O advisor sinalizou 11 views com privilégios do proprietário, além de funções com search_path não fixado.

Referências do próprio advisor:
- RLS: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public
- Funções públicas privilegiadas: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Views: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

### Funcionamento e consistência

1. retifica.html: o script inline iniciado próximo da linha 250 falha com Unexpected end of input. Acrescentar uma chave final apenas em memória faz o parser aceitar o bloco; a localização/estrutura correta deve ser corrigida antes de homologar a tela. Não foi alterado.
2. desmontagem.html: handleAction definida nas linhas 1346 e 1918. A segunda substitui a primeira, eliminando o caminho anterior de START e a chamada de salvamento do checklist no FINISH.
3. comercial.html: reprovação tenta atualizar service_orders.notes, coluna inexistente no banco inspecionado; o campo disponível é observation.
4. pre-vendas.html: carregarLinhaDoTempo duplicada e ID timeline-container repetido em markup estático.
5. current_stage/current_sector divergem em dados reais: 5 dos 7 registros encontrados têm stage de produção/montagem e sector COMPRA. Telas fazem escolhas diferentes entre esses campos, podendo apresentar setores conflitantes.
6. Salvamentos compostos fazem múltiplas chamadas independentes, frequentemente sem checar cada error. Falha intermediária pode deixar O.S., peças, compras e histórico inconsistentes.
7. Cronômetros em execução/pausados dependem de localStorage do navegador. Os registros finais vão para tracking_data; não há garantia de continuidade entre dispositivos. Alguns fluxos substituem logs existentes ou removem chaves antes de confirmar gravação.
8. Status livres e nomes/acentos de peças não estão centralizados. Há variações de Finalizado/Finalizada/Concluída e diferentes aliases de componente.
9. Número de série/marcação é calculado no cliente a partir de consultas, sem reserva atômica. Há também função SQL com regra própria; a equivalência precisa ser conferida.
10. Quadro limita a leitura a 500 O.S.; as demais consultas em geral não têm paginação explícita. O crescimento do banco requer revisão desses limites.
11. Dados de usuário/cliente são interpolados em innerHTML em vários lugares; revisar escape de valores ao editar a interface.
12. Advisor de performance: índices únicos duplicados em análise geral, rastreamento e triagem; FKs sem índice em history_events e workshop_services_performed.

## Verificação realizada e limites

- Inventário de todas as páginas e scripts locais, mapeamento de funções, leituras/escritas e endpoints.
- Compilação sintática em memória de 18 scripts inline e 10 arquivos JS, sem executar o código: falhas em retifica.html e no auxiliar temp_err.js. Parsing não garante correção funcional.
- Conferência via plugin de tabelas/colunas/FKs, views, funções, triggers, grants, políticas, storage, migrations e advisors de segurança/performance.
- Consultas agregadas para verificar estado e divergências sem listar clientes ou credenciais.
- Não houve login em contas, criação de O.S., execução de scripts auxiliares, teste de compra, envio de webhook, alteração de senha, migração ou deploy.
- A revisão dá contexto para editar; validação ponta a ponta deve ocorrer por fluxo alterado, com dados adequados e atenção às integrações externas.

## Orientação para próximas edições

Priorizar erros que impedem funcionamento e proteção real de credenciais/ações administrativas. Corrigir segurança exige alinhar login por username, administração, perfis e integrações antes de fechar permissões, para não interromper operações existentes.

Ao mudar produção, conferir em conjunto: service_orders.status, component_tracking.current_stage/current_sector/status, triage_parts, checklist_analysis_general, history_events, quadro e dashboard. Ao mudar uma decisão comercial ou recebimento de conjunto, validar também montagem e balanceamento.

## Correção de mapeamento de encerramento — 20/10/2026

A expedição gravava Finalizado apenas na O.S.; os componentes permaneciam em Qualidade. A administração não reconhecia Finalizado como estado terminal e contava qualquer rastreamento como produção. A fila da expedição também incluía indevidamente ordens aguardando qualidade.

ProductionFlow.isClosed centraliza os estados finais. Produção exclui ordens encerradas e etapas de qualidade/expedição. A aprovação da qualidade e o despacho usam transitionOrder para sincronizar current_stage e current_sector, mantendo tempos e serviços. O status da O.S. prevalece sobre rastreamento antigo nos indicadores e estações. Transições consultam o status atual para rejeitar ações de telas antigas.

A O.S-859 teve os dez componentes encerrados com base no despacho já registrado, preservando NF, data de finalização, logs e serviços. Verificação no navegador: pipeline com todas as estações vazias, O.S. identificada como Finalizado e filtros Produção/Qualidade sem registros.

## Acompanhamento e atualização automática — 20/10/2026

O.S-001 estava corretamente em Aguardando Triagem no banco. A triagem e a esteira administrativa chamavam uma função de ordenação definida em outro escopo. O painel também só atualizava ao abrir/recarregar a página.

As 15 telas usam agora ProductionFlow.sort e uma regra comum de fase/localização (phase/stations). Antes da produção, o status da O.S. prevalece sobre rastreamentos de anexos preparados pelo comercial. A troca de conjunto não encerra mais a ordem na aprovação comercial: segue para Triagem. As transições principais usam setOrderStatus, verificam o estado atual, atualizam updated_at e rejeitam tela antiga. A liberação da triagem ocorre após as gravações das peças, com verificação dos erros. Standby/retorno da triagem são gravados diretamente no banco. O início de balanceamento não usa mais o webhook que registrava início de retífica.

js/live-workflow.js atualiza as filas pelas consultas existentes a cada 5 segundos, agrupa chamadas e evita consultas de fundo sobrepostas; suspende em aba oculta e retoma ao voltar ou reconectar. Formulários abertos são preservados, com aviso quando a ordem muda. Realtime por publicação foi bloqueado pela revisão automática devido às tabelas sem RLS; nenhuma publicação ou permissão foi alterada. A alternativa implementada usa o acesso REST existente.

Validação: testes das consultas dos 13 setores, administração e quadro; fases e transições; ordenação; sincronização automática; conjunto/compras; retrabalho; busca de PN. Navegador: 001 visível na triagem e na mesma coluna do quadro e painel, ausente da análise/comercial, com horário de atualização automática.

## Pedidos de compra e estoque — 21/10/2026

A triagem agora confirma manualmente o tipo de reposição. PENDING e registros antigos ORDER sem baixa são decisões pendentes; PURCHASE_REQUEST e STOCK_REQUEST representam pedidos confirmados, ambos com is_resolved=false. Marcar estoque não representa recebimento. Somente a baixa física altera para STOCK/is_resolved=true e libera o componente. A confirmação bloqueia a troca do tipo, é registrada no histórico e o conjunto full recebe um pedido único para suas quatro peças.

A aba Pedidos lista apenas solicitações confirmadas e oferece filtros de compras/estoque e ações específicas de recebimento/retirada. A aprovação comercial e a condenação geram pendência para decisão, sem abrir compra automática. Liberar triagem ou colocar em standby não altera tipos nem baixas. Pedidos antigos pendentes requerem confirmação; baixas antigas permanecem válidas. Não foi acrescentada integração de estoque nem alterado o esquema do banco.

Os módulos js/part-requests.js e js/triage-requests.js centralizam as regras e a tela. Testes cobrem cancelamento sem gravação, confirmação e bloqueio de alteração, repetição, compra/estoque, baixa física, conjunto full e eixo avulso, preservação dos serviços e fechamento de O.S.
