// Leistung entlang des Strahls. Der Strahl ist Licht: Was im Abstand s von der Mündung leuchtet, wurde zur Zeit
//   t_aus = t − s/c   ausgesandt.  Leuchtdichte(s) ∝ Leistung(t − s/c)
// Damit fliegen Front und Ende mit Lichtgeschwindigkeit (bei 465 000 km: 1,55 s), ohne eigene Sonderregel.
// Die Leistung ist eine reine Funktion der Zeit (station/ablauf.js), darum wird hier nichts gespeichert:
//   probe[k] = Leistung(t − k·Δ),  k = 0 … N−1,  Δ = 1/RATE s   (der Shader interpoliert linear dazwischen)
import { ablauf } from '../station/ablauf.js';
import { MASSE } from '../../welt/masse.js';

export const RATE = 48, N = 128;   // 128 Proben à 1/48 s = 2,67 s ≙ 800 000 km Strahllänge

/** Proben in ein vorhandenes Array schreiben. feuerZeit: Auslösezeit des Schusses (Simulationszeit). */
export function proben(ziel, t, feuerZeit) {
	for (let k = 0; k < N; k++) ziel[k] = ablauf(t - k / RATE - feuerZeit).strahl;
	return ziel;
}

/** Leistung, die gerade im Abstand s (km) ankommt (für den Einschlag). */
export const leistungBei = (s, t, feuerZeit) => ablauf(t - s / MASSE.c - feuerZeit).strahl;
