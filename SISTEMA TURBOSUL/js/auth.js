// js/auth.js

// Mapeamento local (relativo)
const ROLE_REDIRECTS = {
    'PRE-VENDAS': './pre-vendas.html',
    'ANALISE-TECNICA': './analise-tecnica.html',
    'VENDAS': './comercial.html',
    'TRIAGEM': './triagem.html',
    'DESMONTAGEM': './desmontagem.html',
    'RETIFICA': './retifica.html',
    'SOLDA': './solda.html',
    'METROLOGIA': './metrologia.html',
    'BANCADA': './bancada.html',
    'BALANCEAMENTO': './balanceamento.html',
    'MONTAGEM': './montagem.html',
    'CONTROLE-QUALIDADE': './qualidade.html',
    'EXPEDICAO': './expedicao.html',
    'ADMINISTRADOR': './admin.html',
    'QUADRO-PRODUCAO': './quadro-producao.html' // Assumindo que essa é a geral
};

function initLoginForm() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const btn = document.getElementById('btn-submit-login');

        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-2"></i> Autenticando...`;

        try {
            // 1. Tenta autenticar o usuário
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                if (typeof showToast === 'function') showToast(error.message, 'error');
                else alert(error.message);
                
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-right-to-bracket mr-2"></i> Conectar Estação`;
                return;
            }

            if (data && data.user) {
                let role = data.user.user_metadata?.role;

                // 2. CONTINGÊNCIA: Se não estiver no user_metadata, busca na tabela profiles
                if (!role) {
                    const { data: profile, error: profileError } = await supabaseClient
                        .from('profiles')
                        .select('role')
                        .eq('id', data.user.id)
                        .single();
                    
                    if (!profileError && profile) {
                        role = profile.role;
                    }
                }

                // 3. REDIRECIONAMENTO DINÂMICO LOCAL
                const targetUrl = ROLE_REDIRECTS[role];
                if (targetUrl) {
                    if (typeof showToast === 'function') showToast('Autenticado com sucesso! Redirecionando...');
                    setTimeout(() => {
                        window.location.href = targetUrl;
                    }, 1000);
                } else {
                    // Se o papel não for mapeado, envia para a tela geral (Quadro de Produção)
                    window.location.href = './quadro-producao.html';
                }
            }

        } catch (err) {
            console.error(err);
            if (typeof showToast === 'function') showToast('Falha na conexão de rede.', 'error');
            else alert('Falha na conexão de rede.');
            
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-right-to-bracket mr-2"></i> Conectar Estação`;
        }
    });
}

async function checkAuthAndProtect() {
    // Descobre qual página o usuário está acessando
    let currentPage = window.location.pathname.split('/').pop();
    if (!currentPage) currentPage = 'index.html';

    // Lista de páginas que NÃO exigem login
    const publicPages = ['login.html', 'index.html'];

    // Se a página atual exigir login, checa a sessão
    if (!publicPages.includes(currentPage)) {
        try {
            const { data: { session }, error } = await supabaseClient.auth.getSession();
            if (error || !session) {
                // Usuário não está logado, bloqueia acesso e redireciona
                console.warn("Acesso negado: Usuário não autenticado.");
                window.location.replace('./login.html');
            }
        } catch (e) {
            console.error("Erro ao verificar sessão:", e);
            window.location.replace('./login.html');
        }
    }
}

// Função global e segura de logout
async function handleLogout(e) {
    if (e) e.preventDefault();
    try {
        if (typeof supabaseClient !== 'undefined') {
            await supabaseClient.auth.signOut();
        }
    } catch (err) {
        console.error("Erro ao deslogar do Supabase:", err);
    }
    window.location.replace('./login.html');
}

// Configura automaticamente os botões e links de logout na página
function setupLogoutButtons() {
    // 1. Procura pelo id "logout-button"
    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) {
        logoutBtn.removeAttribute('onclick');
        logoutBtn.addEventListener('click', handleLogout);
    }

    // 2. Procura por qualquer botão ou link que contenha a palavra "Sair"
    const allButtons = document.querySelectorAll('button, a');
    allButtons.forEach(btn => {
        if (btn.textContent.trim().toLowerCase().includes('sair')) {
            btn.removeAttribute('onclick');
            btn.removeEventListener('click', handleLogout);
            btn.addEventListener('click', handleLogout);
        }
    });
}

// Vincula os listeners de DOM após carregamento completo
document.addEventListener('DOMContentLoaded', () => {
    initLoginForm();
    setupLogoutButtons();
});

// Executa a proteção de rotas IMEDIATAMENTE (assim que o script é carregado)
// para evitar "flash" de conteúdo protegido e chamadas de API indesejadas
checkAuthAndProtect();

