// Anordnung: Station oben rechts, Mündung zeigt auf den Planeten, der Strahl endet an seinem Rand.
// Reine Rechnung (keine three.js-Szene nötig außer Vector3/Quaternion) – getrennt vom Rest, damit sie einzeln
// änderbar ist. Alle Maße in Anteilen von Fensterbreite/-höhe (aus dem Admin-Bereich).
import * as THREE from 'three/webgpu';

const MUENDUNG = 6.2;      // Mündungsblitz-Lage vor der Mitte (todesstern.js)
const STRAHL_START = 5.35; // Strahlzylinder beginnt hier (todesstern.js)

/**
 * @param {object} p  { W, H, fov, stationR, layout:{station:{x,y,breite}, planet:{x,y,radius}} }
 * @returns { dist, stationPos, quat, strahlMax }  Kamera sitzt bei (0,0,dist) und blickt nach -Z.
 */
export function anordnen({ W, H, fov, stationR, layout }) {
	const f = (H / 2) / Math.tan(THREE.MathUtils.degToRad(fov) / 2);       // Brennweite in Pixeln
	const st = layout.station, pl = layout.planet;
	// Abstand so, dass die Station "breite" · W Pixel breit erscheint
	const dist = 2 * stationR * f / (st.breite * W);
	// Bildpunkt (Anteile) -> Welt in Tiefe z (Kamera bei +dist, Blick -Z)
	const welt = (ax, ay, tiefe) => new THREE.Vector3((ax * W - W / 2) * tiefe / f, -(ay * H - H / 2) * tiefe / f, dist - tiefe);
	const C = welt(st.x, st.y, dist);
	// Planet etwas näher an der Kamera als die Station: der Strahl zeigt leicht auf den Betrachter, die Mündung ist sichtbar
	const tiefeP = dist * 0.80;
	const G = welt(pl.x, pl.y, tiefeP);
	const rPixel = pl.radius * Math.min(W, H);
	const rWelt = rPixel * tiefeP / f;

	let d = G.clone().sub(C).normalize();
	for (let i = 0; i < 4; i++) {
		const m = C.clone().addScaledVector(d, MUENDUNG);
		d = G.clone().sub(m).normalize();
	}
	// Roll: lokales "oben" der Station möglichst nach Welt-oben
	const q1 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
	const u1 = new THREE.Vector3(0, 1, 0).applyQuaternion(q1);
	const U = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize();   // Welt-oben senkrecht zu d
	let ang = Math.atan2(new THREE.Vector3().crossVectors(u1, U).dot(d), u1.dot(U));
	const quat = new THREE.Quaternion().setFromAxisAngle(d, ang).multiply(q1);

	const start = C.clone().addScaledVector(d, STRAHL_START);
	const strahlMax = Math.max(1, G.distanceTo(start) - rWelt * 0.85);
	return { dist, stationPos: C, quat, strahlMax, planetWelt: G, planetRWelt: rWelt };
}
