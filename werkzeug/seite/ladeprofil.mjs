// Ladeprofil: Wann erscheint was, und wo ruckelt es? Echter Chrome auf der NVIDIA-Karte (bricht sonst vor dem Laden ab).
//   node werkzeug/seite/ladeprofil.mjs [--seite Owners] [--mbit 30] [--ms 40] [--dauer 40] [--url-zusatz "aus=mond"] [--bilder]
// Misst im Seitenprozess: Bildabstände > 34 ms (rAF), Long Tasks > 50 ms, Zeitmarken der Seite (window.celestia.zeit),
// Modellstufe der Station. Ausgabe: Zeitleiste und je Sekunde die Zahl der Ruckler (> 34 / > 100 / > 250 ms) und der längste Abstand.
// Netz gedrosselt (Standard 30 Mbit/s, 40 ms), Cache aus – wie ein erster Besuch.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, s) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : s; };
const seite = arg('seite', 'Owners'), mbit = Number(arg('mbit', '30')), latenz = Number(arg('ms', '40')), dauer = Number(arg('dauer', '40'));
const breite = Number(arg('breite', '1600')), hoehe = Number(arg('hoehe', '900')), dsf = Number(arg('dsf', '1'));
const zusatz = arg('url-zusatz', ''), bilderAn = process.argv.includes('--bilder');
const bilder = join(dirname(fileURLToPath(import.meta.url)), 'bilder'); mkdirSync(bilder, { recursive: true });

process.env.PORT = '8292';
await import('./server.mjs');
const basis = 'http://localhost:8292/OgameX_3D_Mod/';
const profil = arg('profil', '');   // Ordner für ein dauerhaftes Chrome-Profil: zweiter Lauf = warmer Shader-Zwischenspeicher (wie ein Wiederbesuch)
const startArgs = { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
	args: ['--force_high_performance_gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] };
const ansicht = { viewport: { width: breite, height: hoehe }, deviceScaleFactor: dsf };
const browser = profil ? await chromium.launchPersistentContext(profil, { ...startArgs, ...ansicht }) : await chromium.launch(startArgs);
const page = profil ? (browser.pages()[0] ?? await browser.newPage()) : await browser.newPage(ansicht);
await page.goto(basis + seite + '/leer-fuer-gpu-test', { waitUntil: 'domcontentloaded' }).catch(() => {});
const gpu = await page.evaluate(async () => { const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' }); return a ? a.info.vendor : null; });
console.log('GPU:', gpu);
if (gpu !== 'nvidia') { console.error('ABBRUCH: nicht die NVIDIA-Karte.'); await browser.close(); process.exit(2); }

const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
if (mbit > 0) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: latenz, downloadThroughput: (mbit * 1e6) / 8, uploadThroughput: (mbit * 1e6) / 8 });

await page.addInitScript(() => {
	window.__pipe = []; for (const n of ['createRenderPipeline','createComputePipeline','createRenderPipelineAsync','createComputePipelineAsync','createShaderModule','createTexture','createBuffer']) { const o = GPUDevice.prototype[n]; GPUDevice.prototype[n] = function (...a) { const t = performance.now(); const r = o.apply(this, a); const d = performance.now() - t; if (d > 8 || /Pipeline/.test(n)) window.__pipe.push([Math.round(t), n.replace('create',''), Math.round(d), a[0]?.label ?? '']); return r; }; }
	window.__ruckler = []; window.__lang = []; window.__stufen = [];
	let letzte = performance.now();
	const f = (t) => { const d = t - letzte; if (d > 34) window.__ruckler.push([Math.round(t), Math.round(d)]); letzte = t; requestAnimationFrame(f); };
	requestAnimationFrame(f);
	try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lang.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ entryTypes: ['longtask'] }); } catch {}
	setInterval(() => { const s = window.celestia?.teile?.station; const n = s?.modellStufe; const l = window.__stufen; if (n && l[l.length - 1]?.[1] !== n) l.push([Math.round(performance.now()), n]); }, 50);
});
const konsole = [];
page.on('console', (m) => { if (m.type() !== 'warning') konsole.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => konsole.push(`[pageerror] ${e.message}`));

const cpu = process.argv.includes('--cpu');
if (cpu) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
const t0 = Date.now();
await page.goto(basis + seite + '/' + (zusatz ? '?' + zusatz : ''), { waitUntil: 'commit' });
if (bilderAn) for (const s of [1, 2, 3, 5, 8]) { await page.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0))); await page.screenshot({ path: join(bilder, `lade-${s}s.png`) }); }
await page.waitForTimeout(Math.max(0, dauer * 1000 - (Date.now() - t0)));

