// Alle Pfade zu Dateien außerhalb von js/ an einem Ort. Verschiebt sich etwas, wird nur hier geändert.
const hier = (p) => new URL(p, import.meta.url).href;

export const PFADE = {
	/** Stationsmodelle (GLB) und Blitzdaten – liegen bei der Login-Szene, werden mitbenutzt statt kopiert (25 MB). */
	station: hier('../../allianz-vorschau/mods/login3d/todesstern/'),
	blitze: hier('../../allianz-vorschau/mods/login3d/todesstern/blitze.json'),
	/** KTX2-Transcoder (Basis Universal), gehört zu three.js */
	basis: hier('../fremd/three/basis/'),
};
