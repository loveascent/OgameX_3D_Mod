// Ebene 4: der Leichte Jaeger -- das fertige Blender-GLB, live in three.js (WebGPU) gerendert, fliegt dem Betrachter entgegen.
// Modell: assets/leichter-jaeger.glb (LJ_Finetuned_10MB). Nichts daran ist nachgebaut.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { glatt, mix } from '../kern/zeitleiste.js';

const GLB = new URL('../../assets/leichter-jaeger.glb', import.meta.url).href;
// Gemessen (Sichtprobe): ohne Drehung zeigt die Nase des GLB schon zur Kamera (+Z); Wert zum Nachstellen.
const NASE_ZUR_KAMERA = Math.PI / 2;

export async function erstelleJaeger3D(wirt) {
	const leinwand = document.createElement('canvas'); leinwand.className = 'jaeger3d'; wirt.append(leinwand);
	const r = new THREE.WebGPURenderer({ canvas: leinwand, alpha: true, antialias: true });
	await r.init();
	r.setClearColor(0x000000, 0);
	r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;

	const szene = new THREE.Scene();
	const kam = new THREE.PerspectiveCamera(38, 1, 0.1, 100); kam.position.set(0, 0, 6);
	szene.add(new THREE.HemisphereLight(0x9cc4ff, 0x20150c, 0.9));
	const schluessel = new THREE.DirectionalLight(0xffd7a8, 3.2); schluessel.position.set(-4, 2.5, 4); szene.add(schluessel);
	const rand = new THREE.DirectionalLight(0x6fa8ff, 2.4); rand.position.set(5, 1, -3); szene.add(rand);
	const unten = new THREE.DirectionalLight(0xffb070, 1.2); unten.position.set(0, -4, 2); szene.add(unten);

	const halter = new THREE.Group(); szene.add(halter);
	let modell = null, geladen = false, tot = false;

	function groesse() {
		const dpr = Math.min(devicePixelRatio || 1, 2);
		r.setPixelRatio(dpr); r.setSize(innerWidth, innerHeight, false);
		kam.aspect = innerWidth / innerHeight; kam.updateProjectionMatrix();
	}
	groesse(); addEventListener('resize', groesse);

	async function lade() {
		if (geladen) return; geladen = true;
		const gltf = await new GLTFLoader().loadAsync(GLB);
		modell = gltf.scene;
		const box = new THREE.Box3().setFromObject(modell);
		const mitte = box.getCenter(new THREE.Vector3()), gr = box.getSize(new THREE.Vector3());
		modell.position.sub(mitte);
		const ziel = 3.2 / Math.max(gr.x, gr.y, gr.z);
		const tuer = new THREE.Group(); tuer.add(modell); tuer.scale.setScalar(ziel);
		tuer.rotation.y = NASE_ZUR_KAMERA;
		halter.add(tuer);
		halter.visible = false;
	}

	return {
		element: leinwand, lade,
		/** nach dem Flug: Grafikkarten-Speicher freigeben (der Todesstern braucht ihn danach) */
		freigeben() { if (tot) return; tot = true; leinwand.style.visibility = 'hidden'; r.dispose(); },
		/** t: 0..1 Flug. Der Jaeger startet klein in der Planetenmitte und zieht links am Betrachter vorbei. */
		lege(t, mitteX, mitteY) {
			if (tot) return;
			const sichtbar = modell && t > 0.001 && t < 0.999;
			leinwand.style.visibility = sichtbar ? 'visible' : 'hidden';
			if (!sichtbar) return;
			halter.visible = true;
			const e = t * t * (3 - 2 * t);
			const z = mix(-26, 3.2, Math.pow(e, 1.6));            // von weit hinten bis dicht vor die Kamera
			const x = mix(0, -1.3, Math.pow(e, 2)) ;
			const y = mix(0.1, -0.35, e);
			halter.position.set(x, y, z);
			halter.rotation.set(0.12 * e, 0.18 * e, -0.25 * Math.sin(t * 5));
			leinwand.style.opacity = (glatt(Math.min(1, t / 0.08)) * (1 - glatt(Math.max(0, (t - 0.9) / 0.1)))).toFixed(3);
			r.render(szene, kam);
		},
	};
}
