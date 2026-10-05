// Wie schnell ist die Leitung? Gemessen an echten Downloads der Seite (nicht geraten):
//   Durchsatz = Bytes / Sekunden  (gleitender Mittelwert über alle gemessenen Downloads)
// Dazu die Hinweise des Browsers: „Datensparmodus“ (saveData) und effectiveType (2g/3g) bremsen immer.
// Entscheidung „lohnt sich das Nachladen?“:  Dauer = Größe / Durchsatz  ≤  GEDULD
const GEDULD_S = 25;   // länger darf ein Nachladen im Hintergrund nicht dauern
let bytes = 0, sekunden = 0;

export function messe(b, s) { if (b > 0 && s > 0.05) { bytes += b; sekunden += s; } }
export const durchsatz = () => (sekunden > 0 ? bytes / sekunden : null);   // Bytes/s oder null (noch nichts gemessen)

export function lohntSich(groesseBytes) {
	const c = navigator.connection;
	if (c?.saveData || /(^|-)2g|3g/.test(c?.effectiveType ?? '')) return false;
	const d = durchsatz();
	return d !== null && groesseBytes / d <= GEDULD_S;
}
