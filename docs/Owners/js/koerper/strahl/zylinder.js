// Ein leuchtender Zylinder entlang einer Achse – Grundform für Strahl und Hitzehülle.
// Geometrie: offener Zylinder, Radius 1, Länge 1 entlang +z (0 … 1). Gestellt wird er per Uniforms:
//   Mündung M, Richtung d (Einheitsvektor), Länge L (km), Radius r (km).
//
// Mindestbreite: Ein Zylinder dünner als ein Pixel flimmert (Abtastgrenze). Pro Stelle z wird
//   px = Abstand(Kamera, Achse) · pxWinkel,   k = max(1, 0,7·px / r),   r_eff = k·r
// und die Leuchtdichte durch k geteilt (Leuchtdichte · Breite bleibt gleich = gleiche Energie im Bild).
//
// Leuchtdichte eines gleichmäßig strahlenden Zylinders ∝ durchlaufene Strecke = Sehne = 2r·|n·v|
// (n: Normale der Mantelfläche, v: Blickrichtung) – darum ist die Mitte hell und der Rand weich.
//
// Leistung entlang der Achse aus strahl/verlauf.js (Proben, Index i = s/c · RATE).
import * as THREE from 'three/webgpu';
import { Fn, uniform, uniformArray, vec3, float, abs, dot, normalize, max, min, floor, mix, positionLocal,
	cameraPosition, length, varying, clamp, int } from 'three/tsl';
import { RATE, N } from './verlauf.js';
import { MASSE } from '../../welt/masse.js';

let geo = null;
const geometrie = () => geo ??= new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);

/** Gemeinsame Uniforms eines Strahls (alle Lagen teilen sie). */
export function strahlUniforms() {
	return {
		M: uniform(new THREE.Vector3()), d: uniform(new THREE.Vector3(0, 0, 1)), L: uniform(1), px: uniform(0.001),
		proben: uniformArray(new Array(N).fill(0), 'float'),
	};
}

/** Lage (Kern, Mantel, Schein, Hitze): radius km, ausgabe(leistung, sehne, k) → vec4. */
export function zylinderLage(u, radius, ausgabe, mischung) {
	const r = uniform(radius);
	const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide });
	mischung(m);
	const z = positionLocal.z;
	const breite = Fn(() => {
		const achse = u.M.add(u.d.mul(z.mul(u.L)));
		return max(1, length(cameraPosition.sub(achse)).mul(u.px).mul(0.7).div(r));
	})();
	const k = varying(breite);
	// Weltlage direkt bauen (das Objekt hat keine eigene Transformation): Basis ex, ey senkrecht zu d
	const hilf = mix(vec3(0, 1, 0), vec3(1, 0, 0), float(abs(u.d.y).greaterThan(0.95)));
	const ex = normalize(hilf.cross(u.d)), ey = u.d.cross(ex);
	m.positionNode = u.M.add(u.d.mul(z.mul(u.L))).add(ex.mul(positionLocal.x.mul(r).mul(breite))).add(ey.mul(positionLocal.y.mul(r).mul(breite)));
	const nWelt = varying(ex.mul(positionLocal.x).add(ey.mul(positionLocal.y)));   // Mantelnormale in der Welt
	const pWelt = varying(m.positionNode);
	const s = varying(z.mul(u.L));
	m.colorNode = Fn(() => {
		const f = clamp(s.div(MASSE.c).mul(RATE), 0, N - 1.001), i = floor(f);
		const leistung = mix(u.proben.element(int(i)), u.proben.element(int(min(i.add(1), N - 1))), f.sub(i));
		const sehne = abs(dot(normalize(nWelt), normalize(cameraPosition.sub(pWelt))));
		return ausgabe(leistung, sehne, k);
	})();
	const mesh = new THREE.Mesh(geometrie(), m);
	mesh.frustumCulled = false;   // Lage kommt aus Uniforms, die Hüllkugel der Geometrie stimmt nicht
	mesh.renderOrder = 12;
	return { mesh, r };
}

