// Selbstregelung: Ziel > 50 fps. Misst die echte Bildrate der Seite; liegt sie zweimal hintereinander darunter,
// geht der Planet eine Stufe tiefer (belastet nur die Grafikkarte, kein Download). Merkt sich die Stufe je Sitzung.
import { PLANET_STUFEN } from './profil.js';

export function starteRegler({ zielFps, aktuelleStufe, senken }) {
	let stufe = aktuelleStufe, schlecht = 0, fenster = [], letzt = 0, ruhe = performance.now() + 5000;   // 5 s Einschwingen ignorieren
	let laeuft = true;
	function bild(t) {
		if (!laeuft) return;
		requestAnimationFrame(bild);
		if (document.hidden) { letzt = 0; return; }
		if (letzt) fenster.push(t - letzt);
		letzt = t;
		if (t < ruhe || fenster.length < 90) return;
		fenster.sort((a, b) => a - b);
		const fps = 1000 / fenster[Math.floor(fenster.length * 0.5)];
		fenster = [];
		schlecht = fps < zielFps ? schlecht + 1 : 0;
		if (schlecht >= 2) {
			const i = PLANET_STUFEN.indexOf(stufe);
			if (i > 0) { stufe = PLANET_STUFEN[i - 1]; schlecht = 0; ruhe = t + 5000; senken(stufe, fps); }
		}
	}
	requestAnimationFrame(bild);
	return { stop() { laeuft = false; }, get stufe() { return stufe; } };
}
