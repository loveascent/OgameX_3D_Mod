// Die einzige Bildschleife der Seite. Simulationszeit und Bildzeit sind getrennt:
//   dt  = echte Zeit seit dem letzten Bild (höchstens 0,1 s, damit ein Ruckler keinen Zeitsprung macht)
//   t   = Simulationszeit = Σ dt  (läuft nur, solange die Seite sichtbar ist)
// Höchstens 60 Bilder/s: Bildschirme mit 120/144 Hz würden sonst doppelte GPU-Arbeit verlangen, ohne sichtbaren Gewinn.
const MIN_MS = 1000 / 60 - 2;   // 2 ms Spiel, damit ein 60-Hz-Bildschirm kein Bild auslässt

export function erstelleTakt(schritt) {
	let alt = 0, t = 0, laeuft = false, id = 0;
	function bild(ms) {
		id = requestAnimationFrame(bild);
		if (alt && ms - alt < MIN_MS) return;
		const dt = alt ? Math.min(0.1, (ms - alt) / 1000) : 1 / 60;
		alt = ms; t += dt;
		schritt(dt, t);
	}
	const start = () => { if (laeuft) return; laeuft = true; alt = 0; id = requestAnimationFrame(bild); };
	const halt = () => { laeuft = false; cancelAnimationFrame(id); };
	document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(id); else if (laeuft) { alt = 0; id = requestAnimationFrame(bild); } });
	return { start, halt, get t() { return t; } };
}
