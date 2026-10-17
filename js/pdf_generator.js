// js/pdf_generator.js
// Gerador de Laudos e Relatórios em PDF da TurboSul
// Desenha o PDF diretamente com jsPDF + AutoTable (sem captura de tela / html2canvas),
// o que torna a geração instantânea e confiável. O PDF é aberto em uma nova guia.

const PDFGenerator = {
    RED: [185, 28, 28],
    DARK: [30, 41, 59],
    GRAY: [100, 116, 139],
    LIGHT: [248, 250, 252],
    BORDER: [226, 232, 240],

    _pendingTab: null,
    _libsPromise: null,

    // ------------------------------------------------------------------
    // Carregamento das bibliotecas
    // ------------------------------------------------------------------
    _loadOne(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Falha ao carregar ' + src));
            document.head.appendChild(s);
        });
    },

    loadScript() {
        if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) return Promise.resolve(true);
        if (!this._libsPromise) {
            this._libsPromise = (async () => {
                if (!(window.jspdf && window.jspdf.jsPDF)) {
                    await this._loadOne('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
                }
                if (!window.jspdf.jsPDF.API.autoTable) {
                    await this._loadOne('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
                }
                return true;
            })().catch(err => { this._libsPromise = null; throw err; });
        }
        return this._libsPromise;
    },

    // ------------------------------------------------------------------
    // Guia nova (aberta no clique para não ser bloqueada)
    // ------------------------------------------------------------------
    createPreOpenedWindow(title = 'Gerando Relatório TurboSul...') {
        this.loadScript().catch(() => {});
        let win = null;
        try {
            win = window.open('', '_blank');
            if (win) {
                win.document.open();
                win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
                    <style>body{font-family:Segoe UI,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#f8fafc}
                    .s{width:54px;height:54px;border:4px solid #334155;border-top-color:#e11d48;border-radius:50%;animation:r .9s linear infinite;margin-bottom:24px}
                    @keyframes r{to{transform:rotate(360deg)}}h2{margin:0 0 10px}p{color:#94a3b8;margin:0}</style></head>
                    <body><div class="s"></div><h2>${title}</h2><p>O PDF será exibido em instantes...</p></body></html>`);
                win.document.close();
            }
        } catch (e) {
            console.warn('Popup bloqueado:', e);
            win = null;
        }
        this._pendingTab = win;
        return win;
    },

    openSafely(url, preOpenedWindow) {
        if (!url) { this.hideLoading(); return; }
        const tab = preOpenedWindow || this._pendingTab;
        this._pendingTab = null;
        if (tab && !tab.closed) {
            tab.location.href = url;
            return;
        }
        const w = window.open(url, '_blank');
        if (!w) {
            // Último recurso: baixa o arquivo
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.download = '';
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
    },

    // Mantidos por compatibilidade: fecha a guia pendente em caso de erro
    showLoading() {},
    hideLoading() {
        const tab = this._pendingTab;
        this._pendingTab = null;
        if (tab && !tab.closed) {
            try { tab.close(); } catch (e) {}
        }
    },

    // ------------------------------------------------------------------
    // Helpers de desenho
    // ------------------------------------------------------------------
    _txt(v, fallback = '-') {
        if (v === null || v === undefined || v === '') return fallback;
        return String(v);
    },

    _statusColors(st) {
        const s = (st || '').toUpperCase();
        if (s === 'PEÇA OK' || s === 'BOM / OK' || s === 'OK' || s.startsWith('APROVADO') || s === 'AUTORIZADO')
            return { fill: [220, 252, 231], text: [21, 128, 61] };
        if (s.includes('RECONDICIONAR'))
            return { fill: [254, 243, 199], text: [180, 83, 9] };
        if (s.includes('TROCAR') || s.includes('SUBSTITUIR'))
            return { fill: [254, 226, 226], text: [185, 28, 28] };
        if (s.includes('SEM TESTE'))
            return { fill: [255, 237, 213], text: [194, 65, 12] };
        if (s.includes('NÃO AVALIADO'))
            return { fill: [241, 245, 249], text: [71, 85, 105] };
        return { fill: [241, 245, 249], text: [30, 41, 59] };
    },

    _header(doc, subtitle, title, idLabel, idValue, extraRight) {
        const W = doc.internal.pageSize.getWidth();
        const now = new Date();
        const emitido = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(...this.RED);
        doc.text('TURBOSUL', 14, 20);
        const tw = doc.getTextWidth('TURBOSUL');
        doc.setFontSize(7.5);
        doc.setTextColor(...this.GRAY);
        doc.text(subtitle.toUpperCase(), 14 + tw + 3, 20);

        doc.setFontSize(13);
        doc.setTextColor(...this.DARK);
        doc.text(title.toUpperCase(), 14, 28);

        doc.setFontSize(8);
        doc.setTextColor(...this.GRAY);
        doc.text(idLabel.toUpperCase(), W - 14, 14, { align: 'right' });
        doc.setFontSize(17);
        doc.setTextColor(...this.RED);
        doc.text(this._txt(idValue, ''), W - 14, 22, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...this.GRAY);
        let y = 27;
        if (extraRight) { doc.text(extraRight, W - 14, y, { align: 'right' }); y += 4; }
        doc.text('Emitido em: ' + emitido, W - 14, y, { align: 'right' });

        doc.setDrawColor(...this.RED);
        doc.setLineWidth(0.9);
        doc.line(14, 33, W - 14, 33);
        return 39;
    },

    _sectionTitle(doc, text, y, color) {
        const W = doc.internal.pageSize.getWidth();
        y = this._ensureSpace(doc, y, 14);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...(color || this.RED));
        doc.text(text.toUpperCase(), 14, y);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.line(14, y + 1.8, W - 14, y + 1.8);
        return y + 4;
    },

    _ensureSpace(doc, y, needed) {
        const H = doc.internal.pageSize.getHeight();
        if (y + needed > H - 18) {
            doc.addPage();
            return 18;
        }
        return y;
    },

    _infoTable(doc, y, rows, fill) {
        doc.autoTable({
            startY: y,
            theme: 'plain',
            body: rows,
            margin: { left: 14, right: 14 },
            styles: { fontSize: 9, cellPadding: { top: 1.6, bottom: 1.6, left: 3, right: 3 }, textColor: this.DARK, fillColor: fill || this.LIGHT },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 38 },
                2: { fontStyle: 'bold', cellWidth: 38 }
            }
        });
        return doc.lastAutoTable.finalY + 6;
    },

    _textBox(doc, y, title, text) {
        const W = doc.internal.pageSize.getWidth();
        y = this._sectionTitle(doc, title, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(text, W - 34);
        const h = lines.length * 4.4 + 6;
        y = this._ensureSpace(doc, y, h);
        doc.setFillColor(...this.LIGHT);
        doc.setDrawColor(...this.BORDER);
        doc.roundedRect(14, y, W - 28, h, 2, 2, 'FD');
        doc.text(lines, 17, y + 6);
        return y + h + 8;
    },

    _signatures(doc, y, labels) {
        const W = doc.internal.pageSize.getWidth();
        y = this._ensureSpace(doc, y + 12, 22);
        y += 12;
        const n = labels.length;
        const slot = (W - 28) / n;
        labels.forEach(([l1, l2], i) => {
            const cx = 14 + slot * i + slot / 2;
            doc.setDrawColor(...this.GRAY);
            doc.setLineWidth(0.3);
            doc.line(cx - 35, y, cx + 35, y);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(...this.DARK);
            doc.text(l1.toUpperCase(), cx, y + 5, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...this.GRAY);
            doc.text(l2, cx, y + 9, { align: 'center' });
        });
    },

    _footer(doc, label) {
        const n = doc.internal.getNumberOfPages();
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();
        for (let i = 1; i <= n; i++) {
            doc.setPage(i);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text('TurboSul Remanufatura - ' + label, 14, H - 8);
            doc.text(`Página ${i} de ${n}`, W - 14, H - 8, { align: 'right' });
        }
    },

    _summaryCards(doc, y, cards) {
        const W = doc.internal.pageSize.getWidth();
        const gap = 4;
        const cw = (W - 28 - gap * (cards.length - 1)) / cards.length;
        const ch = 22;
        y = this._ensureSpace(doc, y, ch + 4);
        cards.forEach((c, i) => {
            const x = 14 + i * (cw + gap);
            doc.setFillColor(...c.fill);
            doc.setDrawColor(...c.border);
            doc.roundedRect(x, y, cw, ch, 2, 2, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...c.color);
            doc.text(c.label.toUpperCase(), x + 3, y + 5);
            doc.setFontSize(16);
            doc.text(String(c.value), x + 3, y + 13);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            const det = doc.splitTextToSize(c.detail || '', cw - 6);
            doc.text(det.slice(0, 2), x + 3, y + 17.5);
        });
        return y + ch + 7;
    },

    _parseExtras(mex) {
        if (!mex) return 'Nenhum adicional registrado.';
        if (typeof mex === 'string') { try { mex = JSON.parse(mex); } catch (e) { return mex; } }
        const mapping = { actuator: 'Atuador', geometry: 'Geometria Variável', geometryStem: 'Canote da Geometria', geometryFlange: 'Flange da Geometria' };
        const labels = [];
        Object.entries(mex || {}).forEach(([k, v]) => {
            const came = v === true || (v && v.came === true);
            if (came) labels.push((mapping[k] || k) + (v && v.status ? ` (${v.status})` : ''));
        });
        return labels.length ? labels.join(', ') : 'Nenhum adicional registrado.';
    },

    // ------------------------------------------------------------------
    // 1. LAUDO TÉCNICO DE ANÁLISE (ANÁLISE TÉCNICA -> VENDAS)
    // ------------------------------------------------------------------
    async generateAnalysisPDF(orderData, checklistData, supabaseClient) {
        await this.loadScript();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const items = checklistData || [];

        const dataEntrada = orderData.created_at ? new Date(orderData.created_at).toLocaleDateString('pt-BR') : this._txt(orderData.date, 'N/A');

        let y = this._header(doc, 'Remanufatura de Turbocompressores', 'Laudo de Avaliação Técnica', 'Identificação', orderData.business_id);

        y = this._sectionTitle(doc, '1. Dados do Equipamento e Entrada', y);
        y = this._infoTable(doc, y, [
            ['Cliente:', this._txt(orderData.client, 'Não informado'), 'Modelo:', this._txt(orderData.model, 'Não especificado')],
            ['Padrão de Desgaste:', this._txt(orderData.pattern, 'Não especificado'), 'Data de Entrada:', dataEntrada],
            ['Acessórios Recebidos:', { content: this._parseExtras(orderData.maintenance_extras), colSpan: 3 }]
        ]);

        const trocas = [], recond = [], ok = [], falt = [];
        items.forEach(it => {
            const st = (it.status || it.veredito_tecnico || '').toUpperCase().trim();
            const nm = it.name || it.item_name || 'Item';
            if (st.includes('TROCAR')) trocas.push(nm);
            else if (st.includes('RECONDICIONAR')) recond.push(nm);
            else if (st === 'PEÇA OK' || st === 'BOM / OK' || st === 'OK') ok.push(nm);
            else if (st === 'ITEM FALTANTE') falt.push(nm);
        });
        const resume = (arr, none) => arr.length ? arr.slice(0, 4).join(', ') + (arr.length > 4 ? '...' : '') : none;

        y = this._summaryCards(doc, y, [
            { label: 'Substituição (Trocar)', value: trocas.length, detail: resume(trocas, 'Nenhuma troca.'), fill: [254, 242, 242], border: [254, 202, 202], color: [153, 27, 27] },
            { label: 'Usinagem / Recond.', value: recond.length, detail: resume(recond, 'Nenhum recondicionamento.'), fill: [255, 251, 235], border: [253, 230, 138], color: [146, 64, 14] },
            { label: 'Peças Conformes (OK)', value: ok.length, detail: 'Prontas para montagem.', fill: [240, 253, 244], border: [187, 247, 208], color: [22, 101, 52] },
            { label: 'Itens Faltantes', value: falt.length, detail: resume(falt, 'Nenhum item faltante.'), fill: [241, 245, 249], border: [203, 213, 225], color: [30, 41, 59] }
        ]);

        y = this._sectionTitle(doc, '2. Detalhamento Técnico das Peças Avaliadas', y);
        const body = items.length ? items.map(it => [
            this._txt(it.name || it.item_name, 'Item'),
            (it.status || it.veredito_tecnico || 'NÃO INFORMADO').toUpperCase().trim(),
            this._txt(it.obs || it.observation)
        ]) : [[{ content: 'Nenhum item de checklist registrado.', colSpan: 3, styles: { halign: 'center', textColor: [148, 163, 184] } }]];

        doc.autoTable({
            startY: y,
            head: [['Componente / Item Avaliado', 'Veredito Técnico', 'Observação Técnica / Diagnóstico']],
            body,
            margin: { left: 14, right: 14 },
            theme: 'grid',
            headStyles: { fillColor: this.DARK, textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
            styles: { fontSize: 8.5, cellPadding: 2.4, lineColor: this.BORDER, lineWidth: 0.2, textColor: this.DARK },
            alternateRowStyles: { fillColor: this.LIGHT },
            columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' }, 1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' } },
            didParseCell: (d) => {
                if (d.section === 'body' && d.column.index === 1 && items.length) {
                    const c = this._statusColors(d.cell.raw);
                    d.cell.styles.fillColor = c.fill;
                    d.cell.styles.textColor = c.text;
                }
            }
        });
        y = doc.lastAutoTable.finalY + 8;

        y = this._textBox(doc, y, '3. Parecer Técnico Geral e Diagnóstico da Falha',
            orderData.observation || 'Equipamento avaliado conforme os padrões técnicos operacionais da TurboSul. Proceder com as rotinas de usinagem e substituição conforme acima orientado.');

        this._signatures(doc, y, [['Departamento Técnico & Qualidade', 'TurboSul Remanufatura']]);
        this._footer(doc, 'Laudo Técnico ' + this._txt(orderData.business_id, ''));

        return this._finalizeAndUpload(doc, `Laudo_Tecnico_${orderData.business_id || 'OS'}`, 'analise', orderData.id, 'analise_tecnica', supabaseClient);
    },

    // ------------------------------------------------------------------
    // 2. RELATÓRIO DE APROVAÇÃO COMERCIAL (COMERCIAL -> TRIAGEM)
    // ------------------------------------------------------------------
    async generateComercialPDF(orderData, checklistData, supabaseClient) {
        await this.loadScript();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const items = checklistData || [];

        const dataEntrada = orderData.created_at ? new Date(orderData.created_at).toLocaleDateString('pt-BR') : this._txt(orderData.date, 'N/A');
        const prevSaida = orderData.previsao_saida ? new Date(orderData.previsao_saida + (String(orderData.previsao_saida).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : 'A definir';
        const hs = orderData.hull_status || orderData.hull_state;
        let casco = 'Venda Direta / Padrão';
        if (hs === 'RECEIVED') casco = 'Já Recebido (Seguir Processo)';
        else if (hs === 'WAITING') casco = 'Aguardando Casco (Standby)';
        else if (hs === 'PAID') casco = 'Casco Pago / Incluso';

        const extra = orderData.ref_orcamento && orderData.ref_orcamento !== orderData.business_id ? `(Ref: ${orderData.ref_orcamento})` : null;
        let y = this._header(doc, 'Comercial & Vendas', 'Orçamento & Aprovação Comercial', 'Ordem de Serviço Oficial', orderData.business_id, extra);

        y = this._sectionTitle(doc, '1. Identificação do Cliente & Turbocompressor', y);
        y = this._infoTable(doc, y, [
            ['Cliente:', this._txt(orderData.client, 'Não informado'), 'Modelo:', this._txt(orderData.model, 'Não especificado')],
            ['Padrão de Desgaste:', this._txt(orderData.pattern, 'Não informado'), 'Data de Entrada:', dataEntrada],
            ['Base de Troca (Casco):', { content: casco, colSpan: 3 }]
        ]);

        y = this._sectionTitle(doc, '2. Programação Logística & Despacho', y, [29, 78, 216]);
        y = this._infoTable(doc, y, [
            ['Previsão de Saída:', prevSaida, 'Horário de Corte:', this._txt(orderData.horario_corte, '18:00')],
            ['Local de Despacho:', this._txt(orderData.local_despacho, 'Não informado'), '2ª Hora (Urgência):', orderData.segunda_hora ? 'SIM (Urgência)' : 'NÃO']
        ], [239, 246, 255]);

        const salesLabel = (dec) => {
            const d = (dec || 'NÃO APLICÁVEL').toUpperCase().trim();
            if (d === 'OK' || d === 'APROVAR VENDA' || d === 'APROVADO') return 'APROVADO (OK)';
            if (d.includes('RECONDICIONAR')) return 'RECONDICIONAR';
            if (d === 'TROCAR CONJUNTO') return 'TROCAR CONJUNTO';
            if (d === 'TROCAR' || d === 'FORNECER PEÇA NOVA' || d === 'VENDIDO') return 'SUBSTITUIR (NOVA)';
            return d;
        };

        y = this._sectionTitle(doc, '3. Comparativo: Laudo Técnico x Decisão Comercial', y);
        const body = items.length ? items.map(it => [
            this._txt(it.item_name || it.name, 'Item'),
            (it.tech_verdict || it.status || 'NÃO INFORMADO').toUpperCase().trim(),
            salesLabel(it.decisao_vendas),
            'AUTORIZADO'
        ]) : [[{ content: 'Nenhum item comercial detalhado.', colSpan: 4, styles: { halign: 'center', textColor: [148, 163, 184] } }]];

        doc.autoTable({
            startY: y,
            head: [['Componente / Peça', 'Laudo Técnico', 'Decisão Comercial (Cliente)', 'Status']],
            body,
            margin: { left: 14, right: 14 },
            theme: 'grid',
            headStyles: { fillColor: this.DARK, textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
            styles: { fontSize: 8.5, cellPadding: 2.4, lineColor: this.BORDER, lineWidth: 0.2, textColor: this.DARK },
            alternateRowStyles: { fillColor: this.LIGHT },
            columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'center', fontStyle: 'bold' }, 2: { halign: 'center', fontStyle: 'bold' }, 3: { halign: 'center', fontStyle: 'bold', cellWidth: 26 } },
            didParseCell: (d) => {
                if (d.section === 'body' && d.column.index >= 1 && items.length) {
                    const c = this._statusColors(d.cell.raw);
                    d.cell.styles.fillColor = c.fill;
                    d.cell.styles.textColor = c.text;
                }
            }
        });
        y = doc.lastAutoTable.finalY + 8;

        y = this._textBox(doc, y, '4. Observações Comerciais & Condições Negociadas',
            orderData.vendas_observacoes || 'Serviço comercial aprovado conforme especificações e negociação acima descrita. Encaminhado à triagem e produção para execução.');

        this._signatures(doc, y, [
            ['Departamento Comercial TurboSul', 'Orçamento & Vendas'],
            ['De Acordo do Cliente / Produção', 'Liberação de Remanufatura']
        ]);
        this._footer(doc, 'Aprovação Comercial ' + this._txt(orderData.business_id, ''));

        return this._finalizeAndUpload(doc, `Orcamento_${orderData.business_id || 'OS'}`, 'vendas', orderData.id, 'vendas', supabaseClient);
    },

    // ------------------------------------------------------------------
    // 3. RELATÓRIO DE AUDITORIA E DIVERGÊNCIAS (ANÁLISE vs DESMONTAGEM)
    // ------------------------------------------------------------------
    async generateDiscrepancyPDF(orderData, comparisonList, supervisorInfo, supabaseClient) {
        await this.loadScript();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const items = comparisonList || [];

        let y = this._header(doc, 'Auditoria de Qualidade e Processos', 'Relatório de Divergências Técnicas', 'Ordem de Serviço', orderData.business_id);

        y = this._sectionTitle(doc, '1. Identificação do Equipamento e Autorização', y);
        y = this._infoTable(doc, y, [
            ['Cliente:', this._txt(orderData.client, 'Não informado'), 'Modelo:', this._txt(orderData.model, 'Não especificado')],
            ['Part Number (P/N):', this._txt(orderData.part_number, 'Não informado'), 'Número de Série (S/N):', this._txt(orderData.serial_number, 'Não informado')],
            ['Supervisor Autorizador:', this._txt(supervisorInfo?.name, 'Líder da Desmontagem'), 'Data de Liberação:', new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })]
        ]);

        const divergentes = items.filter(it => it.isDivergent);
        const iguais = items.filter(it => !it.isDivergent);

        y = this._summaryCards(doc, y, [
            { label: 'Itens Divergentes', value: divergentes.length, detail: `${divergentes.length} divergências apontadas.`, fill: [254, 242, 242], border: [254, 202, 202], color: [185, 28, 28] },
            { label: 'Itens Concordantes', value: iguais.length, detail: `${iguais.length} itens conferem com o laudo.`, fill: [240, 253, 244], border: [187, 247, 208], color: [22, 101, 52] },
            { label: 'Total de Itens Auditados', value: items.length, detail: 'Peças e serviços verificados.', fill: [241, 245, 249], border: [203, 213, 225], color: [30, 41, 59] }
        ]);

        y = this._textBox(doc, y, '2. Justificativa / Parecer do Supervisor Técnico',
            supervisorInfo?.observation || 'Divergências autorizadas pelo supervisor de produção para andamento do processo conforme normas internas da TurboSul.');

        y = this._sectionTitle(doc, '3. Matriz Comparativa (Análise Técnica vs Desmontagem)', y);
        
        // Ordena para que os divergentes apareçam no topo
        const sortedItems = [...items].sort((a, b) => (b.isDivergent ? 1 : 0) - (a.isDivergent ? 1 : 0));

        const body = sortedItems.length ? sortedItems.map(it => [
            this._txt(it.itemName, 'Item'),
            (it.analysisStatus || 'NÃO INFORMADO').toUpperCase().trim(),
            (it.disassemblyStatus || 'NÃO INFORMADO').toUpperCase().trim(),
            it.isDivergent ? 'DIVERGENTE ⚠️' : 'CONCORDANTE ✅',
            this._txt(it.obs)
        ]) : [[{ content: 'Nenhum item para comparação.', colSpan: 5, styles: { halign: 'center', textColor: [148, 163, 184] } }]];

        doc.autoTable({
            startY: y,
            head: [['Peça / Componente', 'Análise Técnica', 'Desmontagem', 'Status Comparativo', 'Observações']],
            body,
            margin: { left: 14, right: 14 },
            theme: 'grid',
            headStyles: { fillColor: this.DARK, textColor: 255, fontSize: 8, fontStyle: 'bold' },
            styles: { fontSize: 7.5, cellPadding: 2.2, lineColor: this.BORDER, lineWidth: 0.2, textColor: this.DARK },
            alternateRowStyles: { fillColor: this.LIGHT },
            columnStyles: {
                0: { cellWidth: 55, fontStyle: 'bold' },
                1: { cellWidth: 32, halign: 'center' },
                2: { cellWidth: 32, halign: 'center' },
                3: { cellWidth: 32, halign: 'center', fontStyle: 'bold' },
                4: { cellWidth: 'auto' }
            },
            didParseCell: (d) => {
                if (d.section === 'body') {
                    const rowItem = sortedItems[d.row.index];
                    if (rowItem && rowItem.isDivergent) {
                        if (d.column.index === 3) {
                            d.cell.styles.fillColor = [254, 226, 226];
                            d.cell.styles.textColor = [185, 28, 28];
                        }
                    } else if (rowItem && !rowItem.isDivergent) {
                        if (d.column.index === 3) {
                            d.cell.styles.fillColor = [220, 252, 231];
                            d.cell.styles.textColor = [21, 128, 61];
                        }
                    }
                }
            }
        });
        y = doc.lastAutoTable.finalY + 8;

        this._signatures(doc, y, [
            [supervisorInfo?.name || 'Supervisor da Desmontagem', 'Liberação e Justificativa'],
            ['Controle de Qualidade / Produção', 'Auditoria de Processos']
        ]);
        this._footer(doc, 'Auditoria de Divergências ' + this._txt(orderData.business_id, ''));

        return this._finalizeAndUpload(doc, `Auditoria_Divergencias_${orderData.business_id || 'OS'}`, 'divergencias', orderData.id, 'divergencias', supabaseClient);
    },

    // ------------------------------------------------------------------
    // Upload para Supabase Storage (com fallback para blob local)
    // ------------------------------------------------------------------
    async _finalizeAndUpload(doc, baseFileName, storageFolder, orderId, sectorKey, supabaseClient) {
        const pdfBlob = doc.output('blob');
        const localUrl = URL.createObjectURL(pdfBlob);

        if (!supabaseClient) return localUrl;

        let fileName = `${baseFileName}_${Date.now()}.pdf`;
        fileName = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_.-]/g, '_');
        const path = `${storageFolder}/${fileName}`;

        const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

        try {
            const { error: uploadError } = await Promise.race([
                supabaseClient.storage.from('pdfs').upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true }),
                timeout(15000)
            ]);
            if (uploadError) throw uploadError;

            const { data: pub } = supabaseClient.storage.from('pdfs').getPublicUrl(path);
            const pdfUrl = pub.publicUrl;

            if (orderId) {
                try {
                    const { data: os } = await supabaseClient.from('service_orders').select('sector_pdfs').eq('id', orderId).single();
                    const pdfs = (os && os.sector_pdfs) || {};
                    pdfs[sectorKey] = pdfUrl;
                    await supabaseClient.from('service_orders').update({ sector_pdfs: pdfs }).eq('id', orderId);
                } catch (e) {
                    console.warn('Erro ao registrar sector_pdfs:', e);
                }
            }
            return pdfUrl;
        } catch (e) {
            console.warn('Upload do PDF falhou, usando arquivo local:', e);
            return localUrl;
        }
    }
};

window.PDFGenerator = PDFGenerator;
// Pré-carrega as bibliotecas assim que a página abre
PDFGenerator.loadScript().catch(() => {});
