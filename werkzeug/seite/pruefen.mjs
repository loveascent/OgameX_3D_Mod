// Prüfstand für celestia2: echter Chrome, NUR auf der NVIDIA-Karte. Ist die GPU eine andere (z. B. iGPU), bricht
// er ab, BEVOR die Seite geladen wird.
//   node werkzeug/seite/pruefen.mjs [--kapitel 0,3,5] [--format quer|hoch] [--warte 6] [--url-zusatz "aus=hitze"]
// Ergebnis: werkzeug/seite/bilder/<format>-k<i>.png, Konsole und Kennzahlen auf stdout.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, s) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : s; };
const kapitel = arg('kapitel', '0').split(',').map(Number);
const format = arg('format', 'quer');
const warte = Number(arg('warte', '6'));
const zusatz = arg('url-zusatz', '');
const schuss = process.argv.includes('--schuss');   // im letzten Kapitel auf einen Schuss warten und ihn in Bildern festhalten
const groesse = format === 'hoch' ? { width: 390, height: 844 } : { width: 1600, height: 900 };
const bilder = join(dirname(fileURLToPath(import.meta.url)), 'bilder');
mkdirSync(bilder, { recursive: true });

process.env.PORT = '8291';
await import('./server.mjs');
const basis = arg('basis', 'http://localhost:8291/OgameX_3D_Mod/');   // z. B. https://loveascent.github.io/OgameX_3D_Mod/

const browser = await chromium.launch({
	executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
	args: ['--force_high_performance_gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: groesse, deviceScaleFactor: 1 });
const konsole = [];
page.on('console', (m) => konsole.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => konsole.push(`[pageerror] ${e.message}`));

await page.goto(basis + 'celestia2/leer-fuer-gpu-test', { waitUntil: 'domcontentloaded' }).catch(() => {});
const gpu = await page.evaluate(async () => { const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' }); return a ? { hersteller: a.info.vendor, architektur: a.info.architecture } : null; });
console.log('GPU:', JSON.stringify(gpu));
if (gpu?.hersteller !== 'nvidia') { console.error('ABBRUCH: nicht die NVIDIA-Karte – es wird nichts geladen.'); await browser.close(); process.exit(2); }

const t0 = Date.now();
await page.goto(basis + 'celestia2/' + (zusatz ? '?' + zusatz : ''), { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('welt-bereit') || document.body.classList.contains('ohne-welt'), null, { timeout: 90000 }).catch(() => konsole.push('[prüfstand] welt-bereit nicht erreicht'));
console.log('Welt sichtbar nach', ((Date.now() - t0) / 1000).toFixed(1), 's; GPU der Seite:', JSON.stringify(await page.evaluate(() => window.celestia?.gpu)));
await page.waitForFunction(() => !!window.celestia?.teile?.station, null, { timeout: 60000 }).catch(() => konsole.push('[prüfstand] Station nicht geladen'));
console.log('Station da nach', ((Date.now() - t0) / 1000).toFixed(1), 's');

for (const k of kapitel) {
	await page.evaluate((i) => window.celestia?.kapitel?.(i), k);
	await page.waitForTimeout(warte * 1000);
	const datei = join(bilder, `${format}-k${k}.png`);
	await page.screenshot({ path: datei });
	const info = await page.evaluate(() => { const c = window.celestia; const s = c?.teile?.station; return { muendung: s?.zustand?.muendungModell?.map((v) => +v.toFixed(3)), achse: s?.zustand?.d?.map((v) => +v.toFixed(3)), fehlerGrad: s?.fehlerGrad?.toFixed(3), strahl: c?.teile?.strahl?.zustand && { an: c.teile.strahl.zustand.an, L: Math.round(c.teile.strahl.zustand.L) }, kamera: c?.kamera && { fov: c.kamera.fov.toFixed(1) } }; });
	console.log(`Kapitel ${k}:`, datei, JSON.stringify(info));
}
if (schuss) {
	await page.waitForFunction(() => window.celestia?.teile?.strahl?.zustand?.an, null, { timeout: 60000 }).catch(() => console.log('kein Schuss in 60 s'));
	for (const [i, ms] of [400, 900, 1200, 2500].entries()) {
		await page.waitForTimeout(ms);
		const datei = join(bilder, `${format}-schuss${i}.png`);
		await page.screenshot({ path: datei });
		console.log('Schuss', i, datei);
	}
}
console.log(konsole.slice(-40).join('\n'));
await browser.close();
process.exit(0);
