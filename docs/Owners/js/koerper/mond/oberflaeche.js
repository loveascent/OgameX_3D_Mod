// Oberfläche des Mondes (prozedural, ohne Textur): Einschlagkrater als Voronoi-Zellen, Hochland und Meere als Rauschen.
//   Höhe h(p) = −Σᵢ wᵢ·Schüssel(dᵢ) + Σᵢ wᵢ·Rand(dᵢ) + 0,18·fbm(p)       p = Punkt auf der Einheitskugel, dᵢ = Abstand zum nächsten Zellpunkt bei Frequenz fᵢ
//   Schüssel(d) = 1 − smoothstep(0, 0,34, d)        Rand(d) = smoothstep(0,30, 0,36, d)·(1 − smoothstep(0,36, 0,5, d))
// Die Höhe wirkt nur als Bump (Normale), die Kugel bleibt glatt. Farbe: dunkles Meer ↔ helles Hochland, Kraterränder heller.
// Schnitt: Jede Hälfte zeichnet nur die Seite ihrer Ebene  s·(n·(p − C) − h) ≥ 0  (Welt, C = Mitte der Hälfte, s = ±1).
// Naht: auf der schon durchflogenen Seite des Strahls (v·(p − X) > 0) glüht ein Band um die Schnittebene, hell am Strahl, nach hinten abkühlend.
import * as THREE from 'three/webgpu';
import { uniform, vec3, float, positionLocal, positionWorld, mx_worley_noise_float, mx_fractal_noise_float, smoothstep, mix,
	dot, abs, exp, clamp, bumpMap, select, max } from 'three/tsl';

const kraterLage = (p, f, gewicht) => {
	const d = mx_worley_noise_float(p.mul(f), float(0.9));
	const schuessel = float(1).sub(smoothstep(0, 0.34, d));
	const rand = smoothstep(0.30, 0.36, d).mul(float(1).sub(smoothstep(0.36, 0.5, d)));
	return rand.mul(0.55).sub(schuessel).mul(gewicht);
};

export function erstelleMondMaterial(vorzeichen) {
	const u = {
		C: uniform(new THREE.Vector3()), n: uniform(new THREE.Vector3(0, 1, 0)), h: uniform(0),
		X: uniform(new THREE.Vector3()), v: uniform(new THREE.Vector3(1, 0, 0)), naht: uniform(0), nahtBreite: uniform(4),
	};
	const p = positionLocal;
	const hoehe = kraterLage(p, 2.6, 1).add(kraterLage(p.add(7.3), 7, 0.5)).add(kraterLage(p.add(1.9), 19, 0.2))
		.add(mx_fractal_noise_float(p.mul(5), 4, 2, 0.5).mul(0.55));
	const meer = smoothstep(-0.15, 0.25, mx_fractal_noise_float(p.mul(1.7).add(3.1), 3, 2, 0.5));
	const alb = mix(vec3(0.17, 0.155, 0.145), vec3(0.46, 0.42, 0.37), meer).mul(float(0.82).add(hoehe.mul(0.09).clamp(-0.25, 0.3)));

	const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.96, metalness: 0 });
	m.colorNode = alb;
	m.normalNode = bumpMap(hoehe, 0.35);
	m.maskNode = dot(positionWorld.sub(u.C), u.n).sub(u.h).mul(vorzeichen).greaterThanEqual(0);
	// Naht: Abstand zur Schnittebene, Tiefe hinter dem Strahl
	const ebene = abs(dot(positionWorld.sub(u.C), u.n).sub(u.h));
	const hinter = dot(positionWorld.sub(u.X), u.v);
	const band = float(1).sub(smoothstep(0, u.nahtBreite, ebene)).mul(select(hinter.greaterThan(0), float(1), float(0)));
	const glut = band.mul(exp(hinter.max(0).mul(-1 / 70)).mul(1.2).add(0.25)).mul(u.naht);
	m.emissiveNode = mix(vec3(1.0, 0.35, 0.06), vec3(1.0, 0.85, 0.6), clamp(glut.mul(0.25), 0, 1)).mul(glut).mul(9);
	return { material: m, u };
}
