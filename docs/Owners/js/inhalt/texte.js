// Alle sichtbaren Texte (Deutsch), je Kapitel. Die Kapitel-IDs gehören zu welt/kapitel.js (Kameraeinstellungen).
//   marke: kleine Kapitelzeile über dem Titel  ·  zeilen: Absätze  ·  knopf/links: Verweise
// Quellen der Fakten (Stand 08.10.2026): OGame-DE-Board „Neues Universum Celestia startet am 02.10.2026“,
// MMOFacts „OGame: Mega-Update zum 24-jährigen – Project Orion“.
export const ALLIANZ_URL = 'https://s284-de.ogame.gameforge.com/game/allianceInfo.php?allianceId=500167';

export const KOPF = { name: 'Owners', unter: 'OGame · Celestia · Uni 284' };

export const TEXTE = {
	start: {
		titel: 'Owners', unter: 'OGame · Celestia · Uni 284 · [Owned]',
		leitsaetze: ['Gemeinsam. Stärker. Siegreich.', 'Veteranen aus vielen Universen.', 'Let’s have some fun.'],
		knopf: { text: 'In Celestia bewerben', url: ALLIANZ_URL },
	},
	veteranen: {
		marke: 'Wer wir sind',
		titel: 'Alte Hasen, frischer Start.',
		zeilen: [
			'Owners ist eine Allianz aus OGame-Veteranen, die sich in verschiedenen Universen über den Weg gelaufen sind – und in Celestia noch einmal bei null anfangen.',
			'Wir kennen die Tricks, die Fallen und die besten Ausreden für „die Flotte war nur zum Spaß unterwegs“. Neu ist nur das Universum.',
		],
	},
	zusammen: {
		marke: 'Zusammenhalt',
		titel: 'Gemeinsam. Stärker.',
		zeilen: [
			'Wir fliegen nicht nebeneinander her, sondern miteinander: Saves werden abgesprochen, Warnungen geteilt, Ressourcen dorthin geschoben, wo sie gerade gebraucht werden.',
			'Wer einen von uns anfasst, bekommt es mit allen zu tun.',
		],
	},
	siegreich: {
		marke: 'Siegreich',
		titel: 'Siegreich – mit Plan.',
		zeilen: [
			'Celestia ist ein Fleeter-Universum: vierfache Flottengeschwindigkeit, fette Trümmerfelder. Hier gewinnt, wer Timing und Absprache beherrscht.',
			'Der Tag ist übrigens Programm: Wer sich mit uns anlegt, ist am Ende – nun ja – owned.',
		],
	},
	celestia: {
		marke: 'Das Universum',
		titel: 'Celestia – Uni 284.',
		zeilen: [
			'Gestartet am 2. Oktober 2026. Fünf Galaxien, kreisförmig angeordnet, Lebensformen von Anfang an. Wirtschaft ×8, Forschung ×16, Flotten ×4.',
			'30 Zusatzfelder pro Planet, 8 000 Dunkle Materie zum Start, nur 60 % Deuteriumverbrauch im Flug – und Trümmerfelder aus 80 % der Flotte, 30 % der Verteidigung und Deuterium.',
		],
	},
	jubilaeum: {
		marke: 'Jubiläum',
		titel: '24 Jahre OGame.',
		zeilen: [
			'Seit 2002 geht es durchs All – jetzt wird gefeiert: Die Anniversary Season läuft vom 2. bis 30. Oktober in allen Universen, mit Titeln, Avataren und Planetenskins, die es nur jetzt gibt.',
			'Dazu kommt Project Orion: über 25 neue Missionstypen, Wellenkämpfe gegen Anomalien und Teams aus bis zu fünf Kommandanten – ab 6. November in neuen Universen, ab 30. November überall.',
		],
	},
	spass: {
		marke: 'Mitmachen',
		titel: 'Let’s have some fun.',
		zeilen: [
			'Du bist OGame-Veteran – oder auf dem besten Weg dorthin? Dann komm an Bord. Kein Drama, dafür Humor und einen Plan.',
			'Im Spiel zerlegt übrigens nur ein Todesstern einen Mond. Hier machen wir daraus eine Show.',
		],
		knopf: { text: 'In Celestia bewerben', url: ALLIANZ_URL },
	},
};
