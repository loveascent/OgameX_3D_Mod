// Sternfeld als echte 3D-Himmelskugel (TSL): Sterne sitzen FEST an Richtungen im Raum, nur die Kamera dreht sich (himmel.js).
// Würfelflächen-Raster: die Blickrichtung wird auf eine der 6 Würfelflächen projiziert, dort je Zelle höchstens ein Stern.
// Dünn gesät, meist blau, wenige weiße/orange helle Sterne mit Strahlenkranz (Eindruck der Homeworld-Sternatlanten, keine Bilddatei).
import { Fn, vec2, vec3, float, abs, max, step, floor, fract, hash, mix, smoothstep, pow, length, exp } from 'three/tsl';

// d: normalisierte Blickrichtung (Welt), zellen: Zellen je Würfelfläche-Einheit, dichte: Anteil belegter Zellen,
// pixel: Winkelgröße eines Bildpunkts (rad), hell: Gesamthelligkeit der Schicht
export const sternSchicht = Fn(([d, zellen, dichte, pixel, hell]) => {
	const a = abs(d);
	const m = max(a.x, max(a.y, a.z));
	const fx = step(a.y, a.x).mul(step(a.z, a.x));                       // X-Fläche?
	const fy = float(1).sub(fx).mul(step(a.x, a.y)).mul(step(a.z, a.y)); // Y-Fläche?
	const fz = float(1).sub(fx).sub(fy);                                  // sonst Z
	const u = fx.mul(d.y).add(fy.mul(d.x)).add(fz.mul(d.x)).div(m);
	const v = fx.mul(d.z).add(fy.mul(d.z)).add(fz.mul(d.y)).div(m);
	const vorz = step(0.0, fx.mul(d.x).add(fy.mul(d.y)).add(fz.mul(d.z)));
	const flaeche = fy.mul(2.0).add(fz.mul(4.0)).add(vorz);               // 0..5

	const g = vec2(u, v).mul(zellen);
	const id = floor(g);
	const f = fract(g).sub(0.5);
	const n = id.x.add(id.y.mul(157.31)).add(flaeche.mul(913.7));
	const r1 = hash(n), r2 = hash(n.add(11.7)), r3 = hash(n.add(23.9)), r4 = hash(n.add(37.3)), r5 = hash(n.add(51.1));
	const pos = vec2(r1, r2).sub(0.5).mul(0.6);
	const dist = length(f.sub(pos)).div(zellen);                          // in Flächeneinheiten
	const mass = float(1).add(u.mul(u)).add(v.mul(v));                    // Verzerrung der Fläche zum Rand hin
	const winkel = dist.div(mass);                                        // ≈ Winkelabstand (rad)

	const da = step(r3, dichte);                                          // Zelle belegt?
	const helle = pow(r4, 9.0);                                           // fast alle schwach, wenige hell
	const radius = pixel.mul(0.9).add(helle.mul(pixel).mul(1.6));
	const kern = exp(winkel.mul(winkel).div(radius.mul(radius)).negate());
	// Strahlenkranz zum Zellrand hin ausblenden: sonst schneidet die Zellgrenze ihn eckig ab
	const halbe = float(0.5).div(zellen).div(mass);
	const fenster = float(1).sub(smoothstep(halbe.mul(0.30), halbe.mul(0.95), winkel));
	const kranz = exp(winkel.div(radius.mul(3.0)).negate()).mul(helle).mul(0.10).mul(fenster);
	// Farbe: ~55 % blau, ~25 % weiß, ~20 % orange (am Sternatlas gemessen: blau-dominant)
	const blau = vec3(0.34, 0.50, 1.0), weiss = vec3(1.0, 0.95, 0.88), orange = vec3(1.0, 0.62, 0.36);
	const farbe = mix(mix(blau, weiss, step(0.55, r5)), orange, step(0.80, r5));
	return farbe.mul(kern.add(kranz)).mul(da).mul(helle.mul(2.6).add(0.10)).mul(hell);
});
