// Ausrichtung von Körpern und Kameras als Einheitsquaternion [x, y, z, w] (rein, ohne three.js).
//
// blickQuat(vorne, oben): orthonormale Basis mit  z' = vorne  (Waffenachse der Station: +z im Modell),
//   x' = norm(oben × z'),  y' = z' × x'   → Rotationsmatrix M = [x' y' z'] (Spalten) → Quaternion.
// Ist vorne ∥ oben, wird ein Ersatz-„oben“ genommen (sonst wäre x' = 0).
//
// drehBegrenzt(ist, soll, ωmax, dt): dreht höchstens um ωmax·dt in Richtung soll (Slerp mit begrenztem Winkel).
// So verhält sich eine Raumstation träge: ihre Drehgeschwindigkeit ist endlich, nicht unendlich.
import { kreuz, norm } from './vektor.js';

export function matrixZuQuat(m) {   // m: Spalten [x', y', z'] als 3 Arrays
	const [a, b, c] = m, t = a[0] + b[1] + c[2];
	if (t > 0) { const s = Math.sqrt(t + 1) * 2; return [(b[2] - c[1]) / s, (c[0] - a[2]) / s, (a[1] - b[0]) / s, s / 4]; }
	if (a[0] > b[1] && a[0] > c[2]) { const s = Math.sqrt(1 + a[0] - b[1] - c[2]) * 2; return [s / 4, (b[0] + a[1]) / s, (c[0] + a[2]) / s, (b[2] - c[1]) / s]; }
	if (b[1] > c[2]) { const s = Math.sqrt(1 + b[1] - a[0] - c[2]) * 2; return [(b[0] + a[1]) / s, s / 4, (c[1] + b[2]) / s, (c[0] - a[2]) / s]; }
	const s = Math.sqrt(1 + c[2] - a[0] - b[1]) * 2; return [(c[0] + a[2]) / s, (c[1] + b[2]) / s, s / 4, (a[1] - b[0]) / s];
}

/** Quaternion, das +z auf `vorne` und +y möglichst auf `oben` dreht. */
export function blickQuat(vorne, oben = [0, 1, 0]) {
	const z = norm(vorne);
	let x = kreuz(oben, z);
	if (Math.hypot(...x) < 1e-6) x = kreuz(Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1], z);
	x = norm(x);
	return matrixZuQuat([x, kreuz(z, x), z]);
}

/** Vektor v mit Quaternion q drehen:  v' = v + 2w(q×v) + 2 q×(q×v) */
export function drehe(q, v) {
	const u = [q[0], q[1], q[2]], t = kreuz(u, v).map((k) => 2 * k);
	const s = kreuz(u, t);
	return [v[0] + q[3] * t[0] + s[0], v[1] + q[3] * t[1] + s[1], v[2] + q[3] * t[2] + s[2]];
}

/** Produkt a·b (erst b, dann a drehen) */
export function quatMal(a, b) {
	const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
	return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

/** Kürzeste Drehung, die Einheitsvektor von auf Einheitsvektor nach dreht. */
export function quatVonNach(von, nach) {
	const c = kreuz(von, nach), w = 1 + von[0] * nach[0] + von[1] * nach[1] + von[2] * nach[2];
	if (w < 1e-8) return blickQuat(nach);   // entgegengesetzt: irgendeine Halbdrehung
	const l = Math.hypot(c[0], c[1], c[2], w);
	return [c[0] / l, c[1] / l, c[2] / l, w / l];
}

/** Winkel zwischen zwei Ausrichtungen: θ = 2·acos|q₁·q₂| */
export const quatWinkel = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));

export function slerp(a, b, t) {
	let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
	const s = d < 0 ? -1 : 1; d *= s;   // kürzerer Weg
	if (d > 0.9995) { const q = a.map((k, i) => k + (s * b[i] - k) * t); const l = Math.hypot(...q); return q.map((k) => k / l); }
	const th = Math.acos(d), sa = Math.sin((1 - t) * th) / Math.sin(th), sb = Math.sin(t * th) / Math.sin(th);
	return a.map((k, i) => k * sa + s * b[i] * sb);
}

/** Höchstens ωmax·dt weiterdrehen (rad/s). Liefert die neue Ausrichtung. */
export function drehBegrenzt(ist, soll, omegaMax, dt) {
	const th = quatWinkel(ist, soll);
	if (th < 1e-7) return soll.slice();
	return slerp(ist, soll, Math.min(1, (omegaMax * dt) / th));
}

/** Richtungen für die Kamera: Basis (rechts, oben, hinten) aus Blickrichtung, wie three.js lookAt (Kamera blickt −z). */
export function kameraQuat(vorne, oben = [0, 1, 0]) { return blickQuat(vorne.map((k) => -k), oben); }

