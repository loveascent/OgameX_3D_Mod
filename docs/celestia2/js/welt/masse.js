// Maße und feste Größen der Welt. Einheit: Kilometer, Sekunde. Achsen: y = oben (wie three.js).
// Alles, was „wie groß“ oder „wie weit“ ist, steht hier und nur hier.

export const MASSE = {
	/** Durchmesser der Station (km). Größenordnung der bekannten Kampfstationen der Science-Fiction (120–160 km). */
	stationKm: 160,
	/** Bühnenmaßstab (wie im Film): Planetenradius 4 000 km statt 71 492 km, Abstand 3,2 R. In echten Maßen wäre
	 *  Jupiter 900-mal größer als die Station – beide zusammen groß im Bild gäbe es dann nie. Gestaucht werden nur
	 *  diese zwei Größen; Winkel, Wege, Treffer und Licht werden in dieser Welt weiter exakt gerechnet.
	 *  Der Simulator rechnet in Planetenradien und ist vom Maßstab unabhängig. */
	planetRadius: 4000,
	abstandRadien: 3.2,
	/** Lichtgeschwindigkeit (km/s). Der Strahl ist Licht: seine Front braucht für 465 000 km ≈ 1,55 s. */
	c: 299792.458,
};

/** Richtung zur Sonne (Welt, Einheitsvektor). Seitenlicht von rechts oben hinten: Planet zeigt eine Tag-/Nachtgrenze,
 *  Station und Planet haben dieselbe Sonne (eine Welt, ein Licht). */
export const SONNE = norm3([0.85, 0.35, 0.4]);

/** Richtung Station → Planet (Welt). Leicht nach unten links, damit die Kamera hinter der Station nicht in die Sonne blickt. */
export const ACHSE = norm3([-0.32, -0.08, -1]);

function norm3(v) { const l = Math.hypot(...v); return v.map((k) => k / l); }
