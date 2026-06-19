const fs = require('fs');
const files = [
  'analise-tecnica.html', 'balanceamento.html', 'bancada.html',
  'comercial.html', 'desmontagem.html', 'expedicao.html',
  'metrologia.html', 'montagem.html', 'qualidade.html',
  'retifica.html', 'solda.html', 'quadro-producao.html'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    // Só injeta se não tiver ainda
    if (!content.includes('<script src="js/auth.js"></script>')) {
      content = content.replace('</body>', '    <script src="js/auth.js"></script>\n</body>');
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Injetado em ${file}`);
    } else {
      console.log(`Já presente em ${file}`);
    }
  }
}
