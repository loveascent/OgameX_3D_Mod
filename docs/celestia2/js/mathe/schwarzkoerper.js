// Farbe eines Schwarzen Körpers der Temperatur T (Kelvin) als lineares RGB (0…1), Weiß bei ~6500 K.
// Näherung der Planck-Kurve, gefaltet mit den sRGB-Farbanpassungsfunktionen (T. Helland, gültig 1000–40 000 K).
// Helligkeit getrennt nach Stefan-Boltzmann: Strahlungsleistung ∝ T⁴.
export function schwarzkoerper(T) {
	const t = Math.max(1000, Math.min(40000, T)) / 100;
	const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
	const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
	const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
	const lin = (c) => { const x = Math.max(0, Math.min(255, c)) / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
	return [lin(r), lin(g), lin(b)];
}

/** relative Strahlungsleistung gegenüber T₀ (Stefan-Boltzmann) */
export const leistungT = (T, T0 = 6000) => (T / T0) ** 4;
