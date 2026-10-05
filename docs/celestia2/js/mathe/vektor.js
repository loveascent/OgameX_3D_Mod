// Vektoren als einfache Arrays [x, y, z]. Rein, ohne three.js – läuft auch in Node (Prüfungen).
// Einheiten bestimmt der Aufrufer; in der Welt sind es Kilometer (welt/masse.js).

export const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mal = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const punkt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const kreuz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const laenge = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => mal(a, 1 / (laenge(a) || 1));
export const abstand = (a, b) => laenge(minus(a, b));
/** p + Σ kᵢ·vᵢ  – Punkt aus Koordinaten in einer Basis (z. B. auge = S + (−380)·a + 170·seite) */
export const kombi = (p, ...paare) => paare.reduce((q, [k, v]) => plus(q, mal(v, k)), p);
/** Winkel zwischen zwei Richtungen in rad: θ = atan2(|a×b|, a·b)  (genauer als acos bei kleinen Winkeln) */
export const winkel = (a, b) => Math.atan2(laenge(kreuz(a, b)), punkt(a, b));
