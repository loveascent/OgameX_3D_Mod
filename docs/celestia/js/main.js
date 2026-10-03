// World of Celestia -- Scroll-Film. Je Ebene eine Datei (siehe README.md); hier wird nur zusammengesteckt und getaktet.
//   szene/himmel-glas.js  Nebel, Sterne, Liquid-Glass-Titel (WebGPU, WGSL)
//   szene/planet.js       Gasriese (Fluid Gas Planet, eingebettet)
//   szene/jaeger3d.js     Leichter Jaeger (Blender-GLB, three.js WebGPU) fliegt dem Betrachter entgegen
//   ui/                   Erzaehlzeilen, Schlusstafel, Texte
//   kern/                 Zeitleiste (kapitel.js), Scroll-Glaettung, Mathe
import { starteHimmelGlas } from './szene/himmel-glas.js';
import { erstellePlanet } from './szene/planet.js';
import { erstelleJaeger3D } from './szene/jaeger3d.js';
import { erstelleTodesstern, LAYOUT } from './szene/todesstern.js';
import { erstelleUntertitel } from './ui/untertitel.js';
import { erstelleAbschluss } from './ui/abschluss.js';
import { starteScroll } from './kern/scroll.js';
import { K } from './kern/kapitel.js';
import { bereich, glatt, ausgebremst, mix, fenster } from './kern/zeitleiste.js';

const $ = (s) => document.querySelector(s);

let himmel = null;
try { himmel = await starteHimmelGlas($('#himmel')); }
catch (e) {
	console.warn('Celestia: Himmel-Shader nicht verfuegbar –', e.message);
	document.documentElement.classList.add('ohne-webgpu');
}

// Manche Browser melden beim allerersten Takt noch Fenstergroesse 0 -- darauf warten, bevor Groessen berechnet werden
for (let i = 0; i < 60 && (!innerWidth || !innerHeight); i++) await new Promise((r) => requestAnimationFrame(r));

const planet = erstellePlanet($('#planet-wirt'));
let jaeger = null;
erstelleJaeger3D($('#jaeger-wirt')).then((j) => { jaeger = j; }).catch((e) => console.warn('Celestia: Jaeger nicht verfuegbar –', e.message));
const stern = erstelleTodesstern($('#stern-wirt'));
const abschluss = erstelleAbschluss($('#abschluss-wirt'));
const untertitel = erstelleUntertitel($('#text-wirt'));
const hinweis = $('#scrollhinweis'), kopf = $('#kopf');

function planetLage(p) {
	const W = innerWidth, H = innerHeight;
	const gross = ausgebremst(bereich(p, ...K.planetGross));
	const ein = glatt(bereich(p, ...K.planetEin)), ecke = glatt(bereich(p, ...K.zurEcke)), zurueck = glatt(bereich(p, ...K.planetZurueck));
	const eckeS = LAYOUT.planet.radius * Math.min(W, H) / planet.radius;
	const e = ecke * (1 - zurueck);
	const s = mix(mix(0.03, 1, gross), eckeS, e) * mix(1, 0.9, zurueck);
	const cx = mix(W * 0.5, W * LAYOUT.planet.x, e), cy = mix(H * 0.5 - 0.02 * H * (1 - gross), H * LAYOUT.planet.y, e);
	return { cx, cy, s, a: ein, clip: 'none' };
}

const scroll = starteScroll((p) => {
	const flug = glatt(bereich(p, ...K.flug));
	const tempo = fenster(p, 0.40, 0.47, 0.56, 0.62);
	if (himmel) Object.assign(himmel.z, { flug, titel: 1 - glatt(bereich(p, ...K.titelAus)), tempo, waerme: tempo * 0.9 });

	planet.lege(planetLage(p));

	if (jaeger && p > K.jaegerLaden) jaeger.lade();
	jaeger?.lege(bereich(p, ...K.jaeger));
	if (p > K.jaeger[1] + 0.005) jaeger?.freigeben();

	if (p > K.sternLaden) stern.lade();
	stern.lege(glatt(bereich(p, ...K.stern)) * (1 - glatt(bereich(p, ...K.sternAus))), p > K.feuer);

	abschluss.lege(bereich(p, ...K.abschluss));
	untertitel.lege(p);

	hinweis.style.opacity = (1 - glatt(bereich(p, 0.0, 0.05))).toFixed(3);
	kopf.style.opacity = (glatt(bereich(p, 0.0, 0.04)) * 0.9).toFixed(3);
	document.documentElement.style.setProperty('--p', p.toFixed(4));
});

addEventListener('keydown', (e) => { if (e.key === 'End') scroll.springe(1); if (e.key === 'Home') scroll.springe(0); });
$('#zum-ende')?.addEventListener('click', () => scroll.springe(1));
$('#zum-anfang')?.addEventListener('click', () => scroll.springe(0));
window.celestia = { scroll, planet, himmel, get jaeger() { return jaeger; } };
