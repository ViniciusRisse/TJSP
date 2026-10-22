// Gera public/caderno-de-erros.pdf a partir de scripts/caderno.html (requer Playwright/Chromium).
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire((process.env.NODE_PATH || '.') + '/');
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(resolve('scripts/caderno.html')).href);
await page.pdf({ path: 'public/caderno-de-erros.pdf', format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log('public/caderno-de-erros.pdf');
