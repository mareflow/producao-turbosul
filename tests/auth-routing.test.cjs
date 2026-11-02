const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/auth.js', 'utf8');
const origin = 'https://producao-turbosul.vercel.app';
async function page(path, options = {}) {
    const url = new URL(path, origin), navigations = [], storage = new Map();
    const stats = { sessions: 0, profiles: 0, signouts: 0 };
    const location = { pathname: url.pathname, replace(target) {
        const next = new URL(target, url);
        // cleanUrls da Vercel redireciona o destino .html para o endereço sem extensão.
        next.pathname = next.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
        navigations.push(next.pathname + next.search);
    } };
    const client = {
        auth: {
            async getSession() { stats.sessions++; return { data: { session: options.session || null }, error: options.sessionError || null }; },
            async signOut() { stats.signouts++; return { error: null }; }
        },
        from(table) {
            assert.equal(table, 'profiles'); stats.profiles++;
            const query = { select() { return query; }, eq() { return query; },
                async single() { return { data: options.profile || null, error: options.profileError || null }; } };
            return query;
        }
    };
    const context = vm.createContext({ window: { location }, console: { warn() {}, error() {} },
        document: { addEventListener() {} },
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        setTimeout() { throw Error('A proteção da rota não deve agendar redirecionamentos'); } });
    if (!options.noClient) context.supabaseClient = client;
    // Executa o mesmo boot automático de auth.js usado na página publicada.
    vm.runInContext(source, context);
    await new Promise(setImmediate);
    return { context, navigations, stats, storage };
}
const session = role => ({ user: { id: 'test-user', user_metadata: role ? { role } : {} } });
(async () => {
    for (const route of ['/login', '/login.html', '/login/', '/', '/index', '/index.html', '/index/', '/login?origem=triagem#entrar']) {
        for (const noClient of [true, false]) {
            const actual = await page(route, { noClient });
            assert.deepEqual(actual.navigations, [], route + ' é público e não pode redirecionar para si mesmo');
            assert.equal(actual.stats.sessions, 0, 'página pública não consulta a sessão');
        }
    }
    const sectors = { 'pre-vendas': 'PRE-VENDAS', 'analise-tecnica': 'ANALISE-TECNICA', comercial: 'VENDAS', triagem: 'TRIAGEM', desmontagem: 'DESMONTAGEM',
        retifica: 'RETÍFICA', solda: 'SOLDA', metrologia: 'METROLOGIA', bancada: 'BANCADA', balanceamento: 'BALANCEAMENTO', montagem: 'MONTAGEM',
        qualidade: 'CONTROLE-QUALIDADE', expedicao: 'EXPEDIÇÃO', admin: 'ADMINISTRADOR', 'quadro-producao': 'QUADRO-PRODUCAO' };
    for (const [sector, role] of Object.entries(sectors)) {
        for (const extension of ['', '.html', '/']) {
            const route = '/' + sector + extension;
            const anonymous = await page(route);
            assert.equal(anonymous.navigations.length, 1, route + ': sem sessão volta ao login uma única vez');
            const login = await page(anonymous.navigations[0]);
            assert.deepEqual(login.navigations, [], 'após o redirecionamento da Vercel o login permanece estável');
            assert.equal((await page(route, { session: session(role) })).navigations.length, 0, route + ': setor permitido');
            assert.equal((await page(route, { session: session('ADMIN') })).navigations.length, 0, route + ': administrador permitido');
            const denied = await page(route, { session: session('PERFIL SEM ACESSO') });
            assert.equal(denied.navigations.length, 1, route + ': endereço sem extensão mantém as permissões do setor');
            assert.ok(denied.storage.get('auth_error').includes('não tem permissão'));
        }
    }
    const profile = await page('/retifica', { session: session(), profile: { role: 'RETIFICA' } });
    assert.equal(profile.stats.profiles, 1);
    assert.deepEqual(profile.navigations, []);
    const deleted = await page('/montagem', { session: session(), profileError: Error('Perfil inexistente') });
    assert.equal(deleted.stats.signouts, 1);
    assert.deepEqual(deleted.navigations, ['/login']);
    assert.deepEqual((await page('/login', { session: session(), profileError: Error('Perfil inexistente') })).navigations, []);
    const expired = await page('/triagem', { sessionError: Error('Sessão expirada') });
    assert.deepEqual(expired.navigations, ['/login']);
    assert.ok(expired.storage.get('auth_error').includes('Sessão expirada'));
    const noSdk = await page('/solda', { noClient: true });
    assert.deepEqual(noSdk.navigations, ['/login']);
    assert.deepEqual((await page('/login', { noClient: true })).navigations, [], 'falha ao carregar SDK não cria um loop no login');
    const { context } = await page('/login');
    for (const path of ['/retifica', '/retifica.html', '/retifica/', '/retifica?x=1', '/retifica.html#servico']) {
        assert.equal(context.getAuthPageName(path), 'retifica.html');
    }
    assert.equal(context.getAuthPageName('/'), 'index.html');
    console.log('OK: login público sem loop, URLs limpas/.html/barra final, 15 setores, permissões, sessão expirada, SDK ausente e perfil no banco');
})().catch(error => { console.error(error); process.exitCode = 1; });