// Der Mond als reine Geometrie und Bahnrechnung (kein three.js).
//
// Der Mond kreist DAUERHAFT um den Planeten, in einer Ebene Π, die die Strahlachse Station → Planet enthält.
// Die Station zielt (wenn der Mond da ist) genau auf die Planetenmitte P, der Strahl liegt also auf der Achse a und damit in Π.
//   e1 = −a                      radial an der Kreuzung (von P zur Station)
//   u  = −norm(seite·cos ν + oben·sin ν)  Flugrichtung an der Kreuzung (⟂ a), ν = Neigung der Bahn gegen die Waagerechte
//   Bahn:  pos(φ) = P + ro·(cos φ·e1 + sin φ·u)           φ = 0 ist die Kreuzung mit dem Strahl: X = P + ro·e1
// Der Mond ist dort der Station am nächsten (groß im Bild), auf der Rückseite (φ = ±π) hinter dem Planeten, klein und weit weg.
//
// Winkelgeschwindigkeit φ̇ = ω(φ):  an der Kreuzung ω_n = v_n / ro (der Mond zieht dort langsam durchs Bild),
//   auf der Rückseite fernFaktor-mal schneller – dort ist er winzig oder verdeckt, und die Zeit bis zum nächsten Anflug bleibt kurz:
//   ω(φ) = ω_n · (1 + (f − 1)·smoothstep(0 … 0,6 ; d)),  d = Abstand von φ zum langsamen Fenster [−0,2 ; 0,4]  (φ auf (−π, π] gewickelt)
// Die Zeit bis zur nächsten Kreuzung folgt aus dem Integral  T(φ) = ∫ dφ′ / ω(φ′)  (numerisch, Mittelpunktsregel) – so weiß die
// Station, wann sie schießen muss: Auslösen, wenn T ≤ vorlauf (der Strahl ist 6,5 s nach dem Auslösen da).
// Schnittebene des Mondes beim Durchflug: Ebene aus Strahlachse d und Flugrichtung v, Normale n = norm(d × v) (siehe koerper/mond/mond.js).
import { norm, kreuz, mal, plus } from '../mathe/vektor.js';

export const MOND = {
	radius: 300,              // km (Bühnenmaßstab wie der Planet: 0,075 R)
	bahnRadien: 2.6,          // Bahnradius ro in Planetenradien (Kreuzung 2 400 km vor der Station)
	vNah: 210,                // km/s an der Kreuzung (Schnitt dauert 2 r / v ≈ 2,9 s, danach bleibt der Mond lange im Bild)
	fernFaktor: 14,           // Winkelgeschwindigkeit auf der Rückseite relativ zur Kreuzung
	neigung: 20,              // Grad: Bahnebene gegen die Waagerechte
	vorlauf: 8.2,             // s vom Auslösen des Schusses bis der Mondmittelpunkt den Strahl kreuzt (Strahl voll: 6,7 … 10 s)
	trennung: 60,             // km/s Auseinanderdriften je Hälfte (Dampfdruck in der Schnittfuge)
};

const PI2 = 2 * Math.PI;
/** Langsames Fenster um die Kreuzung (rad): davor 0,2 rad ≈ 10 s Anflug im Bild, danach 0,4 rad, in denen die Hälften sichtbar bleiben */
const FENSTER = [-0.2, 0.4];
const wickle = (p) => p - PI2 * Math.round(p / PI2);   // (−π, π]
const glatt = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };

const speicher = new WeakMap();

export function mondGeometrie(w) {
	if (speicher.has(w)) return speicher.get(w);
	const ro = MOND.bahnRadien * w.R, nu = (MOND.neigung * Math.PI) / 180;
	const e1 = mal(w.a, -1);
	const u = norm(plus(mal(w.seite, -Math.cos(nu)), mal(w.oben, -Math.sin(nu))));   // Umlaufsinn: von rechts (hinter dem Planeten) nach links zur Bildmitte
	const nPi = norm(kreuz(e1, u));
	const X = plus(w.P, mal(e1, ro));
	const g = { ro, omegaNah: MOND.vNah / ro, T: w.P, dT: w.a, e1, e2: u, nPi, X,
		bahn: (phi) => plus(w.P, plus(mal(e1, ro * Math.cos(phi)), mal(u, ro * Math.sin(phi)))) };
	speicher.set(w, g);
	return g;
}

/** Winkelgeschwindigkeit (rad/s) bei Bahnwinkel φ */
export const omega = (g, phi) => {
	const p = wickle(phi), d = p < FENSTER[0] ? FENSTER[0] - p : p > FENSTER[1] ? p - FENSTER[1] : 0;
	return g.omegaNah * (1 + (MOND.fernFaktor - 1) * glatt(0, 0.6, d));
};

/** φ nach dt Sekunden (Mittelpunktsregel, 4 Teilschritte) */
export function weiter(g, phi, dt) {
	const h = dt / 4;
	for (let i = 0; i < 4; i++) phi += omega(g, phi + 0.5 * h * omega(g, phi)) * h;
	return wickle(phi);
}

/** Sekunden bis der Mond das nächste Mal φ = 0 erreicht (strikt voraus) */
export function zeitBis(g, phi) {
	let p = wickle(phi);
	if (p >= 0) p -= PI2;
	const n = 400, h = -p / n;
	let t = 0;
	for (let i = 0; i < n; i++) t += h / omega(g, p + (i + 0.5) * h);
	return t;
}
