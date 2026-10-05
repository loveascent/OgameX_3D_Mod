// Dem Browser zwischen zwei Häppchen Arbeit Luft lassen (Eingaben, Bild), damit nichts hängt.
// scheduler.yield() ist der moderne Weg (Chrome 129+); sonst eine neue Aufgabe per setTimeout.
export const luft = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((r) => setTimeout(r, 0)));

/** Wartet, bis der Browser Leerlauf hat (oder höchstens ms) – für Arbeit, die nicht eilt (Nachladen besserer Modelle). */
export const leerlauf = (ms = 2000) => new Promise((r) => (globalThis.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: ms }) : setTimeout(r, 200)));
