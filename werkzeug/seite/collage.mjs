// Mehrere Bilder zu einer Collage (spart Token beim Ansehen).   node collage.mjs ausgabe.png spalten breite datei1 datei2 …
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [aus, sp, b, ...dateien] = process.argv.slice(2);
const bild = readFileSync(dateien[0]), br = Number(b), sps = Number(sp);
const html = '<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(' + sps + ',' + br + 'px);gap:2px">' + dateien.map((d, i) => '<div style="position:relative"><img width="' + br + '" style="display:block" src="data:image/png;base64,' + readFileSync(d).toString('base64') + '"><i style="position:absolute;left:6px;top:4px;color:#ff0;font:13px monospace">' + (i) + '</i></div>').join('') + '</body>';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const p = await browser.newPage({ viewport: { width: br * sps + 2 * sps, height: 100 } });
await p.setContent(html); await p.waitForTimeout(400);
await p.screenshot({ path: aus, fullPage: true }); await browser.close();
