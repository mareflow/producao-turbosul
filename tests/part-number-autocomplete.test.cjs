const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Element {
    constructor() {
        this.children = []; this.listeners = {}; this.value = '';
        const classes = new Set(['hidden']);
        this.classList = { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) };
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    replaceChildren() { this.children = []; }
    appendChild(child) { this.children.push(child); }
    append(...children) { this.children.push(...children); }
}
const input = new Element(), model = new Element(), dropdown = new Element();
const document = { activeElement: input, createElement: () => new Element(), addEventListener() {} };
const context = vm.createContext({ window: {}, document });
vm.runInContext(fs.readFileSync('js/part-number-autocomplete.js', 'utf8'), context);
const autocomplete = context.window.PartNumberAutocomplete;
const catalog = JSON.parse(fs.readFileSync('js/pecas.json', 'utf8'));
(async () => {
    assert.equal(autocomplete.search(catalog, 'ts').length, 50);
    assert.equal(autocomplete.search(catalog, ' TS5002-M-1 ')[0].partNumber, 'TS5002-M-1');
    let resolveFetch;
    const controller = autocomplete.init(input, model, dropdown, () => new Promise(resolve => { resolveFetch = resolve; }));
    input.value = 'TS'; input.listeners.input();
    assert.match(dropdown.children[0].textContent, /Carregando/);
    resolveFetch({ ok: true, json: async () => catalog }); await controller.ready;
    assert.equal(dropdown.children.length, 50, 'Busca atualizada sem precisar digitar novamente');
    dropdown.children[0].onclick();
    assert.equal(input.value, 'TS5001-M-1'); assert.equal(model.value, catalog.find(p => p.partNumber === input.value).modelo);
    input.value = 'TS5002'; input.listeners.input(); assert.equal(model.value, '', 'Modelo anterior não pode ficar após editar o PN');
    const retry = autocomplete.init(input, model, dropdown, async () => ({ ok: false }));
    await retry.ready;
    assert.equal(dropdown.children[1].textContent, 'Tentar novamente');
    console.log('OK: TS, espaços, catálogo lento, seleção, limpeza de modelo e erro de carregamento');
})().catch(error => { console.error(error); process.exitCode = 1; });
