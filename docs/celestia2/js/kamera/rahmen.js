// Bildausschnitt für jedes Seitenverhältnis. Die Welt ändert sich nie mit dem Fenster – nur der Bildwinkel.
//
// Lochkamera: ein Punkt mit Kamerakoordinaten (x, y, z) (z = Abstand nach vorn) landet bei
//   u = x / (z · tan(H/2)),  v = y / (z · tan(V/2))   im Bereich [−1, 1],   tan(H/2) = Seitenverhältnis · tan(V/2)
// Bedingungen an tan(V/2) =: T
//   1) T ≥ tan(fov/2)                                    Bildwinkel der Einstellung (Querformat)
//   2) T ≥ breite · tan(fov/2) · 16/9 / Seitenverhältnis  im Hochformat bleibt ein Teil der Querformat-Breite sichtbar
//   3) für jeden Körper (Mitte m, Radius r) mit Winkelradius α = asin(r/|m|):
//      T ≥ tan(atan(|y|/z) + α) · (1 + RAND)   und   T·Seitenverhältnis ≥ tan(atan(|x|/z) + α) · (1 + RAND)
// Ergebnis: senkrechter Bildwinkel V = 2·atan(T), begrenzt auf MAX_V.
import { minus, punkt, laenge } from '../mathe/vektor.js';

const RAND = 0.08, MAX_V = 110 * Math.PI / 180, QUER = 16 / 9;

/** basis: { rechts, oben, vorne } (Einheitsvektoren der Kamera). Liefert den senkrechten Bildwinkel in Grad. */
export function bildwinkel(auge, basis, fovGrad, breite, seitenverhaeltnis, koerper) {
	const t0 = Math.tan(fovGrad * Math.PI / 360);
	let T = Math.max(t0, (breite * t0 * QUER) / seitenverhaeltnis);
	for (const [m, r] of koerper) {
		const v = minus(m, auge), d = laenge(v), z = punkt(v, basis.vorne);
		if (z <= r || d <= r) continue;   // Kamera im/hinter dem Körper: nicht erzwingbar
		const a = Math.asin(r / d);
		const ty = Math.tan(Math.min(1.5, Math.atan(Math.abs(punkt(v, basis.oben)) / z) + a)) * (1 + RAND);
		const tx = Math.tan(Math.min(1.5, Math.atan(Math.abs(punkt(v, basis.rechts)) / z) + a)) * (1 + RAND);
		T = Math.max(T, ty, tx / seitenverhaeltnis);
	}
	return Math.min(2 * Math.atan(T), MAX_V) * 180 / Math.PI;
}
