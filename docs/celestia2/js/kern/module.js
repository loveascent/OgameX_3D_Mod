// Schalter für jedes Bauteil. Ein Bauteil, das aus ist, wird gar nicht geladen (kein Code, keine GPU-Arbeit).
//   ?aus=hitze,blitze      schaltet Bauteile ab (zum Fehlersuchen oder für schwache Geräte)
//   ?nur=planet            lädt nur die genannten (plus ihre Pflicht-Abhängigkeiten, siehe start.js)
// Die Liste der Bauteile steht in js/stueckliste.js.
const q = new URLSearchParams(location.search);
const aus = new Set((q.get('aus') ?? '').split(',').filter(Boolean));
const nur = q.get('nur') ? new Set(q.get('nur').split(',')) : null;

export const istAn = (name) => !aus.has(name) && (!nur || nur.has(name));
