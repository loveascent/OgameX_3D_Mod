// Die Kamera: fährt in fester Zeit von der aktuellen Lage zur Einstellung des Kapitels. Sie liest die Welt,
// verändert sie aber nie – Simulation, Station und Strahl wissen nichts von ihr.
//
// Fahrt:  s = smootherstep(τ),  τ = (t − t₀)/DAUER,  smootherstep(x) = 6x⁵ − 15x⁴ + 10x³
//         (Geschwindigkeit UND Beschleunigung sind am Anfang und Ende null – kein Ruck beim Anfahren/Anhalten).
//         Lage:       p(s) = p₀ + s·(p₁ − p₀)
//         Ausrichtung: q(s) = slerp(q₀, q₁, s)       Bildwinkel: f(s) = f₀ + s·(f₁ − f₀)
// Ziel-Lage: Standort, Blick und Bildwinkel aus dem Kapitel (Quer-/Hochformat getrennt). Objektiv-Shift: das Bild
//         wird optisch verschoben (setViewOffset), damit Motive rechts bzw. oben und der Text frei liegen – ohne die
//         Kamera wegzudrehen, also ohne die Perspektive zu ändern. Shift wird mitgeblendet. Nicht je Bild – das würde „pumpen“.
// Ruhe:   In einer Einstellung gleitet die Kamera sehr langsam auf ihr Ziel zu (2 % des Abstands zum nächsten Körper,
//         Periode 60 s, hin und zurück) – das Bild steht nie ganz still, wackelt aber nicht.
// Kollision: Kein Punkt der Fahrt liegt in Station (1,4 r) oder Planet (1,03 R) – sonst radial hinausgeschoben.
import { minus, plus, mal, laenge, norm } from '../mathe/vektor.js';
import { slerp, kameraQuat } from '../mathe/ausrichtung.js';


export const DAUER = 2.8;   // s je Fahrt
const smootherstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (6 * x - 15) + 10); };

function zielLage(e, welt, k) {
	const format = k >= 1 ? 'quer' : 'hoch';
	const pos = e.auge(welt), vorne = norm(minus(e.ziel(welt, pos), pos));
	return { pos, quat: kameraQuat(vorne), fov: e.fov[format], shift: e.shift[format], vorne };
}

function schutz(p, welt) {
	for (const [m, r] of [[welt.S, welt.stationRadius * 1.4], [welt.P, welt.R * 1.03]]) {
		const v = minus(p, m), d = laenge(v);
		if (d < r) p = plus(m, mal(v, r / Math.max(d, 1e-6)));
	}
	return p;
}

export function erstelleKamera() {
	let jetzt = null, von = null, nach = null, t0 = 0, einstellung = null, verh = 0;
	return {
		/** e: Kapitel aus welt/kapitel.js · t: Zeit (s) · seitenverhaeltnis: Breite/Höhe */
		schritt(e, welt, t, seitenverhaeltnis) {
			if (e !== einstellung || Math.abs(seitenverhaeltnis - verh) > 1e-3) {
				const neu = zielLage(e, welt, seitenverhaeltnis);
				const sofort = !jetzt || e === einstellung;   // erstes Bild oder nur die Fenstergröße hat sich geändert
				von = sofort ? neu : jetzt; nach = neu; t0 = sofort ? t - DAUER : t;
				einstellung = e; verh = seitenverhaeltnis;
			}
			const s = smootherstep((t - t0) / DAUER);
			let pos = plus(von.pos, mal(minus(nach.pos, von.pos), s));
			const naechster = Math.max(1, Math.min(laenge(minus(pos, welt.S)) - welt.stationRadius, laenge(minus(pos, welt.P)) - welt.R));
			pos = plus(pos, mal(nach.vorne, 0.02 * naechster * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 60))));
			pos = schutz(pos, welt);
			jetzt = { pos, quat: slerp(von.quat, nach.quat, s), fov: von.fov + (nach.fov - von.fov) * s, vorne: nach.vorne,
				shift: [0, 1].map((i) => von.shift[i] + (nach.shift[i] - von.shift[i]) * s) };
			return jetzt;
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
	// Objektiv-Shift: Bildausschnitt um shift·(Breite/2, Höhe/2) verschieben – Motiv rückt nach rechts/oben
	const B = 1000 * seitenverhaeltnis, H = 1000;
	threeKamera.setViewOffset(B, H, -kam.shift[0] * B / 2, kam.shift[1] * H / 2, B, H);
	threeKamera.updateMatrixWorld(true);
}
