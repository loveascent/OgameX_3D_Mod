// Einstieg: steckt die Bauteile zusammen. Hier steht keine Physik und keine Darstellung – nur die Reihenfolge.
//
// Laden – strikt nacheinander, der Hauptstrang bleibt frei (gemessen mit werkzeug/seite/ladeprofil.mjs):
//   1. Text und Bedienung (HTML) – sofort; die Texte blenden zuerst ein, ohne auf die Kamerafahrt zu warten (css/kapitel.css)
//   2. Download + Dekodieren des kleinen Stationsmodells startet gleich (Web-Worker), parallel zum Text
//   3. Nach dem Text: Planet mit Himmel (Simulator). Er wird schon beim Einschwingen gezeichnet; eingeblendet wird, sobald die Bilder ruhig laufen
//   4. Erst wenn der Planet ruhig läuft: Station (Texturen bildweise auf die GPU, Shader asynchron im Ziel des Bildes übersetzt)
//   5. Strahl, Hitze, Einschlag, Mond: gebaut und übersetzt in einer Ablage, dann in die Welt
//   6. Besseres Modell (mittel, hoch), wenn Stufe und gemessene Leitung es hergeben – nach jedem Schritt wieder auf ruhige Bilder warten
// Je Bild (eine Schleife, kern/takt.js):
//   Kamera → Planet → Station → Mond → Strahl → Hitze → Einschlag → Bild → Qualitätsmessung
// Bauteile abschalten: ?aus=station,strahl,hitze,einschlag,planet,bloom,mond (kern/module.js)
import * as THREE from 'three/webgpu';
import { KAPITEL } from './welt/kapitel.js';
import { erstelleWelt } from './welt/welt.js';
import { MASSE } from './welt/masse.js';
import { erstelleKamera, aufThree } from './kamera/kamera.js';
import { erstelleTakt } from './kern/takt.js';
import { istAn } from './kern/module.js';
import { erstelleQualitaet, pixeldichte } from './kern/qualitaet.js';
import { baueKapitel } from './ui/kapitel.js';
import { erstelleBlaettern } from './ui/blaettern.js';
import { erstelleStufenwahl } from './ui/stufenwahl.js';
import { bildruhe } from './kern/luft.js';

const $ = (id) => document.getElementById(id);
const ids = KAPITEL.map((k) => k.id);
const ui = baueKapitel($('kapitel-wirt'), ids);
let kapitelNr = 0;
erstelleBlaettern({ anzahl: ids.length, ids, punkteWirt: $('punkte'), beiWechsel: (i) => { kapitelNr = i; ui.zeige(i); } });

const celestia = (window.celestia = { gpu: null, art: null, fehler: [], zeit: {} });
const marke = (n) => { celestia.zeit[n] = Math.round(performance.now()); };   // Zeitmarken für werkzeug/seite/ladeprofil.mjs
marke('js');
let neueStufe = null;
const qualitaet = erstelleQualitaet((werte, name, alt) => { neueStufe = werte; console.info(`owners: Stufe ${alt} → ${name} (Wahl)`); wahl?.zeige(); });
let wahl = null;

/** Wartet, bis der Text des ersten Kapitels eingeblendet ist (höchstens 2 s). */
const textFertig = () => new Promise((fertig) => {
	const letzter = document.querySelector('.kapitel.aktiv .spalte > :last-child');
	if (!letzter || matchMedia('(prefers-reduced-motion: reduce)').matches) return fertig();
	letzter.addEventListener('transitionend', () => fertig(), { once: true });
	setTimeout(fertig, 2000);
});

