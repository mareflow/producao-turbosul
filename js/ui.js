// js/ui.js
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return; // Se o container ainda não foi injetado, ignora.

    const icon = document.getElementById('toast-icon');
    const msg = document.getElementById('toast-message');

    msg.innerText = message;
    toast.classList.remove('border-green-500', 'border-red-500');

    if (type === 'success') {
        icon.innerHTML = `<i class="fa-regular fa-circle-check text-green-500"></i>`;
        toast.classList.add('border-green-500');
    } else {
        icon.innerHTML = `<i class="fa-regular fa-circle-xmark text-red-500"></i>`;
        toast.classList.add('border-red-500');
    }

    toast.classList.remove('opacity-0', 'translate-y-20', 'pointer-events-none');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-20', 'pointer-events-none');
        toast.classList.remove('opacity-100', 'translate-y-0');
    }, 4000);
}

function injectFooter() {
    const footerContainer = document.getElementById('app-footer');
    if (footerContainer) {
        footerContainer.innerHTML = `
            <footer class="py-3 text-center border-t bg-white/40 backdrop-blur-sm z-10 w-full mt-auto">
                <div class="flex items-center justify-center space-x-2">
                    <span class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Desenvolvido por</span>
                    <span class="text-[10px] font-black text-blue-600 uppercase tracking-widest">Maré Flow</span>
                    <span class="text-slate-300">|</span>
                    <span class="text-[9px] font-bold text-slate-400 uppercase tracking-tighter italic">TurboSul Controle de Produção © 2026</span>
                </div>
            </footer>
        `;
    }
}

function injectToast() {
    const toastContainer = document.getElementById('app-toast');
    if (toastContainer) {
        toastContainer.innerHTML = `
            <div id="toast" class="fixed bottom-6 right-6 transform translate-y-20 opacity-0 pointer-events-none transition-all duration-300 z-50 flex items-center space-x-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl border border-slate-800 text-xs font-black uppercase tracking-wider">
                <span id="toast-icon" class="text-lg"></span>
                <span id="toast-message">--</span>
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    injectFooter();
    injectToast();
});
