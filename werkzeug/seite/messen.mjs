// Misst Bildzeiten während Kapitelwechseln – NUR auf der NVIDIA-Karte (bricht sonst vor dem Laden ab).
//   node werkzeug/seite/messen.mjs [--basis URL] [--url-zusatz "stufe=desktop"]
import { chromium } from 'playwright-core';
const arg = (n, s) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : s; };
process.env.PORT = '8292';
await import('./server.mjs');
const basis = arg('basis', 'http://localhost:8292/OgameX_3D_Mod/'), zusatz = arg('url-zusatz', '');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
	args: ['--force_high_performance_gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const log = []; page.on('console', (m) => log.push(m.text()));
await page.goto(basis + 'celestia2/x', { waitUntil: 'domcontentloaded' }).catch(() => {});
const gpu = await page.evaluate(async () => (await navigator.gpu?.requestAdapter())?.info.vendor);
if (gpu !== 'nvidia') { console.error('ABBRUCH: GPU', gpu); process.exit(2); }
await page.goto(basis + 'celestia2/' + (zusatz ? '?' + zusatz : ''));
await page.waitForFunction(() => window.celestia?.teile?.station, null, { timeout: 60000 });
await page.waitForTimeout(3000);
for (const k of [1, 2, 3, 0]) {
	const r = await page.evaluate(async (k) => {
		const z = []; let a = performance.now(), lauf = true;
		const f = (t) => { z.push(t - a); a = t; if (lauf) requestAnimationFrame(f); }; requestAnimationFrame(f);
		window.celestia.kapitel(k);
		await new Promise((r) => setTimeout(r, 4000)); lauf = false;
		z.sort((x, y) => x - y);
		return { bilder: z.length, median: z[z.length >> 1].toFixed(1), p95: z[Math.floor(z.length * 0.95)].toFixed(1), max: z.at(-1).toFixed(1), ueber33: z.filter((x) => x > 33).length };
	}, k);
	console.log('Wechsel zu Kapitel', k, JSON.stringify(r));
}
console.log(log.filter((l) => /Stufe|Fehler|error/i.test(l)).join('\n'));
await browser.close(); process.exit(0);