async function welt3d() {
	const [{ erstelleRenderer }, { erstelleBild }, { erstellePlanet }, { vorabStation, erstelleStation }] = await Promise.all([
		import('./gpu/geraet.js'), import('./gpu/bild.js'), import('./koerper/planet/planet.js'), import('./koerper/station/station.js')]);
	const { renderer, device, webgpu, info } = await erstelleRenderer($('leinwand'));
	Object.assign(celestia, { gpu: info, art: webgpu ? 'webgpu' : 'webgl2' }); marke('gpu');
	console.info('owners: GPU', info, webgpu ? 'WebGPU' : 'WebGL 2');

	let stufe = qualitaet.start(info);   // einmal, aus der Grafikkarte – vor dem Planeten
	if (istAn('bedienung')) wahl = erstelleStufenwahl($('stufen'), qualitaet);
	console.info('owners: Stufe', qualitaet.name);
	const szene = new THREE.Scene();
	const kamera = new THREE.PerspectiveCamera(30, 1, 0.5, 1e7);
	const vorab = istAn('station') ? vorabStation(renderer, (f) => document.documentElement.style.setProperty('--laden', f.toFixed(3))) : null;   // Download + Dekodieren (Web-Worker) laufen schon
	await textFertig();   // der Text kommt zuerst, ungestört – der erste Planetenaufbau übersetzt viele Shader
	const planet = istAn('planet') ? await erstellePlanet({ device, szene, qualitaet: stufe.planet }) : null;
	marke('planet-da');
	const welt = erstelleWelt(MASSE.planetRadius, planet?.abplattung ?? 0.0649);
	planet?.setzeWelt(welt);
	const rig = erstelleKamera();

	let W = 0, H = 0, dpr = 1, bild = null;
	function groesse() {
		W = innerWidth; H = innerHeight; dpr = pixeldichte(stufe, qualitaet.faktor);
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

	const teile = {};   // station, strahl, hitze, einschlag, mond – erscheinen, sobald geladen
	const z = { dt: 0, t: 0, kapitel: KAPITEL[0], kamera, hoehePx: 1, mond: null };
	let eingeblendet = false;

	const takt = erstelleTakt((dt, t) => {
		if (neueStufe) {   // Stufenwechsel (nur durch den Besucher): Auflösung, Planetengitter, Bild neu; Modell nachladen
			stufe = neueStufe; neueStufe = null;
			groesse(); planet?.stufe(stufe.planet); baueBild(); qualitaet.pause(4);
			teile.station?.nachladen(stufe.modell);
		}
		Object.assign(z, { dt, t, kapitel: KAPITEL[kapitelNr], hoehePx: H * dpr });
		aufThree(rig.schritt(z.kapitel, welt, t, W / H), kamera, W / H);
		planet?.schritt(z);
		z.mond = teile.mond ?? null;
		const st = teile.station?.schritt(welt, z);
		if (st) teile.mond?.schritt(welt, st, z);
		if (st && teile.strahl) {
			const sz = teile.strahl.schritt(welt, st, planet, z);
			teile.hitze?.schritt();
			teile.einschlag?.schritt(welt, st, sz, planet, z);
		}
		bild.render();
		if (!eingeblendet) {   // Bilder laufen unsichtbar an; eingeblendet wird erst, wenn sie ruhig kommen (sonst ruckelt die Einblendung mit)
			eingeblendet = true; marke('erstes-bild'); qualitaet.pause(3);
			bildruhe(12).then(() => { document.body.classList.add('welt-bereit'); marke('sichtbar'); });
		}
		if (qualitaet.messe(dt)) groesse();   // nur die Auflösung – kein Neuaufbau
	});
	takt.start();

	Object.assign(celestia, { welt, teile, planet, kamera, takt, kapitel: (i) => $('punkte').children[i]?.click() });

	if (istAn('station')) {
		const kompiliere = (o, s) => bild.kompiliere(o, s);
		await bildruhe(30);   // erst wenn der Planet ruhig läuft (Shader des Planeten sind dann übersetzt)
		const station = await erstelleStation({ renderer, szene, kamera, welt, stufe, vorab, kompiliere });
		teile.station = station; marke('station');
		// Strahl, Hitze, Einschlag, Mond: erst bauen und Shader asynchron übersetzen (in einer Ablage), dann in die Welt – kein Ruckeln beim ersten Schuss
		const ablage = new THREE.Group();
		const neu = {};
		if (istAn('strahl') && planet) {
			const { erstelleStrahl } = await import('./koerper/strahl/strahl.js');
			neu.strahl = erstelleStrahl(ablage, station.massstab);
			if (istAn('hitze')) neu.hitze = (await import('./koerper/strahl/hitze.js')).erstelleHitze(ablage, neu.strahl, station.massstab);
			if (istAn('einschlag')) neu.einschlag = (await import('./koerper/strahl/einschlag.js')).erstelleEinschlag(ablage);
		}
		if (istAn('mond')) neu.mond = (await import('./koerper/mond/mond.js')).erstelleMond(ablage, welt, { stufe });
		await bildruhe();
		await kompiliere(ablage, szene);
		szene.add(...ablage.children);
		Object.assign(teile, neu); marke('mond');
		qualitaet.pause(3);
		station.nachladen(stufe.modell);
	}
}

if (istAn('welt')) welt3d().catch((e) => {
	console.error('owners: 3D-Welt nicht verfügbar –', e);
	celestia.fehler.push(String(e?.message ?? e));
	document.body.classList.add('ohne-welt');
});
