const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const segments = pathname.split(/[\\/]/);
    if (segments.some(segment => segment.startsWith('.') && segment !== '')) { res.writeHead(403).end(); return; }
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
    if (pathname === '/') file = path.join(root, 'index.html');
    else if (!path.extname(file)) file += '.html';
    if (!['.html', '.js', '.json', '.css', '.png', '.svg', '.ico'].includes(path.extname(file)) || file === __filename || path.basename(file).startsWith('package')) {
        res.writeHead(404).end(); return;
    }
    fs.readFile(file, (error, body) => {
        if (error) { res.writeHead(404).end('Arquivo não encontrado'); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : body);
    });
}).listen(port, '127.0.0.1', () => console.log(`TurboSul local: http://127.0.0.1:${port}/login.html`));
