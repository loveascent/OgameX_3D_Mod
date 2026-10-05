// Einstieg: steckt die Bauteile zusammen. Hier steht keine Physik und keine Darstellung – nur die Reihenfolge.
//
// Laden (nichts davon blockiert die Seite):
//   1. Texte und Bedienung sofort (HTML) – die Seite ist ab hier als Allianzseite benutzbar
//   2. Renderer + GPU-Gerät, Planet (Simulator) – schwingt in Häppchen ein, dann wird die 3D-Welt eingeblendet
//   3. Station (kleinste Modellstufe) im Hintergrund, vorgewärmt, dann in die Welt; Strahl, Hitze, Einschlag dazu
//   4. Besseres Modell, wenn Stufe und gemessene Leitung es hergeben
// Je Bild (eine Schleife, kern/takt.js):
//   Kamera → Planet → Station → Strahl → Hitze → Einschlag → Bild → Qualitätsmessung
// Bauteile abschalten: ?aus=station,strahl,hitze,einschlag,planet,bloom (kern/module.js)
import * as THREE from 'three/webgpu';
import { KAPITEL } from './welt/kapitel.js';
import { erstelleWelt } from './welt/welt.js';
import { erstelleKamera, aufThree } from './kamera/kamera.js';
import { erstelleTakt } from './kern/takt.js';
import { istAn } from './kern/module.js';
import { erstelleQualitaet, pixeldichte } from './kern/qualitaet.js';
import { baueKapitel } from './ui/kapitel.js';
import { erstelleBlaettern } from './ui/blaettern.js';
import { erstelleStufenwahl } from './ui/stufenwahl.js';

const $ = (id) => document.getElementById(id);
const ids = KAPITEL.map((k) => k.id);
const ui = baueKapitel($('kapitel-wirt'), ids);
let kapitelNr = 0;
erstelleBlaettern({ anzahl: ids.length, ids, punkteWirt: $('punkte'), beiWechsel: (i) => { kapitelNr = i; ui.zeige(i); } });

const celestia = (window.celestia = { gpu: null, art: null, fehler: [] });
let neueStufe = null;
const qualitaet = erstelleQualitaet((werte, name, alt, grund) => { neueStufe = werte; console.info(`celestia2: Stufe ${alt} → ${name} (${grund})`); wahl?.zeige(); });
const wahl = istAn('bedienung') ? erstelleStufenwahl($('stufen'), qualitaet) : null;

async function welt3d() {
	const { erstelleRenderer } = await import('./gpu/geraet.js');
	const { erstelleBild } = await import('./gpu/bild.js');
	const { erstellePlanet } = await import('./koerper/planet/planet.js');
	const { renderer, device, webgpu, info } = await erstelleRenderer($('leinwand'));
	Object.assign(celestia, { gpu: info, art: webgpu ? 'webgpu' : 'webgl2' });
	console.info('celestia2: GPU', info, webgpu ? 'WebGPU' : 'WebGL 2');

	let stufe = qualitaet.werte;
	const szene = new THREE.Scene();
	const kamera = new THREE.PerspectiveCamera(30, 1, 0.5, 1e7);
	const planet = istAn('planet') ? await erstellePlanet({ device, szene, qualitaet: stufe.planet }) : null;
	const welt = erstelleWelt(planet?.radiusKm ?? 71492, planet?.abplattung ?? 0.0649);
	planet?.setzeWelt(welt);
	const rig = erstelleKamera();

	let W = 0, H = 0, dpr = 1, bild = null;
	function groesse() {
		W = innerWidth; H = innerHeight; dpr = pixeldichte(stufe);
		renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
		planet?.flaeche(W * dpr, H * dpr);
	}
	const baueBild = () => {
		bild?.dispose();
		const hg = planet?.hintergrund ? (uv) => planet.hintergrund(uv) : null;
		bild = erstelleBild(renderer, szene, kamera, { hintergrund: hg, stufe: { ...stufe, bloom: stufe.bloom && istAn('bloom') } });
	};
	groesse(); baueBild();
	addEventListener('resize', groesse);

	const teile = {};   // station, strahl, hitze, einschlag – erscheinen, sobald geladen
	const z = { dt: 0, t: 0, kapitel: KAPITEL[0], kamera, hoehePx: 1 };
	let sofort = true, eingeblendet = false;

	const takt = erstelleTakt((dt, t) => {
		if (neueStufe) {   // Stufenwechsel: Auflösung, Planetengitter, Bild neu; Modell evtl. nachladen
			stufe = neueStufe; neueStufe = null;
			groesse(); planet?.stufe(stufe.planet); baueBild(); qualitaet.pause(4);
			teile.station?.nachladen(stufe.modell);
		}
		Object.assign(z, { dt, t, kapitel: KAPITEL[kapitelNr], hoehePx: H * dpr });
		aufThree(rig.schritt(z.kapitel, welt, dt, t, W / H, sofort), kamera, W / H);
		sofort = false;
		planet?.schritt(z);
		const st = teile.station?.schritt(welt, z);
		if (st && teile.strahl) {
			const sz = teile.strahl.schritt(welt, st, planet, z);
			teile.hitze?.schritt();
			teile.einschlag?.schritt(welt, st, sz, planet, z);
		}
		if (planet && !planet.bereit) return;   // Planet schwingt noch ein: altes Bild stehen lassen
		bild.render();
		if (!eingeblendet) { eingeblendet = true; document.body.classList.add('welt-bereit'); qualitaet.pause(3); }
		qualitaet.messe(dt);
	});
	takt.start();

	if (istAn('station')) {
		const { erstelleStation } = await import('./koerper/station/station.js');
		const station = await erstelleStation({ renderer, szene, kamera, welt, stufe,
			beiFortschritt: (f) => document.documentElement.style.setProperty('--laden', f.toFixed(3)) });
		teile.station = station;
		if (istAn('strahl') && planet) {
			const { erstelleStrahl } = await import('./koerper/strahl/strahl.js');
			teile.strahl = erstelleStrahl(szene, station.massstab);
			if (istAn('hitze')) teile.hitze = (await import('./koerper/strahl/hitze.js')).erstelleHitze(szene, teile.strahl, station.massstab);
			if (istAn('einschlag')) teile.einschlag = (await import('./koerper/strahl/einschlag.js')).erstelleEinschlag(szene);
		}
		qualitaet.pause(3);
		station.nachladen(stufe.modell);
	}
	Object.assign(celestia, { welt, teile, planet, kamera, takt, kapitel: (i) => $('punkte').children[i]?.click() });
}

if (istAn('welt')) welt3d().catch((e) => {
	console.error('celestia2: 3D-Welt nicht verfügbar –', e);
	celestia.fehler.push(String(e?.message ?? e));
	document.body.classList.add('ohne-welt');
});
