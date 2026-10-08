// Der Planet als Körper der Welt. Zwei Bauarten mit derselben Schnittstelle:
//   gasriese  Strömungssimulation (WebGPU). Zeichnet Himmel + Planet als Hintergrund mit der Weltkamera.
//             Dazu ein unsichtbarer Stellvertreter (Ellipsoid, schreibt nur Tiefe): Was hinter dem Planeten liegt,
//             wird verdeckt; der Strahl endet sichtbar an der Oberfläche – echte Verdeckung, kein Bildtrick.
//   ersatz    (ohne WebGPU oder wenn der Simulator nicht startet) texturiertes Ellipsoid + Sternenhimmel.
//
// Stellvertreter: Einheitskugel, im Körperrahmen gestreckt (R, R·c, R), c = 1 − Abplattung, gedreht mit der
// Matrix Körper→Welt = (Welt→Körper)ᵀ (Spalten = Zeilen des Simulators), verschoben nach P.
// Die Kugel ist mit 128×64 Flächen fein genug: Sehnenfehler R·(1 − cos(π/128)) ≈ 3·10⁻⁴ R, und zwar nach innen –
// der Stellvertreter verdeckt also nie etwas, das über der echten Oberfläche liegt.
import * as THREE from 'three/webgpu';
import { texture } from 'three/tsl';
import { ladeGasriese } from './gasriese.js';
import { erstelleErsatz } from './ersatz.js';
import { minus, mal } from '../../mathe/vektor.js';
import { SONNE } from '../../welt/masse.js';

function stellvertreter() {
	const m = new THREE.MeshBasicNodeMaterial({ colorWrite: false });
	const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), m);
	mesh.name = 'Planet-Tiefe';
	mesh.renderOrder = -1;
	return mesh;
}

/** Ausrichtung aus den Zeilen Welt→Körper setzen (Spalten der Körper→Welt-Matrix). */
function richte(obj, zeilen) {
	const [a, b, c] = zeilen.map((z) => new THREE.Vector3(z[0], z[1], z[2]));
	obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, b, c));
}

export async function erstellePlanet({ device, szene, qualitaet }) {
	let sim = null;
	if (device) {
		try { sim = await ladeGasriese(device, { qualitaet, sonne: SONNE }); }
		catch (e) { console.warn('owners: Simulator startet nicht, Ersatzplanet –', e); }
	}
	if (!sim) return erstelleErsatz({ szene });

	const tiefe = stellvertreter();
	szene.add(tiefe);
	const knoten = [];   // Texturknoten des Hintergrunds (bekommen bei neuer Größe die neue Textur)
	let ext = null, welt = null, bereit = false;
	const invTmp = new THREE.Matrix4();

	return {
		art: 'gasriese',
		get radiusKm() { return sim.radiusKm; },
		get abplattung() { return sim.abplattung; },
		get bereit() { return bereit; },
		/** Welt→Körper (für Einschlag-Koordinaten) */
		get koerper() { return sim.koerper; },
		setzeWelt(w) {
			welt = w;
			tiefe.position.set(...w.P);
			tiefe.scale.set(w.R, w.R * (1 - w.f), w.R);
		},
		/** Hintergrund (Himmel + Planet, Anzeigeraum) an der Bildschirmstelle uv – für gpu/bild.js */
		hintergrund(uv) { const k = texture(ext ?? new THREE.Texture(), uv); knoten.push(k); return k; },
		/** Zeichenfläche (Pixel). Neue Textur → in alle Knoten einhängen. */
		flaeche(b, h) {
			if (!sim.flaeche(b, h)) return;
			ext = new THREE.ExternalTexture(sim.textur);
			ext.colorSpace = THREE.NoColorSpace;
			for (const k of knoten) k.value = ext;
		},
		/** z: { dt, kamera (three PerspectiveCamera), hoehePx } */
		schritt(z) {
			if (!welt) return;
			const k = z.kamera;
			const auge = mal(minus(k.position.toArray(), welt.P), 1 / welt.R);
			// invViewProj in Planetenradien: Kameramatrix mit verschobenem Auge · Projektion⁻¹
			invTmp.copy(k.matrixWorld).setPosition(...auge).multiply(k.projectionMatrixInverse);
			sim.kamera({ inv: invTmp.elements, auge, pxWinkel: (2 * Math.tan((k.fov * Math.PI) / 360)) / z.hoehePx });
			if (!bereit) bereit = sim.vorrechnen();   // Einschwingen läuft in Häppchen im Hintergrund, der Planet ist dabei schon zu sehen
			sim.zeichne(bereit ? z.dt : 0);
			richte(tiefe, sim.koerper);
		},
		stufe(q) { sim.stufe(q); bereit = false; },
		/** Einschlag an einem Punkt der Oberfläche (Breite/Länge im Körperrahmen) → Wirbel in der Strömung */
		wirbel: (o) => sim.wirbel(o),
		tiefe,
	};
}
