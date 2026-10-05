// Einschlag am Planeten. Was ankommt, ist die Leistung von vor L/c Sekunden (strahl/verlauf.js leistungBei).
//
// Feuerball: Energie wird in der Atmosphäre abgelegt, die heiße Blase dehnt sich wie eine Punktexplosion
//   (Sedov-Taylor):  r(t) = r₁ · (t / 1 s)^(2/5),   r₁ = 1 200 km
// (Zum Vergleich: die Einschläge von Shoemaker-Levy 9 auf Jupiter 1994 warfen Fahnen von ~3 000 km Höhe auf.)
// Temperatur: während Energie ankommt T = 2 500 K + 7 000 K · Leistung; danach Abkühlung T ← T·e^(−dt/τ), τ = 2,5 s.
// Farbe = Schwarzkörper(T), Helligkeit ∝ T⁴ (mathe/schwarzkoerper.js).
// Darstellung: zur Kamera gedrehte Scheibe mit weichem Rand, um r zur Kamera hin versetzt (sonst schnitte die
// Planetentiefe sie halb ab). Additiv (Licht).
// Strömung: Beim ersten Eintreffen eines Schusses stößt der Einschlag einen dunklen Wirbel an der Trefferstelle an
//   (Breite/Länge im Körperrahmen) – wie die dunklen Einschlagsflecken von 1994, die die Jets danach verwehten.
import * as THREE from 'three/webgpu';
import { uniform, uv, vec4, float, length, smoothstep, exp } from 'three/tsl';
import { leistungBei } from './verlauf.js';
import { inKoerper } from './strahl.js';
import { schwarzkoerper, leistungT } from '../../mathe/schwarzkoerper.js';
import { breiteLaenge } from '../../mathe/ellipsoid.js';
import { glanzMischung } from '../../gpu/mischung.js';
import { minus, norm, plus, mal } from '../../mathe/vektor.js';

const R1 = 1200, TAU = 2.5;

export function erstelleEinschlag(szene) {
	const farbe = uniform(new THREE.Color(0, 0, 0));
	const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
	glanzMischung(m);
	const q = uv().sub(0.5).mul(2), d = length(q);
	m.colorNode = vec4(farbe.mul(exp(d.mul(d).mul(-4))).mul(float(1).sub(smoothstep(0.85, 1, d))), 1);
	const scheibe = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
	scheibe.frustumCulled = false; scheibe.renderOrder = 13; scheibe.visible = false;
	szene.add(scheibe);
	let T = 0, alter = 0, letzterSchuss = null, E = null;

	return {
		/** st: Station · sz: Strahl-Zustand · planet: wirbel/koerper · z: { dt, t, kamera } */
		schritt(welt, st, sz, planet, z) {
			const ankunft = sz.E ? leistungBei(sz.L, z.t, st.feuerZeit) : 0;
			if (ankunft > 0.01) {
				if (letzterSchuss !== st.feuerZeit) {   // erstes Eintreffen dieses Schusses
					letzterSchuss = st.feuerZeit; alter = 0;
					const k = inKoerper(planet.koerper, minus(sz.E, welt.P));
					planet.wirbel(breiteLaenge(k, welt.f));
				}
				E = sz.E;
				T = Math.max(T, 2500 + 7000 * ankunft);
			} else T *= Math.exp(-z.dt / TAU);
			alter += z.dt;
			const sichtbar = E && T > 1200;
			scheibe.visible = !!sichtbar;
			if (!sichtbar) return;
			const r = R1 * Math.max(alter, 0.05) ** 0.4;
			const zurKamera = norm(minus(z.kamera.position.toArray(), E));
			scheibe.position.set(...plus(E, mal(zurKamera, r)));
			scheibe.quaternion.copy(z.kamera.quaternion);
			scheibe.scale.setScalar(r);
			const c = schwarzkoerper(T), h = 6 * leistungT(T);
			farbe.value.setRGB(c[0] * h, c[1] * h, c[2] * h);
		},
		dispose() { szene.remove(scheibe); m.dispose(); },
	};
}
