// Alle Texte des Login-Mods in zwei Sprachen (de/en) – an EINER Stelle, damit nie halb Deutsch, halb Englisch erscheint.
// 1) MOD: eigene Texte (Grafik-Fenster, Reiter, Info).  2) SEITE: die englischen Original-Texte der OGameX-Loginseite -> Deutsch.
// Neue Sprache = ein weiterer Schlüssel neben "de"; Texte, die hier fehlen, bleiben im Original stehen.

export const MOD = {
	grafik: { de: 'Grafik', en: 'Graphics' },
	design: { de: 'Design', en: 'Design' },
	designAlt: { de: 'Altes Design', en: 'Old design' },
	designNeu: { de: 'Neues Design', en: 'New design' },
	todesstern: { de: 'Todesstern', en: 'Death Star' },
	download: { de: '(Download)', en: '(download)' },
	planet: { de: 'Planet', en: 'Planet' },
	nurGpu: { de: '(nur Grafikkarte)', en: '(GPU only)' },
	auto: { de: 'Automatisch', en: 'Automatic' },
	reiterLogin: { de: 'Anmelden', en: 'Log in' },
	reiterReg: { de: 'Registrieren', en: 'Register' },
	info: { de: 'Info', en: 'Info' },
	schliessen: { de: 'Schließen', en: 'Close' },
	sprache: { de: 'Sprache', en: 'Language' },
	// Stufen aus dem Admin-Profil (Schlüssel wie in config/standard.php)
	'planet.phone-low': { de: 'Smartphone niedrig', en: 'Smartphone low' },
	'planet.phone-high': { de: 'Smartphone hoch', en: 'Smartphone high' },
	'planet.laptop': { de: 'Laptop', en: 'Laptop' },
	'planet.gaming': { de: 'Gaming-Rechner', en: 'Gaming PC' },
	'glb.niedrig': { de: 'Niedrig (klein)', en: 'Low (small)' },
	'glb.mittel': { de: 'Mittel', en: 'Medium' },
	'glb.hoch': { de: 'Hoch (groß)', en: 'High (large)' },
	'klasse.handy': { de: 'Smartphone', en: 'Smartphone' },
	'klasse.laptop': { de: 'Laptop', en: 'Laptop' },
	'klasse.rechner': { de: 'Gaming-Rechner', en: 'Gaming PC' },
	webgpu: { de: 'WebGPU', en: 'WebGPU' },
	ohneWebgpu: { de: 'ohne WebGPU', en: 'no WebGPU' },
};

// Englischer Originaltext (Leerraum zusammengezogen) -> Deutsch. Regeln mit {n} stehen unter MUSTER.
export const SEITE = {
	de: {
		'Email address:': 'E-Mail-Adresse:',
		'Password:': 'Passwort:',
		'Universe:': 'Universum:',
		'Log in': 'Anmelden',
		'Forgot your password?': 'Passwort vergessen?',
		'Forgot your email address?': 'E-Mail-Adresse vergessen?',
		'With the login I accept the': 'Mit dem Login akzeptiere ich die',
		'T&Cs': 'AGB',
		'Privacy Policy': 'Datenschutzerklärung',
		'PLAY FOR FREE!': 'KOSTENLOS SPIELEN!',
		'Distinctions': 'Auszeichnungen',
		'Our': 'Es gelten unsere',
		'and': 'und',
		'apply in the game': 'im Spiel',
		'Register': 'Registrieren',
		'Legal': 'Rechtliches',
		'Contact': 'Kontakt',
		'Rules': 'Regeln',
		'Home': 'Start',
		'About OGame': 'Über OGame',
		'Media': 'Medien',
		'Board': 'Forum',
		'OGame - Conquer the universe': 'OGame – Erobere das Universum',
		'OGame is a strategy game set in space, with thousands of players from across the world competing at the same time. You only need a regular web browser to play.':
			'OGame ist ein Strategiespiel im Weltraum, in dem Tausende Spieler aus aller Welt gleichzeitig gegeneinander antreten. Du brauchst nur einen normalen Webbrowser.',
		'Your Internet Explorer version does not correspond to the existing standards and is not supported by this website anymore.': '',
	},
};
export const MUSTER = {
	de: [[/^(\d+)\. Universe$/, '$1. Universum']],
};
