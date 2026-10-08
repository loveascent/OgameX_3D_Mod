// Der Mond als reine Geometrie: Bahn, Kreuzungspunkt mit dem Strahl, Kameralage für die Schnittszene.
//
// Zielpunkt T der Station (nur im Kapitel „spass“): T = P + 0,30 R·seite + 0,22 R·oben. Die Waffenachse läuft von S nach T:
//   dT = norm(T − S)
// Bahnebene Π: die Ebene durch P, S, T  (Normale nΠ = norm((S−P) × (T−P))). In ihr liegt der Strahl – darum kann der Mond
// ihn auf seiner Kreisbahn überhaupt schneiden.  Bahn:  pos(φ) = P + ro·(cos φ·e1 + sin φ·e2),  φ = ω·(t − t_Schnitt)
// Kreuzungspunkt X: Strahl ∩ Bahnkreis (der der Station nähere Schnittpunkt der Geraden mit der Kugel um P, Radius ro):
//   m = S − P,  b = m·dT,  s = −b − √(b² − |m|² + ro²),  X = S + s·dT,  e1 = norm(X − P),  e2 = norm(nΠ × e1)
// Schnittebene des Mondes beim Durchflug: die Ebene, die Strahlachse dT und Flugrichtung v = ω·ro·e2 aufspannen,
//   Normale n = norm(dT × v). (Die Gerade „Strahl“ fegt beim Vorbeiflug genau diese Ebene durch den Mond.)
import { kombi, minus, plus, mal, norm, kreuz, punkt } from '../mathe/vektor.js';

export const MOND = {
	radius: 420,              // km (Bühnenmaßstab wie der Planet: 0,105 R)
	bahnRadien: 2.0,          // Bahnradius ro in Planetenradien
	v: 260,                   // Bahngeschwindigkeit km/s  →  ω = v / ro
	richtung: 1,              // Flugrichtung auf der Bahn (+1 oder −1)
	vorlauf: 8.2,             // s vom Auslösen des Schusses bis der Mondmittelpunkt den Strahl kreuzt (Strahl voll: 6,67 … 10 s)
	trennung: 60,             // km/s Auseinanderdriften je Hälfte (Dampfdruck in der Schnittfuge)
	blickVoraus: 1300,        // km: Kamera blickt so weit hinter den Kreuzungspunkt auf der Bahn
	kameraAbstand: 4300,      // km von X
	kameraHoehe: 32,          // Grad aus der Bahnebene
};

const speicher = new WeakMap();

export function mondGeometrie(w) {
	if (speicher.has(w)) return speicher.get(w);
	const ro = MOND.bahnRadien * w.R, omega = MOND.v / ro;
	const T = kombi(w.P, [0.3 * w.R, w.seite], [0.22 * w.R, w.oben]);
	const dT = norm(minus(T, w.S));
	const nPi = norm(kreuz(minus(w.S, w.P), minus(T, w.P)));
	const m = minus(w.S, w.P), b = punkt(m, dT);
	const s = -b - Math.sqrt(b * b - punkt(m, m) + ro * ro);
	const X = plus(w.S, mal(dT, s));
	const e1 = norm(minus(X, w.P));
	const e2 = mal(norm(kreuz(nPi, e1)), MOND.richtung ?? 1);
	const hoch = (MOND.kameraHoehe * Math.PI) / 180;
	const auge = plus(X, mal(plus(mal(e2, Math.cos(hoch)), mal(nPi, Math.sin(hoch))), MOND.kameraAbstand));
	const blick = plus(X, mal(e2, MOND.blickVoraus));   // Blickpunkt: ein Stück voraus auf der Bahn – der Mond kreuzt oben, die Hälften driften ins Bild
	const g = { ro, omega, T, dT, nPi, X, e1, e2, auge, blick, bahn: (phi) => plus(w.P, plus(mal(e1, ro * Math.cos(phi)), mal(e2, ro * Math.sin(phi)))) };
	speicher.set(w, g);
	return g;
}
