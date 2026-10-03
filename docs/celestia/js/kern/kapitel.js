// Die Zeitleiste: wann passiert was (p = Scroll-Fortschritt 0..1). Hier und nur hier einstellen.
export const K = {
	flug:       [0.03, 0.22],   // Kamerafahrt durch den Titel
	titelAus:   [0.10, 0.20],
	planetEin:  [0.13, 0.24],   // Gasriese erscheint
	planetGross:[0.13, 0.42],   // ...und waechst bis zur Vollansicht
	jaegerLaden: 0.25,          // GLB im Hintergrund vorladen
	jaeger:     [0.40, 0.57],   // Leichter Jaeger fliegt dem Betrachter entgegen
	sternLaden: 0.45,           // Todesstern-Szene im Hintergrund vorladen
	zurEcke:    [0.57, 0.63],   // Planet rueckt nach unten links (Anordnung der Todesstern-Szene)
	stern:      [0.58, 0.63],   // Todesstern blendet ein ...
	feuer:       0.65,          // ... und schiesst
	sternAus:   [0.76, 0.81],
	planetZurueck: [0.84, 0.90],// Planet wieder gross in die Mitte
	abschluss:  [0.88, 1.00],   // Schlusstafel mit Slogans und Link
};
