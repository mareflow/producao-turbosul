const PartNumberAutocomplete = {
    search(rows, term) {
        const query = String(term || '').trim().toUpperCase();
        if (!query) return [];
        return rows.filter(part => typeof part.partNumber === 'string' && part.partNumber.toUpperCase().startsWith(query)).slice(0, 50);
    },
    init(input, model, dropdown, fetchCatalog = () => fetch('./js/pecas.json')) {
        if (!input || !model || !dropdown) return;
        let rows = [], state = 'loading', selected = null;
        const hide = () => dropdown.classList.add('hidden');
        const message = text => {
            const line = document.createElement('p');
            line.className = 'px-3 py-3 text-sm text-gray-600';
            line.textContent = text; dropdown.appendChild(line);
        };
        const choose = part => {
            input.value = part.partNumber;
            model.value = part.modelo;
            selected = part.partNumber;
            hide();
        };
        function render() {
            dropdown.replaceChildren();
            if (!input.value.trim()) { hide(); return; }
            dropdown.classList.remove('hidden');
            if (state === 'loading') { message('Carregando lista de part numbers…'); return; }
            if (state === 'error') {
                message('Não foi possível carregar a lista.');
                const retry = document.createElement('button');
                retry.type = 'button'; retry.className = 'px-3 py-2 text-blue-700 font-bold text-sm';
                retry.textContent = 'Tentar novamente'; retry.onclick = () => load();
                dropdown.appendChild(retry); return;
            }
            const matches = PartNumberAutocomplete.search(rows, input.value);
            if (!matches.length) { message('Nenhum part number encontrado.'); return; }
            for (const part of matches) {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'w-full text-left px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 flex flex-col';
                const number = document.createElement('span');
                number.className = 'font-bold text-gray-800 text-sm'; number.textContent = part.partNumber;
                const description = document.createElement('span');
                description.className = 'text-xs text-gray-500 uppercase'; description.textContent = part.modelo;
                option.append(number, description); option.onclick = () => choose(part);
                dropdown.appendChild(option);
            }
        }
        async function load() {
            state = 'loading';
            if (document.activeElement === input) render();
            try {
                const response = await fetchCatalog();
                if (!response.ok) throw new Error('Catálogo indisponível');
                const catalog = await response.json();
                if (!Array.isArray(catalog)) throw new Error('Catálogo inválido');
                rows = catalog.filter(part => part && typeof part.partNumber === 'string' && typeof part.modelo === 'string');
                state = 'ready';
            } catch { state = 'error'; }
            // Reexecuta a busca que foi digitada durante o carregamento.
            if (document.activeElement === input || !dropdown.classList.contains('hidden')) render();
        }
        input.addEventListener('input', () => {
            if (input.value !== selected) { model.value = ''; selected = null; }
            render();
        });
        input.addEventListener('focus', render);
        input.addEventListener('keydown', event => {
            if (event.key === 'Escape') hide();
            if (event.key === 'Enter' && !selected && state === 'ready') {
                const exact = rows.find(part => part.partNumber.toUpperCase() === input.value.trim().toUpperCase());
                if (exact) { event.preventDefault(); choose(exact); }
            }
        });
        document.addEventListener('click', event => {
            if (event.target !== input && !dropdown.contains(event.target)) hide();
        });
        input.form?.addEventListener('reset', () => { selected = null; hide(); });
        const ready = load();
        return { ready, reload: load };
    }
};
window.PartNumberAutocomplete = PartNumberAutocomplete;
document.addEventListener('DOMContentLoaded', () => PartNumberAutocomplete.init(
    document.getElementById('part_number'), document.getElementById('modelo_turbo'), document.getElementById('part_number_dropdown')
));
