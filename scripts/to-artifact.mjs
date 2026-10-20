// Converte dist/index.html (arquivo único) no formato de página do Artifact:
// sem <!doctype>/<html>/<head>/<body> — o publicador adiciona o esqueleto.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const metas = [...html.matchAll(/<meta name="(claude:[^"]+|theme-color)"[^>]*>/g)].map((m) => m[0]);
const links = [...html.matchAll(/<link [^>]*fonts\.(googleapis|gstatic)[^>]*>/g)].map((m) => m[0]);
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) throw new Error('script não encontrado');
const out = [title, ...metas, ...links, ...styles, '<div id="root"></div>', ...scripts.map((js) => `<script type="module">${js}</script>`)].join('\n');
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/projeto-tjsp.html', out);
console.log('artifact/projeto-tjsp.html', (out.length / 1024).toFixed(0) + ' KB');
