// Ersatzplanet ohne Strömungssimulation (Browser ohne WebGPU, oder der Simulator startet nicht).
// Gleiche Schnittstelle wie planet.js. Ein echtes Ellipsoid in der Szene (verdeckt also selbst), Bänderkarte als Bild,
// beleuchtet von der Sonne der Welt. Dazu ein Sternenhimmel als Punkte auf einer fernen Kugel (10⁶ km).
// Werte: Jupiter (Radius 71 492 km, Abplattung 0,0649, Achsneigung 3,1°) – wie die Vorlage des Simulators.
import * as THREE from 'three/webgpu';

const JUPITER = { radiusKm: 71492, abplattung: 0.0649, neigung: 3.1 };
const KARTE = new URL('./jupiter-karte.jpg', import.meta.url).href;

function sterne(anzahl = 4000, r = 4e6) {
	const p = new Float32Array(anzahl * 3);
	for (let i = 0; i < anzahl; i++) {
		// gleichverteilt auf der Kugel: z = 2u − 1, φ = 2πv
		const z = 2 * Math.random() - 1, f = 2 * Math.PI * Math.random(), s = Math.sqrt(1 - z * z);
		p.set([r * s * Math.cos(f), r * z, r * s * Math.sin(f)], i * 3);
	}
	const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(p, 3));
	return new THREE.Points(g, new THREE.PointsNodeMaterial({ color: 0xcfd8ff, size: 1.5, sizeAttenuation: false }));
}

export function erstelleErsatz({ szene }) {
	const tex = new THREE.TextureLoader().load(KARTE);
	tex.colorSpace = THREE.SRGBColorSpace;
	const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 1, metalness: 0 }));
	mesh.name = 'Planet-Ersatz';
	mesh.rotation.z = (JUPITER.neigung * Math.PI) / 180;
	const himmel = sterne();
	himmel.frustumCulled = false;
	szene.add(mesh, himmel);
	let welt = null;
	return {
		art: 'ersatz',
		radiusKm: JUPITER.radiusKm, abplattung: JUPITER.abplattung, bereit: true,
		get koerper() { const m = new THREE.Matrix4().makeRotationFromQuaternion(mesh.quaternion).transpose().elements; return [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]]; },
		setzeWelt(w) { welt = w; mesh.position.set(...w.P); mesh.scale.set(w.R, w.R * (1 - w.f), w.R); },
		hintergrund: null,
		flaeche() {},
		schritt(z) { if (welt) { mesh.rotateY(z.dt * 0.02); himmel.position.copy(z.kamera.position); } },
		stufe() {},
		wirbel() {},
		tiefe: mesh,
	};
}
