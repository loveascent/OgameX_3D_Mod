// Der lebende Himmel als Seitenhintergrund – EIN Code für Login und Spiel.
// Lauf: Himmel (himmel.js) in eine feste Leinwand hinter der Seite, Bildrate begrenzt, pausiert im verborgenen Tab.
// Stetigkeit über Seitenwechsel: die Kameradrehung ist eine Funktion der ABSOLUTEN Uhrzeit (kein Neustart bei null);
// dazu ein kleines Standbild (stand.js), das die nächste Seite sofort zeigt, bis der Live-Himmel da ist.
import { erstelleHimmel } from './himmel.js';
import { speichereStand } from './stand.js';

const jetzt = () => Date.now() / 1000;

/**
 * @param {HTMLCanvasElement} leinwand
 * @param {{fps?: number, qualitaet?: 'niedrig'|'mittel'|'hoch', pixeldichte?: number, speichern?: boolean}} opt
 */
export async function starteHintergrund(leinwand, { fps = 30, qualitaet = 'mittel', pixeldichte = 1, speichern = true } = {}) {
	const himmel = await erstelleHimmel(leinwand, { qualitaet, pixeldichte });
	const intervall = 1000 / fps;
	let letzte = 0, laeuft = true, anzahl = 0, zuletztGespeichert = 0;
	const bild = (t) => {
		himmel.zeichne(jetzt());
		anzahl++;
		// Standbild: nach dem 3. Bild (Inhalt sicher da), danach alle 3 s – im selben Arbeitsgang wie das Zeichnen
		if (speichern && anzahl >= 3 && t - zuletztGespeichert > 3000) { zuletztGespeichert = t; speichereStand(leinwand, jetzt()); }
	};

	addEventListener('resize', himmel.groesse);
	(function schleife(t) {
		if (!laeuft) return;
		requestAnimationFrame(schleife);
		if (document.hidden || t - letzte < intervall) return;
		letzte = t;
		bild(t);
	})(performance.now());
	bild(performance.now());
	console.info(`[himmel] ${himmel.backend}, ${qualitaet}, ${fps} fps`);
	return {
		backend: himmel.backend,
		einBild: () => { bild(performance.now()); },
		stop() { laeuft = false; removeEventListener('resize', himmel.groesse); himmel.stop(); },
	};
}

/** Feste Vollbild-Leinwand hinter der Seite anlegen (Spiel). Gibt die Leinwand zurück; Klicks gehen hindurch. */
export function legeHintergrundLeinwandAn() {
	const c = document.createElement('canvas');
	c.id = 'ogx-himmel-leinwand';
	c.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;opacity:0;transition:opacity .5s ease';
	document.body.prepend(c);
	return c;
}
