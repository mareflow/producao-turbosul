// js/pdf_generator.js

const PDFGenerator = {
    BRAND_RED: '#b91c1c',
    BRAND_GRAY: '#1e293b',
    BRAND_LIGHT_GRAY: '#f1f5f9',

    async loadScript() {
        if (window.html2pdf) return true;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    async generateAnalysisPDF(orderData, checklistData, supabaseClient) {
        await this.loadScript();

        const now = new Date();
        const dataFormatada = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR');
        
        const htmlContent = `
            <div style="width: 800px; padding: 40px; font-family: 'Arial', sans-serif; color: ${this.BRAND_GRAY}; background-color: white;">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${this.BRAND_RED}; padding-bottom: 20px; margin-bottom: 30px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div>
                            <h1 style="color: ${this.BRAND_RED}; margin: 0; font-size: 28px; font-weight: 900; text-transform: uppercase;">Laudo Técnico</h1>
                            <p style="margin: 5px 0 0 0; font-size: 14px; font-weight: bold;">TurboSul - Controle de Qualidade</p>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <p style="margin: 0; font-size: 18px; font-weight: 900;">OS: <span style="color: ${this.BRAND_RED};">${orderData.business_id || ''}</span></p>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: #64748b;">Emitido em: ${dataFormatada}</p>
                    </div>
                </div>

                <!-- OS Data -->
                <div style="background-color: ${this.BRAND_LIGHT_GRAY}; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                    <h2 style="font-size: 16px; margin-top: 0; margin-bottom: 15px; color: ${this.BRAND_RED}; text-transform: uppercase; font-weight: 900; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px;">Dados do Equipamento</h2>
                    <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; width: 50%;"><strong>Cliente:</strong> ${orderData.client || 'N/A'}</td>
                            <td style="padding: 8px 0; width: 50%;"><strong>Modelo:</strong> ${orderData.model || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;"><strong>Padrão de Desgaste:</strong> ${orderData.pattern || 'Não especificado'}</td>
                            <td style="padding: 8px 0;"><strong>Entrada:</strong> ${orderData.created_at ? new Date(orderData.created_at).toLocaleDateString('pt-BR') : orderData.date || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;" colspan="2"><strong>Observações/Placa:</strong> ${orderData.observations || 'N/A'}</td>
                        </tr>
                    </table>
                </div>

                <!-- Checklist -->
                <h2 style="font-size: 16px; margin-bottom: 15px; color: ${this.BRAND_RED}; text-transform: uppercase; font-weight: 900; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px;">Análise das Peças</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 30px; text-transform: uppercase;">
                    <thead>
                        <tr style="background-color: ${this.BRAND_GRAY}; color: white;">
                            <th style="padding: 10px; text-align: left; border: 1px solid #cbd5e1;">Peça / Item</th>
                            <th style="padding: 10px; text-align: center; border: 1px solid #cbd5e1; width: 150px;">Veredito</th>
                            <th style="padding: 10px; text-align: left; border: 1px solid #cbd5e1;">Observação Técnica</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${checklistData.map(item => {
                            let badgeColor = "color: #334155;";
                            if (item.status === 'PEÇA OK' || item.status === 'BOM / OK') badgeColor = "color: #16a34a; font-weight: bold;";
                            else if (item.status === 'TROCAR') badgeColor = "color: #dc2626; font-weight: bold;";
                            else if (item.status === 'RECONDICIONAR') badgeColor = "color: #d97706; font-weight: bold;";
                            else if (item.status === 'ITEM FALTANTE') badgeColor = "color: #000; font-weight: bold;";
                            
                            return `
                            <tr>
                                <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">${item.name || item.item_name}</td>
                                <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; ${badgeColor}">${item.status}</td>
                                <td style="padding: 10px; border: 1px solid #cbd5e1; color: #64748b;">${item.obs || item.observation || '-'}</td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>

                <!-- Observações Gerais -->
                <h2 style="font-size: 16px; margin-bottom: 15px; color: ${this.BRAND_RED}; text-transform: uppercase; font-weight: 900; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px;">Parecer Técnico Geral</h2>
                <div style="background-color: ${this.BRAND_LIGHT_GRAY}; border-radius: 8px; padding: 20px; font-size: 14px; min-height: 80px; line-height: 1.6;">
                    ${orderData.observation ? orderData.observation.replace(/\n/g, '<br>') : 'Nenhuma observação técnica adicional.'}
                </div>

                <!-- Assinatura -->
                <div style="margin-top: 60px; text-align: center;">
                    <div style="width: 250px; border-bottom: 1px solid ${this.BRAND_GRAY}; margin: 0 auto 10px auto;"></div>
                    <p style="margin: 0; font-size: 14px; font-weight: bold; text-transform: uppercase;">Departamento Técnico - TurboSul</p>
                </div>
            </div>
        `;

        return new Promise((resolve, reject) => {
            const opt = {
                margin:       0,
                filename:     `Laudo_Tecnico_${orderData.business_id}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
            };

            html2pdf().from(htmlContent).set(opt).outputPdf('blob').then(async (pdfBlob) => {
                try {
                    let fileName = `${orderData.business_id}_${Date.now()}.pdf`;
                    fileName = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_.-]/g, '_');
                    
                    const { data: uploadData, error: uploadError } = await supabaseClient
                        .storage
                        .from('pdfs')
                        .upload(`analise/${fileName}`, pdfBlob, {
                            contentType: 'application/pdf',
                            upsert: true
                        });

                    if (uploadError) throw uploadError;

                    const { data: publicUrlData } = supabaseClient
                        .storage
                        .from('pdfs')
                        .getPublicUrl(`analise/${fileName}`);

                    const pdfUrl = publicUrlData.publicUrl;

                    const { data: currentOs } = await supabaseClient
                        .from('service_orders')
                        .select('sector_pdfs')
                        .eq('id', orderData.id)
                        .single();

                    const currentPdfs = currentOs?.sector_pdfs || {};
                    currentPdfs['analise_tecnica'] = pdfUrl;

                    await supabaseClient
                        .from('service_orders')
                        .update({ sector_pdfs: currentPdfs })
                        .eq('id', orderData.id);

                    resolve(pdfUrl);
                } catch (e) {
                    console.error("Erro ao fazer upload do PDF:", e);
                    reject(e);
                }
            }).catch((err) => {
                reject(err);
            });
        });
    },

    async generateComercialPDF(orderData, checklistData, supabaseClient) {
        await this.loadScript();

        const now = new Date();
        const dataFormatada = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR');

        const htmlContent = `
            <div style="width: 800px; padding: 40px; font-family: 'Arial', sans-serif; color: ${this.BRAND_GRAY}; background-color: white;">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${this.BRAND_RED}; padding-bottom: 20px; margin-bottom: 30px;">
                    <div>
                        <h1 style="color: ${this.BRAND_RED}; margin: 0; font-size: 28px; font-weight: 900; text-transform: uppercase;">Orçamento Aprovado</h1>
                        <p style="margin: 5px 0 0 0; font-size: 14px; font-weight: bold;">TurboSul - Vendas</p>
                    </div>
                    <div style="text-align: right;">
                        <p style="margin: 0; font-size: 18px; font-weight: 900;">OS: <span style="color: ${this.BRAND_RED};">${orderData.business_id || ''}</span></p>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: #64748b;">Emitido em: ${dataFormatada}</p>
                    </div>
                </div>

                <!-- OS Data -->
                <div style="background-color: ${this.BRAND_LIGHT_GRAY}; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                    <h2 style="font-size: 16px; margin-top: 0; margin-bottom: 15px; color: ${this.BRAND_RED}; text-transform: uppercase; font-weight: 900; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px;">Dados do Equipamento</h2>
                    <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; width: 50%;"><strong>Cliente:</strong> ${orderData.client || 'N/A'}</td>
                            <td style="padding: 8px 0; width: 50%;"><strong>Modelo:</strong> ${orderData.model || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;"><strong>Padrão de Desgaste:</strong> ${orderData.pattern || 'Não especificado'}</td>
                            <td style="padding: 8px 0;"><strong>Ref. Orçamento:</strong> ${orderData.ref_orcamento || orderData.business_id}</td>
                        </tr>
                    </table>
                </div>

                <!-- Checklist -->
                <h2 style="font-size: 16px; margin-bottom: 15px; color: ${this.BRAND_RED}; text-transform: uppercase; font-weight: 900; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px;">Peças e Serviços Aprovados</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 30px; text-transform: uppercase;">
                    <thead>
                        <tr style="background-color: ${this.BRAND_GRAY}; color: white;">
                            <th style="padding: 10px; text-align: left; border: 1px solid #cbd5e1;">Item / Peça</th>
                            <th style="padding: 10px; text-align: center; border: 1px solid #cbd5e1; width: 250px;">Decisão Comercial</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${checklistData.map(item => {
                            let badgeColor = "color: #334155;";
                            if (item.decisao_vendas === 'APROVAR VENDA' || item.decisao_vendas === 'VENDIDO') badgeColor = "color: #16a34a; font-weight: bold;";
                            else if (item.decisao_vendas === 'RECONDICIONAR' || item.decisao_vendas === 'VENDA COM RECONDICIONAMENTO') badgeColor = "color: #d97706; font-weight: bold;";
                            else if (item.decisao_vendas === 'FORNECER PEÇA NOVA') badgeColor = "color: #2563eb; font-weight: bold;";
                            
                            return `
                            <tr>
                                <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">${item.item_name}</td>
                                <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; ${badgeColor}">${item.decisao_vendas || 'NÃO APLICÁVEL'}</td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>

                <!-- Observações Gerais -->
                <h2 style="font-size: 16px; margin-bottom: 15px; color: ${this.BRAND_RED}; text-transform: uppercase; font-weight: 900; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px;">Observações Comerciais</h2>
                <div style="background-color: ${this.BRAND_LIGHT_GRAY}; border-radius: 8px; padding: 20px; font-size: 14px; min-height: 80px; line-height: 1.6;">
                    ${orderData.vendas_observacoes ? orderData.vendas_observacoes.replace(/\n/g, '<br>') : 'Sem observações adicionais.'}
                </div>

                <!-- Assinatura -->
                <div style="margin-top: 60px; text-align: center;">
                    <div style="width: 250px; border-bottom: 1px solid ${this.BRAND_GRAY}; margin: 0 auto 10px auto;"></div>
                    <p style="margin: 0; font-size: 14px; font-weight: bold; text-transform: uppercase;">Departamento Comercial - TurboSul</p>
                </div>
            </div>
        `;

        return new Promise((resolve, reject) => {
            const opt = {
                margin:       0,
                filename:     `Orcamento_${orderData.business_id}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
            };

            html2pdf().from(htmlContent).set(opt).outputPdf('blob').then(async (pdfBlob) => {
                try {
                    let fileName = `${orderData.business_id}_${Date.now()}.pdf`;
                    fileName = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_.-]/g, '_');
                    
                    const { data: uploadData, error: uploadError } = await supabaseClient
                        .storage
                        .from('pdfs')
                        .upload(`vendas/${fileName}`, pdfBlob, {
                            contentType: 'application/pdf',
                            upsert: true
                        });

                    if (uploadError) throw uploadError;

                    const { data: publicUrlData } = supabaseClient
                        .storage
                        .from('pdfs')
                        .getPublicUrl(`vendas/${fileName}`);

                    const pdfUrl = publicUrlData.publicUrl;

                    const { data: currentOs } = await supabaseClient
                        .from('service_orders')
                        .select('sector_pdfs')
                        .eq('id', orderData.id)
                        .single();

                    const currentPdfs = currentOs?.sector_pdfs || {};
                    currentPdfs['vendas'] = pdfUrl;

                    await supabaseClient
                        .from('service_orders')
                        .update({ sector_pdfs: currentPdfs })
                        .eq('id', orderData.id);

                    resolve(pdfUrl);
                } catch (e) {
                    console.error("Erro ao fazer upload do PDF:", e);
                    reject(e);
                }
            }).catch((err) => {
                reject(err);
            });
        });
    }
};
window.PDFGenerator = PDFGenerator;
