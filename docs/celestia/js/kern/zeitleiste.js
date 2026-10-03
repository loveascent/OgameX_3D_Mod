// Kleine Mathe-Helfer fuer die Scroll-Zeitleiste. Alles auf 0..1 (p = Scroll-Fortschritt).
export const klemme = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const mix = (a, b, t) => a + (b - a) * t;
/** Anteil von p im Fenster [a, b], auf 0..1 geklemmt. */
export const bereich = (p, a, b) => klemme((p - a) / (b - a));
export const glatt = (t) => t * t * (3 - 2 * t);
export const sanft = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const ausgebremst = (t) => 1 - Math.pow(1 - t, 3);
/** Ein- und Ausblenden: steigt in [a,b], faellt in [c,d]. */
export const fenster = (p, a, b, c, d) => glatt(bereich(p, a, b)) * (1 - glatt(bereich(p, c, d)));
