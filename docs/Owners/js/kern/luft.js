// Dem Browser zwischen zwei Häppchen Arbeit Luft lassen (Eingaben, Bild), damit nichts hängt.
// scheduler.yield() ist der moderne Weg (Chrome 129+); sonst eine neue Aufgabe per setTimeout.
export const luft = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((r) => setTimeout(r, 0)));

/** Wartet, bis ein Bild gezeichnet wurde (und danach eine neue Aufgabe läuft). scheduler.yield() reicht dafür nicht: seine Fortsetzung läuft
 *  oft VOR dem nächsten Bild – eine Schleife aus Hauptstrang-Arbeit hielt so die Bilder über eine Sekunde an. Rückfall nach 100 ms (Tab im Hintergrund). */
export const naechstesBild = () => new Promise((r) => {
	const weiter = () => { clearTimeout(w); setTimeout(r, 0); };
	const w = setTimeout(r, 100);
	requestAnimationFrame(weiter);
});

/** Wartet, bis die Bildfolge ruhig läuft: `anzahl` Bilder hintereinander mit Abstand unter `grenze` ms (höchstens `maxMs`).
 *  Neue GPU-Arbeit (Texturen, Shader) beginnt erst dann – so trifft sie nicht auf eine Grafikkarte, die gerade Shader übersetzt, und der Hauptstrang bleibt frei. */
export const bildruhe = (anzahl = 20, grenze = 40, maxMs = 8000) => new Promise((fertig) => {
	const ende = performance.now() + maxMs;
	let letzte = performance.now(), gut = 0;
	const f = (t) => { gut = t - letzte < grenze ? gut + 1 : 0; letzte = t; if (gut >= anzahl || t > ende) fertig(); else requestAnimationFrame(f); };
	requestAnimationFrame(f);
});

/** Wartet, bis der Browser Leerlauf hat (oder höchstens ms) – für Arbeit, die nicht eilt (Nachladen besserer Modelle). */
export const leerlauf = (ms = 2000) => new Promise((r) => (globalThis.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: ms }) : setTimeout(r, 200)));
