// Schussablauf der Station als Steuerkurven über der Zeit seit dem Auslösen (Sekunden).
// Stützpunkte aus der Blender-Animation der Station (30 Bilder/s, umgerechnet in Sekunden):
//   ladung  Energie in der Trommel (Blitze dichter, Iris heller)
//   bluete  Öffnung der 8 Blenden vor der Mündung (0 = zu, 1 = 45° offen)
//   strahl  Leistung an der Mündung (0 … 1); was davon wann am Planeten ankommt, rechnet strahl/verlauf.js
// Zwischen zwei Stützpunkten: smoothstep (Steigung 0 an beiden Enden, wie Bézier mit flachen Griffen).
export const KURVEN = {
	ladung: [[0, 0], [3, 0], [6.37, 1], [9.97, 0.55], [11.23, 0]],
	bluete: [[0, 0], [5, 0], [6.3, 1], [10.77, 1], [12.3, 0]],
	strahl: [[0, 0], [6.5, 0], [6.67, 1], [7.33, 0.72], [10, 0.7], [10.6, 0]],
};
export const DAUER = 16;   // s bis der Ablauf ganz vorbei ist (Blenden zu, Nachglühen aus)

export function kurve(k, t) {
	if (t <= k[0][0]) return k[0][1];
	for (let i = 1; i < k.length; i++) {
		if (t <= k[i][0]) {
			const [t0, v0] = k[i - 1], [t1, v1] = k[i], x = (t - t0) / (t1 - t0);
			return v0 + (v1 - v0) * x * x * (3 - 2 * x);
		}
	}
	return k[k.length - 1][1];
}

/** Zustand des Ablaufs zur Zeit s seit dem Auslösen (s < 0 oder ≥ DAUER: Ruhe). */
export function ablauf(s) {
	if (!(s >= 0 && s < DAUER)) return { ladung: 0, bluete: 0, strahl: 0, aktiv: false };
	return { ladung: kurve(KURVEN.ladung, s), bluete: kurve(KURVEN.bluete, s), strahl: kurve(KURVEN.strahl, s), aktiv: true };
}
