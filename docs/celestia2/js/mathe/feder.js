// Kritisch gedämpfte Feder – schnellstes Annähern an ein Ziel ohne Überschwingen.
//
//   x'' = ω²·(ziel − x) − 2ω·x'        (Dämpfungsgrad ζ = 1)
//
// Exakte Lösung für einen Zeitschritt dt (konstantes Ziel), daher stabil bei jeder Bildrate und jedem Ruckler:
//   e = x − ziel,  j = (v + ω·e)·dt
//   x ← ziel + (e + j)·exp(−ω·dt)
//   v ← (v − ω·j)·exp(−ω·dt)
// Nach t = 4,74/ω sind 95 % des Wegs zurückgelegt.

export function feder(omega, start = 0) {
	let x = start, v = 0;
	return {
		get wert() { return x; },
		setze(w) { x = w; v = 0; },
		schritt(ziel, dt) {
			const e = x - ziel, j = (v + omega * e) * dt, k = Math.exp(-omega * dt);
			x = ziel + (e + j) * k; v = (v - omega * j) * k;
			return x;
		},
		set omega(w) { omega = w; },
	};
}

/** Dieselbe Feder komponentenweise für Vektoren [x, y, z]. */
export function federVektor(omega, start = [0, 0, 0]) {
	const f = start.map((s) => feder(omega, s));
	return {
		get wert() { return f.map((k) => k.wert); },
		setze(v) { f.forEach((k, i) => k.setze(v[i])); },
		schritt(ziel, dt) { return f.map((k, i) => k.schritt(ziel[i], dt)); },
		set omega(w) { for (const k of f) k.omega = w; },
	};
}
