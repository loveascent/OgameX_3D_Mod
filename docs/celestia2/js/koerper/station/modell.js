// Lädt das Stationsmodell (GLB: meshopt-Geometrie, KTX2-Texturen) ruckelfrei:
//   1. Download mit Fortschritt; Dauer und Größe gehen an kern/leitung.js (echte Messung der Leitung)
//   2. meshopt dekodiert in Web-Workern, KTX2 transkodiert in Web-Workern (nicht im Hauptthread)
//   3. Texturen einzeln auf die GPU (mit Luft dazwischen), Shader asynchron übersetzen – erst dann sichtbar.
// Modellstufen (gleiche Knotennamen, nur feinere Geometrie und größere Texturen):
import * as THREE from 'three/webgpu';
import { GLTFLoader, KTX2Loader, MeshoptDecoder } from '../../../fremd/three/zusatz.min.js';
import { PFADE } from '../../pfade.js';
import { messe } from '../../kern/leitung.js';
import { luft } from '../../kern/luft.js';

export const MODELLE = {
	niedrig: { datei: 'todesstern_niedrig.glb', bytes: 3287372 },
	mittel:  { datei: 'todesstern_mittel.glb',  bytes: 7412564 },
	hoch:    { datei: 'todesstern_hoch.glb',    bytes: 15782504 },
};
export const MODELL_REIHE = ['niedrig', 'mittel', 'hoch'];

let lader = null;
function holeLader(renderer) {
	if (lader) return lader;
	MeshoptDecoder.useWorkers?.(2);
	const ktx2 = new KTX2Loader().setTranscoderPath(PFADE.basis).setWorkerLimit(2).detectSupport(renderer);
	lader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
	return lader;
}

/** Lädt eine Modellstufe. Liefert die Wurzel (noch nicht in der Szene) und die benannten Teile. */
export async function ladeModell(renderer, stufe, beiFortschritt) {
	const m = MODELLE[stufe];
	const t0 = performance.now();
	const gltf = await holeLader(renderer).loadAsync(PFADE.station + m.datei, (e) => beiFortschritt?.(e.loaded / (e.total || m.bytes)));
	messe(m.bytes, (performance.now() - t0) / 1000);
	const wurzel = gltf.scene;
	const knoten = (n) => wurzel.getObjectByName(n);
	let iris = knoten('WEB_Iris');
	iris?.traverse((o) => { if (o.isMesh && !iris.isMesh) iris = o; });
	if (iris?.material) iris.material = iris.material.clone();   // eigene Leuchtstärke, die anderen Teile teilen ihr Material
	const blenden = [];
	for (let i = 1; i <= 8; i++) { const b = knoten(`WEB_Blatt_${i}`); if (b) blenden.push({ o: b, ruhe: b.quaternion.clone() }); }
	return {
		stufe, wurzel, blenden, iris, irisBasis: iris?.material?.emissiveIntensity ?? 1, ...vermesseWaffe(wurzel, iris),
		trommel: knoten('ROTOR_TROMMEL'), ring: knoten('ROTOR_RING'),
	};
}

/** Austrittspunkt und Achse des Strahls, GEMESSEN am Modell (nicht angenommen):
 *  Die Iris ist eine flache Scheibe (Dicke 0). Austrittspunkt = Mitte ihrer Hüllbox, Achse = ihre Flächennormale
 *  = lokale +z-Achse des Iris-Knotens, beides in Modellkoordinaten. Gemessen (niedrig und hoch gleich):
 *  Mitte (0; 0; 4,45), Radius 0,74, Normale (0; 0; 1) – die 8 Blenden liegen symmetrisch darum (z 4,87 … 6,13). */
function vermesseWaffe(wurzel, iris) {
	if (!iris) throw new Error('Modell ohne WEB_Iris – Austrittspunkt nicht messbar');
	wurzel.updateMatrixWorld(true);
	const mitte = new THREE.Box3().setFromObject(iris).getCenter(new THREE.Vector3());
	const achse = new THREE.Vector3(0, 0, 1).transformDirection(iris.matrixWorld);
	return { muendung: mitte.toArray(), achse: achse.toArray() };
}

/** Alles auf die GPU, bevor das Modell sichtbar wird. */
export async function vorwaermen(renderer, wurzel, kamera, szene) {
	const texturen = new Set();
	wurzel.traverse((o) => { for (const mat of [].concat(o.material ?? [])) for (const k in mat) if (mat[k]?.isTexture) texturen.add(mat[k]); });
	for (const t of texturen) { renderer.initTexture(t); await luft(); }
	await renderer.compileAsync(wurzel, kamera, szene);
}

export function entsorge(wurzel) {
	wurzel.traverse((o) => {
		o.geometry?.dispose();
		for (const mat of [].concat(o.material ?? [])) { for (const k in mat) if (mat[k]?.isTexture) mat[k].dispose(); mat.dispose(); }
	});
}
