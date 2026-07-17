
        function closeSupervisorModal(isAuthorized = false) {
            document.getElementById('modal-supervisor').style.display = 'none';
            
            // Só bloqueia a tela se o fechamento NÃO foi autorizado (ex: clicou em Cancelar)
            if (!isAuthorized) {
                const compGrid = document.getElementById('component-grid');
                if(compGrid) {
                    compGrid.classList.add('opacity-40', 'pointer-events-none', 'grayscale');
                }
                alert("⚠️ Divergência não autorizada. As operações desta OS foram bloqueadas.");
            }
        }
    