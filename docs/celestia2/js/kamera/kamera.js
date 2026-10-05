// Die Kamera: fliegt zur Einstellung des aktuellen Kapitels. Sie liest die Welt, verändert sie aber nie –
// Simulation, Station und Strahl wissen nichts von ihr (sie bekommen sie nur zum Zeichnen).
//
// Position:  kritisch gedämpfte Feder (mathe/feder.js), ω = 2,2/s → 95 % des Wegs in ~2,2 s, egal wie weit.
// Blick:     immer auf das Ziel der Einstellung, Ausrichtung geglättet: q ← slerp(q, q_soll, 1 − e^(−k·dt)).
// Kollision: Die Kamera bleibt außerhalb von Station (1,6 r) und Planet (1,04 R). Liegt ein Punkt der Flugbahn
//            innen, wird er radial auf die Schutzkugel geschoben – die Kamera fliegt außen herum statt hindurch.
// Atmen:     langsames seitliches Pendeln, Weg = ±1,5 % des Abstands zum NÄCHSTEN Körper (Periode 90 s).
//            Bezug ist der nächste Körper, nicht das Ziel: das Ziel kann 466 000 km entfernt sein.
import { federVektor, feder } from '../mathe/feder.js';
import { minus, plus, mal, laenge, norm } from '../mathe/vektor.js';
import { kameraQuat, slerp, drehe } from '../mathe/ausrichtung.js';
import { bildwinkel } from './rahmen.js';

const OMEGA = 2.2, DREH_K = 3.2, ATMEN = 0.015;

export function erstelleKamera() {
	const pos = federVektor(OMEGA), fov = feder(OMEGA, 30);
	let quat = [0, 0, 0, 1], neu = true;

	function schutz(p, welt) {
		for (const [m, r] of [[welt.S, welt.stationRadius * 1.6], [welt.P, welt.R * 1.04]]) {
			const v = minus(p, m), d = laenge(v);
			if (d < r) p = plus(m, mal(v, r / Math.max(d, 1e-6)));
		}
		return p;
	}

	return {
		/** Ein Schritt. einstellung: Kapitel aus welt/kapitel.js · seitenverhaeltnis: Breite/Höhe des Bildes. */
		schritt(einstellung, welt, dt, t, seitenverhaeltnis, sofort = false) {
			const ziel = einstellung.ziel(welt);
			let soll = einstellung.auge(welt);
			const naechster = Math.min(laenge(minus(soll, welt.S)), laenge(minus(soll, welt.P)) - welt.R);
			soll = plus(soll, mal(welt.seite, ATMEN * naechster * Math.sin((2 * Math.PI * t) / 90)));
			if (neu || sofort) { pos.setze(soll); neu = false; }
			const roh = pos.schritt(soll, dt), p = schutz(roh, welt);
			if (p !== roh) pos.setze(p);   // nur nach dem Wegschieben: die Feder läuft von der geschützten Lage weiter
			const vorne = norm(minus(ziel, p));
			const qSoll = kameraQuat(vorne, [0, 1, 0]);
			quat = sofort ? qSoll : slerp(quat, qSoll, 1 - Math.exp(-DREH_K * dt));
			// Bildwinkel aus der tatsächlichen Blickrichtung (nicht der gewünschten), damit die Körper wirklich drin sind
			const v = drehe(quat, [0, 0, -1]), r = drehe(quat, [1, 0, 0]), o = drehe(quat, [0, 1, 0]);
			const sollFov = bildwinkel(p, { vorne: v, rechts: r, oben: o }, einstellung.fov, einstellung.breite, seitenverhaeltnis, einstellung.sicht(welt));
			if (sofort) fov.setze(sollFov);
			return { pos: p, quat, fov: fov.schritt(sollFov, dt), vorne: v, rechts: r, oben: o };
		},
	};
}

/** Auf eine three.js-PerspectiveCamera übertragen. near/far: reversed-Z mit Gleitkomma-Tiefe hält 0,5 km bis 10⁷ km. */
export function aufThree(kam, threeKamera, seitenverhaeltnis) {
	threeKamera.position.set(...kam.pos);
	threeKamera.quaternion.set(...kam.quat);
	threeKamera.fov = kam.fov;
	threeKamera.aspect = seitenverhaeltnis;
	threeKamera.near = 0.5; threeKamera.far = 1e7;
	threeKamera.updateProjectionMatrix();
	threeKamera.updateMatrixWorld(true);
}
