// Die Welt als reine Daten: wo Station und Planet stehen und welche Basis daraus folgt.
// Wird einmal erstellt (und neu, wenn ein anderer Planet mit anderem Radius geladen wird).
//
//   S = (0,0,0)                         Station im Ursprung (genaueste Gleitkommazahlen dort, wo die Kamera meist ist)
//   P = S + ACHSE · (abstandRadien · R) Planetenmitte
//   a = ACHSE                           Blickachse Station → Planet
//   seite = norm(a × y),  oben = seite × a   (rechtshändige Basis, „oben“ ≈ Welt-y)
import { MASSE, SONNE, ACHSE } from './masse.js';
import { kreuz, norm, mal } from '../mathe/vektor.js';

export function erstelleWelt(planetRadiusKm, abplattung = 0) {
	const R = planetRadiusKm;
	const a = ACHSE.slice();
	const seite = norm(kreuz(a, [0, 1, 0]));
	const oben = kreuz(seite, a);
	return {
		R, f: abplattung,
		S: [0, 0, 0],
		P: mal(a, MASSE.abstandRadien * R),
		a, seite, oben,
		sonne: SONNE,
		stationRadius: MASSE.stationKm / 2,
	};
}
