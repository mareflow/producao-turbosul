const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zghaqlaqozsskfldgsfe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnaGFxbGFxb3pzc2tmbGRnc2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMDY1MzQsImV4cCI6MjA4NDc4MjUzNH0.aC2DMOUNhS2uK6KGI5Sf2c2vGhrCKHMnRyZhL3WwSus';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// IDs dos itens principais do conjunto que precisam ir pra TROCAR CONJUNTO
// OS-001: EIXO (1056), ROTOR (1053), CCO (1052), CCE (1061), CARCAÇA DE TURBINA (1059)
// OS-002: EIXO (1064), ROTOR (1072), CCO (1067), CCE (1068), CARCAÇA DE TURBINA (1066)
const idsToUpdate = [1056, 1053, 1052, 1061, 1059, 1064, 1072, 1067, 1068, 1066];

async function main() {
    console.log('Atualizando itens principais para TROCAR CONJUNTO nas OS-001 e OS-002...');
    
    const { data, error } = await supabase
        .from('checklist_analysis_general')
        .update({ decisao_vendas: 'TROCAR CONJUNTO' })
        .in('id', idsToUpdate);

    if (error) {
        console.error('ERRO ao atualizar:', error);
        return;
    }

    console.log('✅ Atualização feita com sucesso!');
    
    // Verificar resultado
    console.log('\n--- Verificando OS-001 ---');
    const { data: os1 } = await supabase
        .from('checklist_analysis_general')
        .select('id, item_name, decisao_vendas')
        .eq('service_order_id', '7e511da3-8b41-4a4f-9bab-00ca5981c6fb');
    os1.forEach(i => console.log(`  [${i.id}] ${i.item_name} => ${i.decisao_vendas}`));

    console.log('\n--- Verificando OS-002 ---');
    const { data: os2 } = await supabase
        .from('checklist_analysis_general')
        .select('id, item_name, decisao_vendas')
        .eq('service_order_id', '1815a287-1ccb-4465-9eb0-18f859c0f3d9');
    os2.forEach(i => console.log(`  [${i.id}] ${i.item_name} => ${i.decisao_vendas}`));
}
main();
