// Kapitel = Kameraeinstellungen in der Welt (reine Daten). Blättern wechselt das Kapitel, die Kamera fährt hin.
// Die Welt läuft davon unabhängig weiter: Planet strömt, Station dreht, Schüsse folgen dem Feuerplan.
//
// Gestaltungsraster: Querformat – Text links (x < −0,3), Motive rechts. Hochformat – Text unten, Motive oben.
// Mittel dafür ist der Objektiv-Shift (wie bei Architektur- und Filmkameras): Die Kamera blickt auf das Motiv,
// das Bild wird optisch verschoben – die Perspektive bleibt unverändert (kamera/kamera.js, setViewOffset).
//   auge    Standort          ziel    Blickpunkt
//   fov     senkrechter Bildwinkel (Grad) je Format     shift   Verschiebung des Motivs im Bild (−1 … 1) je Format
//   feuer   Pause zwischen zwei Schüssen (s); fehlt = Station schießt nicht. Mit Mond (koerper/mond) schießt die Station nur, wenn der
//           Mond in 8,2 s den Strahl kreuzt, und zielt dann auf die Planetenmitte – die Pause entfällt (0).
// Bezugssysteme:
//   st(w, a, s, o)  Kilometer ab der Station        entlang (Achse zum Planeten, Seite, Oben)
//   pl(w, a, s, o)  Planetenradien ab Planetenmitte  entlang derselben Achsen
//   zwischen(A, B, f)  Blick zwischen zwei Körpern (f = 0 auf A, 1 auf B)
// Wer den Schuss sehen soll, steht SEITLICH der Waffenachse: dann läuft der Strahl quer durchs Bild.
// Rechnerisch geprüft (Bildlage, Größe): node werkzeug/seite/kompositionen.mjs
import { kombi, minus, norm, plus } from '../mathe/vektor.js';

const st = (w, a, s, o) => kombi(w.S, [a, w.a], [s, w.seite], [o, w.oben]);
const pl = (w, a, s, o) => kombi(w.P, [a * w.R, w.a], [s * w.R, w.seite], [o * w.R, w.oben]);
const zwischen = (A, B, f) => (w, auge) => {
	const a = norm(minus(A(w), auge)), b = norm(minus(B(w), auge));
	return plus(auge, norm(a.map((k, i) => k * (1 - f) + b[i] * f)));
};
const S = (w) => w.S, P = (w) => w.P;
const QUER = [0.32, 0], HOCH = [0, 0.3];

export const KAPITEL = [
	{ id: 'start', auge: (w) => st(w, -360, 210, 60), ziel: zwischen(S, P, 0.5), fov: { quer: 50, hoch: 80 }, shift: { quer: QUER, hoch: HOCH }, feuer: { pause: 0 } },
	{ id: 'veteranen', auge: (w) => pl(w, -2.4, 0.7, 0.35), ziel: (w) => pl(w, 0, 0.15, 0), fov: { quer: 44, hoch: 66 }, shift: { quer: QUER, hoch: HOCH } },
	{ id: 'zusammen', auge: (w) => st(w, 260, -300, 100), ziel: S, fov: { quer: 40, hoch: 62 }, shift: { quer: QUER, hoch: HOCH } },
	{ id: 'siegreich', auge: (w) => st(w, -330, -210, -50), ziel: zwischen(S, P, 0.5), fov: { quer: 50, hoch: 80 }, shift: { quer: QUER, hoch: HOCH }, feuer: { pause: 0 } },
	{ id: 'celestia', auge: (w) => st(w, -1300, 520, 650), ziel: zwischen(S, P, 0.4), fov: { quer: 40, hoch: 62 }, shift: { quer: QUER, hoch: HOCH } },
	{ id: 'jubilaeum', auge: (w) => pl(w, -2.3, -0.75, -0.3), ziel: (w) => pl(w, 0, -0.15, 0), fov: { quer: 44, hoch: 66 }, shift: { quer: QUER, hoch: HOCH } },
	{ id: 'bewerben', auge: (w) => st(w, -350, -190, 40), ziel: zwischen(S, P, 0.5), fov: { quer: 50, hoch: 80 }, shift: { quer: QUER, hoch: HOCH }, feuer: { pause: 0 } },
];

export const kapitelIndex = (id) => Math.max(0, KAPITEL.findIndex((k) => k.id === id));
