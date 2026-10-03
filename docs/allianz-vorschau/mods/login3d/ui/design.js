// Altes oder neues Design: gemerkt im Browser. "alt" = die Original-Loginseite von OGameX, nichts wird verändert;
// "neu" = Login 3D (Weltraum, Planet, Todesstern, schlanke Karte). Umschalten lädt die Seite neu.
const KEY = 'login3d.design';

export function leseDesign() {
	try { return localStorage.getItem(KEY) === 'alt' ? 'alt' : 'neu'; } catch { return 'neu'; }
}
export function setzeDesign(d) {
	try { localStorage.setItem(KEY, d); } catch { /* privat */ }
	location.reload();
}
