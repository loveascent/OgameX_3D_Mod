// Alle sichtbaren Texte (Deutsch), je Kapitel. Die Kapitel-IDs gehören zu welt/kapitel.js (Kameraeinstellungen).
//   lage: wo der Text steht ('mitte' | 'links' | 'rechts' | 'oben') – so wählen, dass er die Körper der Einstellung nicht verdeckt  ·  zeilen: Absätze  ·  knopf/links: Verweise
export const ALLIANZ_URL = 'https://s284-de.ogame.gameforge.com/game/allianceInfo.php?allianceId=500192';
export const MOD_URL = 'https://github.com/loveascent/OgameX_3D_Mod';

export const KOPF = { name: 'World of Celestia', unter: 'OGame · Universum 284 (DE)' };

export const TEXTE = {
	start: {
		lage: 'mitte', titel: 'World of Celestia', unter: 'OGame · Universum 284 (DE)',
		leitsaetze: ['Aktivität vor Highscore.', 'Wir schützen uns – immer.', 'Offen, respektvoll, gemeinsam.', 'Dein Platz ist frei.'],
		knopf: { text: 'Allianz ansehen & bewerben', url: ALLIANZ_URL },
	},
	aktiv: {
		lage: 'links', titel: 'Aktivität vor Highscore.',
		zeilen: [
			'Wer regelmäßig reinschaut, zählt bei uns mehr als wer oben in der Liste steht.',
			'Kein Punktezwang, keine Pflichtzeiten. Sag Bescheid, wenn du ein paar Tage weg bist – dann passen wir auf deine Planeten mit auf.',
		],
	},
	schutz: {
		lage: 'rechts', titel: 'Wir schützen uns – immer.',
		zeilen: [
			'Saveflüge, Mondbau, Warnungen bei anfliegenden Flotten: Wir erklären es, bis es sitzt.',
			'Wird einer von uns angegriffen, schauen alle hin. Wer einen trifft, trifft die ganze Allianz.',
		],
	},
	feuer: {
		lage: 'oben', titel: 'Und wenn es sein muss …',
		zeilen: [
			'… antworten wir gemeinsam. Spionage, Planung, Verbandsangriff – abgesprochen statt auf eigene Faust.',
			'Der Strahl hier ist echt gerechnet: gerade aus der Waffenachse, mit Lichtgeschwindigkeit unterwegs, 1,55 Sekunden bis zum Planeten.',
		],
	},
	gemeinsam: {
		lage: 'rechts', titel: 'Offen, respektvoll, gemeinsam.',
		zeilen: [
			'Neu in OGame oder seit Jahren dabei – Fragen sind willkommen, niemand wird von oben herab behandelt.',
			'Entscheidungen fallen im Gespräch, nicht im Alleingang.',
		],
	},
	projekte: {
		lage: 'links', titel: 'Was wir nebenbei bauen',
		zeilen: [
			'Gasriese in Echtzeit: Der Planet auf dieser Seite ist eine Strömungssimulation auf der Grafikkarte – Jets, Stürme und Wirbel rechnen live, auch die Spuren der Treffer.',
			'OgameX 3D-Mod: eigene Bilder oder 3D-Modelle für jedes Schiff und Gebäude in OgameX, ohne den Spielcode anzufassen.',
		],
		links: [{ text: '3D-Mod auf GitHub', url: MOD_URL }],
	},
	bewerben: {
		lage: 'mitte', titel: 'Dein Platz ist frei.',
		zeilen: ['Bewerben geht direkt im Spiel: Allianz öffnen, „Bewerben“, ein paar Worte zu dir. Wir melden uns.'],
		knopf: { text: 'Allianz ansehen & bewerben', url: ALLIANZ_URL },
	},
};
