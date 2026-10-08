// Abgeplatteter Planet als Rotationsellipsoid – dieselbe Gleichung wie im Planeten-Shader (hitPlanet):
//
//   Körperrahmen (y = Drehachse):   x² + (y/c)² + z² = R²,   c = 1 − f   (f = Abplattung, Jupiter 0,0649)
//
// Strahl p(t) = o + t·d (Körperrahmen). Mit der Streckung s = (1, 1/c, 1) wird das Ellipsoid zur Kugel |p·s| = R:
//   a·t² + 2b·t + k = 0   mit   a = |d·s|²,  b = (o·s)·(d·s),  k = |o·s|² − R²
//   t = (−b − √(b² − a·k)) / a        (kleinere Lösung = Eintrittspunkt; Diskriminante < 0 = vorbei)
// Normale am Punkt p:  n ∝ ∇(x² + y²/c² + z²) = (x, y/c², z)
import { punkt, norm } from './vektor.js';

const streck = (v, c) => [v[0], v[1] / c, v[2]];

/** Schnitt Strahl–Ellipsoid im Körperrahmen. Rückgabe t ≥ 0 oder null (vorbei / hinter dem Ursprung). */
export function schnitt(o, d, R, f) {
	const c = 1 - f, os = streck(o, c), ds = streck(d, c);
	const a = punkt(ds, ds), b = punkt(os, ds), k = punkt(os, os) - R * R;
	const disk = b * b - a * k;
	if (disk < 0) return null;
	const t = (-b - Math.sqrt(disk)) / a;
	return t >= 0 ? t : null;
}

/** Äußere Normale am Oberflächenpunkt p (Körperrahmen). */
export const normale = (p, f) => { const c = 1 - f; return norm([p[0], p[1] / (c * c), p[2]]); };

/** Breite/Länge in Grad wie im Simulator: q = normalize(p·s) = (cos φ cos λ, sin φ, cos φ sin λ). */
export function breiteLaenge(p, f) {
	const q = norm(streck(p, 1 - f));
	return { breite: Math.asin(Math.max(-1, Math.min(1, q[1]))) * 180 / Math.PI, laenge: Math.atan2(q[2], q[0]) * 180 / Math.PI };
}
