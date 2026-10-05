// Kapitel = Kameraeinstellungen in der Welt (reine Daten). Blättern wechselt das Kapitel, die Kamera fliegt hin.
// Die Welt läuft davon unabhängig weiter: Planet strömt, Station dreht, Schüsse folgen dem Feuerplan.
//
// Positionen werden in den natürlichen Bezugssystemen angegeben, nicht in Weltkoordinaten:
//   st(w, a, s, o)  Kilometer ab der Station        entlang (Achse zum Planeten, Seite, Oben)
//   pl(w, a, s, o)  Planetenradien ab Planetenmitte  entlang derselben Achsen
// So bleibt jede Einstellung richtig, wenn sich Planetenradius, Abstand oder Achse ändern.
//
//   fov     senkrechter Bildwinkel (Grad) für ein Querformat-Fenster 16:9
//   breite  Anteil der Querformat-Breite, der auch im Hochformat sichtbar bleibt (kamera/rahmen.js)
//   sicht   Körper, die immer ganz im Bild sein müssen: [Mittelpunkt, Radius]
//   feuer   Feuerplan der Station: Abstand zwischen zwei Schüssen (s); fehlt = Station schießt nicht
import { kombi } from '../mathe/vektor.js';

const st = (w, a, s, o) => kombi(w.S, [a, w.a], [s, w.seite], [o, w.oben]);
const pl = (w, a, s, o) => kombi(w.P, [a * w.R, w.a], [s * w.R, w.seite], [o * w.R, w.oben]);
const station = (w) => [w.S, w.stationRadius];

export const KAPITEL = [
	{ id: 'start',     auge: (w) => st(w, -2300, 380, 170), ziel: (w) => pl(w, 0, -0.32, 0.08), fov: 24, breite: 0.55,
		sicht: (w) => [station(w)], feuer: { pause: 9 } },
	{ id: 'aktiv',     auge: (w) => pl(w, -2.15, 1.05, 0.42), ziel: (w) => pl(w, 0, 0.32, 0.05), fov: 38, breite: 0.6, sicht: () => [] },
	{ id: 'schutz',    auge: (w) => st(w, 210, -250, 95), ziel: (w) => st(w, 0, 25, 0), fov: 46, breite: 0.75,
		sicht: (w) => [station(w)] },
	{ id: 'feuer',     auge: (w) => st(w, -520, 270, 75), ziel: (w) => st(w, 1400, 0, 0), fov: 34, breite: 0.8,
		sicht: (w) => [station(w)], feuer: { pause: 4 } },
	{ id: 'gemeinsam', auge: (w) => st(w, -900, -1100, 620), ziel: (w) => st(w, 3000, 0, -40), fov: 36, breite: 0.7,
		sicht: (w) => [station(w)] },
	{ id: 'projekte',  auge: (w) => pl(w, -1.75, -0.75, -0.35), ziel: (w) => pl(w, 0, -0.28, 0), fov: 40, breite: 0.6, sicht: () => [] },
	{ id: 'bewerben',  auge: (w) => st(w, -2000, -330, -140), ziel: (w) => pl(w, 0, 0.3, 0), fov: 26, breite: 0.55,
		sicht: (w) => [station(w)], feuer: { pause: 7 } },
];

export const kapitelIndex = (id) => Math.max(0, KAPITEL.findIndex((k) => k.id === id));