if (cpu) {   // wo geht die Hauptstrang-Zeit hin? (Eigenzeit je Funktion, Top 15)
	const { profile } = await cdp.send('Profiler.stop'); const eigen = new Map(); const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
	profile.samples.forEach((id, i) => { const n = byId.get(id); const k = n.callFrame.functionName + ' ' + n.callFrame.url.split('/').slice(-2).join('/') + ':' + n.callFrame.lineNumber; eigen.set(k, (eigen.get(k) ?? 0) + (dt[i] ?? 0)); });
	{   // Hauptstrang-Zeit je 250 ms (Profilzeit ≈ Seitenzeit, ±100 ms), Ruhe und Programm ausgenommen
		let t = 0; const zeitl = new Map();
		profile.samples.forEach((id, i) => {
			t += dt[i] ?? 0; const n = byId.get(id).callFrame.functionName;
			if (n === '(idle)' || n === '(program)') return;
			const k = Math.floor(t / 250000) * 250; zeitl.set(k, (zeitl.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
		});
		console.log('Aktiver Hauptstrang je 250 ms (Start:ms):', [...zeitl].filter(([, v]) => v > 40).map(([k, v]) => k + ':' + Math.round(v)).join('  '));
	}
	{   // Aufrufketten der teuersten Funktion
		const eltern = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) eltern.set(c, n.id);
		const name = (c) => c.functionName + ' ' + c.url.split('/').slice(-2).join('/') + ':' + c.lineNumber;
		const top = [...eigen].sort((a, b) => b[1] - a[1]).find(([k]) => !k.startsWith('('))?.[0]; const ketten = new Map();
		profile.samples.forEach((id, i) => {
			if (name(byId.get(id).callFrame) !== top) return;
			const kette = []; let p = id;
			for (let d = 0; d < 9 && p; d++) { const c = byId.get(p).callFrame; kette.push((c.functionName || '(anonym)') + '@' + c.url.split('/').pop() + ':' + c.lineNumber); p = eltern.get(p); }
			const k = kette.join(' < '); ketten.set(k, (ketten.get(k) ?? 0) + (dt[i] ?? 0));
		});
		console.log('\nAufrufketten von ' + top + ':'); for (const [k, v] of [...ketten].sort((a, b) => b[1] - a[1]).slice(0, 4)) console.log(String(Math.round(v / 1000)).padStart(6), k);
	}
	console.log('\nCPU Eigenzeit (ms):'); for (const [k, v] of [...eigen].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(String(Math.round(v / 1000)).padStart(6), k);
}
const r = await page.evaluate(() => ({ ruckler: window.__ruckler, lang: window.__lang, stufen: window.__stufen, zeit: window.celestia?.zeit ?? {},
	 tex: (() => { const o = []; const set = new Set(); window.celestia?.teile?.station?.gruppe?.traverse((m) => { for (const mat of [].concat(m.material ?? [])) for (const k in mat) { const t = mat[k]; if (t?.isTexture && !set.has(t)) { set.add(t); o.push(k + ' ' + (t.image?.width ?? t.mipmaps?.[0]?.width) + 'x' + (t.image?.height ?? t.mipmaps?.[0]?.height) + ' fmt' + t.format + (t.isCompressedTexture ? ' komprimiert mips' + t.mipmaps?.length : ' roh')); } } }); return o; })(), pipe: window.__pipe, bereit: document.body.classList.contains('welt-bereit'), nav: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd }));
console.log(`\nNetz ${mbit} Mbit/s, ${latenz} ms · beobachtet ${dauer} s · welt-bereit: ${r.bereit} · DOMContentLoaded ${Math.round(r.nav)} ms`);
console.log('Zeitmarken (ms seit Seitenstart):', JSON.stringify(r.zeit));
console.log('Texturen der Station:', JSON.stringify(r.tex));
console.log('Gerät-Aufrufe >8 ms [Zeit,Art,ms,Name]:', JSON.stringify(r.pipe.map(([t,n,d,l])=>t+' '+n+' '+d+' '+l.slice(0,30)))); console.log('Modellstufen:', JSON.stringify(r.stufen));
const sek = {};
for (const [t, d] of r.ruckler) { const k = Math.floor(t / 1000); (sek[k] ??= { a: 0, b: 0, c: 0, max: 0 }); const s = sek[k]; s.a++; if (d > 100) s.b++; if (d > 250) s.c++; s.max = Math.max(s.max, d); }
console.log('\n s | Bilder >34ms | >100ms | >250ms | längster Abstand');
for (const k of Object.keys(sek).map(Number).sort((a, b) => a - b)) { const s = sek[k]; console.log(String(k).padStart(2), '|', String(s.a).padStart(11), '|', String(s.b).padStart(6), '|', String(s.c).padStart(6), '|', s.max + ' ms'); }
console.log('\nBildabstände ≥ 100 ms (Zeit:Dauer):', r.ruckler.filter((e) => e[1] >= 100).map(([t, d]) => t + ':' + d).join('  ') || 'keine');
const lang = r.lang.filter((e) => e[1] >= 100).map(([t, d]) => `${t}:${d}`).join('  ');
console.log('\nLong Tasks ≥ 100 ms (Start:Dauer in ms):', lang || 'keine');
console.log('\nKonsole:\n' + konsole.slice(-15).join('\n'));
await browser.close(); process.exit(0);
