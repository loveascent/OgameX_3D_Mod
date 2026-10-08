// Die einzige Bildschleife der Seite. Simulationszeit und Bildzeit sind getrennt:
//   dt  = echte Zeit seit dem letzten Bild (höchstens 0,1 s, damit ein Ruckler keinen Zeitsprung macht)
//   t   = Simulationszeit = Σ dt  (läuft nur, solange die Seite sichtbar ist)
// Gezeichnet wird in JEDEM Bild des Bildschirms (requestAnimationFrame). Keine eigene Obergrenze: eine Grenze
// von 60/s ergibt auf 144-Hz-Bildschirmen jedes 3. Bild = 48/s mit ungleichen Abständen – sichtbares Ruckeln.
// Last regelt kern/qualitaet.js über die Auflösung, nicht über ausgelassene Bilder.
export function erstelleTakt(schritt) {
	let alt = 0, t = 0, laeuft = false, id = 0;
	function bild(ms) {
		id = requestAnimationFrame(bild);
		const dt = alt ? Math.min(0.1, (ms - alt) / 1000) : 1 / 60;
		alt = ms; t += dt;
		schritt(dt, t);
	}
	const start = () => { if (laeuft) return; laeuft = true; alt = 0; id = requestAnimationFrame(bild); };
	const halt = () => { laeuft = false; cancelAnimationFrame(id); };
	document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(id); else if (laeuft) { alt = 0; id = requestAnimationFrame(bild); } });
	return { start, halt, get t() { return t; } };
}
