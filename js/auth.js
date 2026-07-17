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
    'QUADRO-PRODUCAO': './quadro-producao.html'
};

// Permissões de páginas por role do usuário
const PAGE_ALLOWED_ROLES = {
    'pre-vendas.html': ['PRE-VENDAS', 'VENDAS', 'ADMINISTRADOR'],
    'analise-tecnica.html': ['ANALISE-TECNICA', 'ADMINISTRADOR'],
    'comercial.html': ['VENDAS', 'ADMINISTRADOR'],
    'triagem.html': ['TRIAGEM', 'ADMINISTRADOR'],
    'desmontagem.html': ['DESMONTAGEM', 'ADMINISTRADOR'],
    'retifica.html': ['RETIFICA', 'ADMINISTRADOR'],
    'solda.html': ['SOLDA', 'ADMINISTRADOR'],
    'metrologia.html': ['METROLOGIA', 'ADMINISTRADOR'],
    'bancada.html': ['BANCADA', 'ADMINISTRADOR'],
    'balanceamento.html': ['BALANCEAMENTO', 'ADMINISTRADOR'],
    'montagem.html': ['MONTAGEM', 'ADMINISTRADOR'],
    'qualidade.html': ['CONTROLE-QUALIDADE', 'ADMINISTRADOR'],
    'expedicao.html': ['EXPEDICAO', 'ADMINISTRADOR'],
    'admin.html': ['ADMINISTRADOR'],
    'quadro-producao.html': ['QUADRO-PRODUCAO', 'ADMINISTRADOR']
};

function initLoginForm() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        let email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const btn = document.getElementById('btn-submit-login');

        // Se o usuário não digitou um e-mail com @, vamos considerar que ele digitou apenas o nome de usuário (ex: 'joao')
        if (!email.includes('@')) {
            email = email + '@turbosul.local';
        }

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
                    
                    if (profileError || !profile) {
                        alert("Acesso Negado: Usuário desativado ou não encontrado no sistema.");
                        await supabaseClient.auth.signOut();
                        btn.disabled = false;
                        btn.innerHTML = `<i class="fa-solid fa-right-to-bracket mr-2"></i> Conectar Estação`;
                        return;
                    }
                    role = profile.role;
                }

                // Parse role to array
                let userRoles = [];
                if (typeof role === 'string') {
                    userRoles = role.split(',').map(r => r.trim().toUpperCase());
                } else if (Array.isArray(role)) {
                    userRoles = role.map(r => r.toUpperCase());
                } else if (role) {
                    userRoles = [String(role).toUpperCase()];
                }

                // 3. REDIRECIONAMENTO DINÂMICO LOCAL
                if (userRoles.length > 1) {
                    // Oculta o form de login e exibe a seleção de setor
                    const loginFormEl = document.getElementById('login-form');
                    const sectorContainer = document.getElementById('sector-selection-container');
                    const sectorGrid = document.getElementById('sector-buttons-grid');

                    if (loginFormEl && sectorContainer && sectorGrid) {
                        loginFormEl.classList.add('hidden');
                        sectorContainer.classList.remove('hidden');

                        sectorGrid.innerHTML = userRoles.map(r => {
                            const url = ROLE_REDIRECTS[r] || './quadro-producao.html';
                            return `
                                <button onclick="window.location.href='${url}'" class="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-widest transition duration-150 shadow-sm flex items-center justify-between">
                                    <span>${r}</span>
                                    <i class="fa-solid fa-chevron-right text-slate-300"></i>
                                </button>
                            `;
                        }).join('');
                        return; // Para a execução do redirecionamento automático
                    }
                }

                // Pega a primeira role válida que tenha um redirecionamento mapeado se tiver apenas 1 ou se a tela não tiver o container
                let targetUrl = null;
                for (const r of userRoles) {
                    if (ROLE_REDIRECTS[r]) {
                        targetUrl = ROLE_REDIRECTS[r];
                        break;
                    }
                }
                
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

// Cancela a seleção de setor (desloga e volta pro form)
window.cancelSectorSelection = async function() {
    await supabaseClient.auth.signOut();
    document.getElementById('sector-selection-container').classList.add('hidden');
    const loginFormEl = document.getElementById('login-form');
    loginFormEl.classList.remove('hidden');
    
    const btn = document.getElementById('btn-submit-login');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-right-to-bracket mr-2"></i> Conectar Estação`;
    }
};

async function checkAuthAndProtect() {
    // Descobre qual página o usuário está acessando
    let currentPage = window.location.pathname.split('/').pop();
    if (!currentPage) currentPage = 'index.html';

    // Lista de páginas que NÃO exigem login
    const publicPages = ['login.html', 'index.html'];

    // Se a página atual exigir login, checa a sessão
    if (!publicPages.includes(currentPage)) {
        try {
            // Garante que o cliente Supabase existe e é acessível
            let client = null;
            if (typeof supabaseClient !== 'undefined') {
                client = supabaseClient;
            } else if (typeof window.supabaseClient !== 'undefined') {
                client = window.supabaseClient;
            }

            if (!client) {
                throw new Error("Cliente Supabase não inicializado. Certifique-se de que a biblioteca e as configurações do Supabase foram carregadas antes do auth.js.");
            }

            const { data: { session }, error } = await client.auth.getSession();
            if (error || !session) {
                console.warn("Acesso negado: Usuário não autenticado.");
                if (error) {
                    localStorage.setItem('auth_error', `Erro na sessão: ${error.message}`);
                }
                window.location.replace('./login.html');
                return;
            }

            // Busca o papel (role) do usuário na sessão ou no banco
            let role = session.user.user_metadata?.role;

            if (!role) {
                const { data: profile, error: profileError } = await client
                    .from('profiles')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();
                
                if (profileError || !profile) {
                    console.warn("Acesso negado: Perfil deletado ou desativado.");
                    localStorage.setItem('auth_error', "Acesso negado: Seu perfil não foi encontrado ou está desativado.");
                    await client.auth.signOut();
                    window.location.replace('./login.html');
                    return;
                }
                role = profile.role;
            }

            // Parse role to array
            let userRoles = [];
            if (typeof role === 'string') {
                userRoles = role.split(',').map(r => r.trim().toUpperCase());
            } else if (Array.isArray(role)) {
                userRoles = role.map(r => r.toUpperCase());
            } else if (role) {
                userRoles = [String(role).toUpperCase()];
            }

            // Valida se a role do usuário tem permissão para a página atual
            const allowedRoles = PAGE_ALLOWED_ROLES[currentPage];
            if (allowedRoles) {
                const hasPermission = userRoles.some(r => allowedRoles.includes(r));
                if (!hasPermission) {
                    const msg = `Acesso negado: Seu perfil (${userRoles.join(', ')}) não tem permissão para acessar a página '${currentPage}'.`;
                    console.warn(msg);
                    localStorage.setItem('auth_error', msg);
                    window.location.replace('./login.html');
                }
            }
        } catch (e) {
            console.error("Erro ao verificar sessão:", e);
            localStorage.setItem('auth_error', `Erro de Autenticação: ${e.message}`);
            window.location.replace('./login.html');
        }
    }
}

// Exibe erros de autenticação salvos no localStorage
function checkAndShowRedirectErrors() {
    try {
        const redirectError = localStorage.getItem('auth_error');
        if (redirectError) {
            localStorage.removeItem('auth_error');
            setTimeout(() => {
                if (typeof showToast === 'function') {
                    showToast(redirectError, 'error');
                } else {
                    alert(redirectError);
                }
            }, 500);
        }
    } catch (e) {
        console.error("Erro ao verificar erros de redirecionamento:", e);
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

