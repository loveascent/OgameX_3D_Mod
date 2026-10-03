// Der Himmel als echte 3D-Szene: Für jeden Bildpunkt wird ein Blickstrahl durch eine Perspektivkamera gelegt, auf eine feste
// Himmelskugel (Nebel + Sterne, nebel.js / sterne.js) getroffen und dort die Farbe berechnet. Der Himmel selbst ist STATISCH;
// einzig die Kamera dreht sich ganz langsam – als Funktion der absoluten Uhrzeit. Dadurch läuft die Bewegung auch über
// Seitenwechsel hinweg stetig weiter (kein Neustart bei null) und es gibt kein Verformen/Morphen.
import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, uniform, screenUV, positionGeometry, normalize, clamp, max, float } from 'three/tsl';
import { erzeugeNebel } from './nebel.js';
import { sternSchicht } from './sterne.js';

const FOV = 62;                              // Grad (vertikal)
const GIERRATE = 0.0010;                     // rad/s: eine Umdrehung in ~1,7 Stunden
const NICKRATE = 0.00037;                    // rad/s: sanftes Auf und Ab

/** Kameradrehung zum Zeitpunkt sek (Sekunden, absolut): reine Funktion der Zeit. */
export function kameraDrehung(sek, m3 = new THREE.Matrix3()) {
	const gier = (sek * GIERRATE) % (Math.PI * 2), nick = 0.28 * Math.sin(sek * NICKRATE);
	const e = new THREE.Euler(nick, gier, 0, 'YXZ');
	return m3.setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
}

/**
 * @param {HTMLCanvasElement} leinwand
 * @param {{qualitaet?: 'niedrig'|'mittel'|'hoch', pixeldichte?: number}} opt
 * @returns {Promise<{zeichne:(sek:number)=>void, groesse:()=>void, stop:()=>void, backend:string}>}
 */
export async function erstelleHimmel(leinwand, { qualitaet = 'mittel', pixeldichte = 1 } = {}) {
	const renderer = new THREE.WebGPURenderer({ canvas: leinwand, antialias: false, alpha: false, powerPreference: 'high-performance' });
	renderer.outputColorSpace = THREE.LinearSRGBColorSpace;      // Werte sind schon Bildschirmwerte (am Homeworld-Vorbild abgestimmt)
	renderer.toneMapping = THREE.NoToneMapping;
	renderer.setPixelRatio(pixeldichte);
	await renderer.init();
	const backend = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';

	const oktaven = { niedrig: 3, mittel: 4, hoch: 5 }[qualitaet] ?? 4;
	const nebel = erzeugeNebel(oktaven);
	const tanHalb = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
	const uDrehung = uniform(new THREE.Matrix3()), uSeite = uniform(1), uPixel = uniform(0.001);

	const farbe = Fn(() => {
		const ndc = vec3(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y.mul(2)), 0);
		const strahl = normalize(vec3(ndc.x.mul(uSeite).mul(tanHalb), ndc.y.mul(tanHalb), -1));
		const d = normalize(uDrehung.mul(strahl));                // Blickrichtung in der Welt
		const n = nebel(d);
		const s = sternSchicht(d, 16, 0.22, uPixel, 0.8)
			.add(sternSchicht(d, 36, 0.14, uPixel, 0.6))
			.add(sternSchicht(d, 80, 0.10, uPixel, 0.5));
		const tiefe = float(1).sub(clamp(max(n.x, max(n.y, n.z)).mul(1.6), 0, 0.85));   // Staub verdeckt Sterne
		return vec4(clamp(n.add(s.mul(tiefe)), 0, 1), 1);
	});

	const material = new THREE.NodeMaterial();
	material.vertexNode = vec4(positionGeometry.xy, 0, 1);       // Vollbild-Dreieck, keine Kamera nötig
	material.fragmentNode = farbe();
	material.depthTest = false; material.depthWrite = false;
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
	const dreieck = new THREE.Mesh(geo, material);
	dreieck.frustumCulled = false;
	const szene = new THREE.Scene(); szene.add(dreieck);
	const kamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

	let gueltig = false;
	function groesse() {
		const w = leinwand.clientWidth || innerWidth, h = leinwand.clientHeight || innerHeight;
		if (w < 1 || h < 1) { gueltig = false; return; }   // verborgenes Fenster: nichts zeichnen (sonst WebGPU-Fehler "Groesse 0")
		gueltig = true;
		renderer.setSize(w, h, false);
		uSeite.value = w / h;
		uPixel.value = (2 * tanHalb) / (h * renderer.getPixelRatio());   // Winkelgröße eines Bildpunkts
	}
	groesse();

	return {
		backend,
		zeichne(sek) { if (!gueltig) groesse(); if (!gueltig) return; kameraDrehung(sek, uDrehung.value); renderer.render(szene, kamera); },
		groesse,
		stop() { renderer.dispose(); },
	};
}
