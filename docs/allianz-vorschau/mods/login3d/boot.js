// Login 3D – Einstieg. Je Funktion eine Datei (siehe README.md):
//   leistung/  Profile vom Server, Geräteerkennung, Grafik-Fenster beim Login, Selbstregelung (> 50 fps)
//   ebenen/    original (Titelbild) · weltraum (himmel/, WebGPU-Shader) · planet (Fluid Gas Planet) · todesstern (GLB + Schuss)
//   ui/        Karte (Reiter Anmelden/Registrieren, Info), Sprache DE|EN, Design alt|neu
// Altes Design: die Original-Loginseite bleibt unberührt, nur das Grafik-Fenster ist da.
// Neues Design: Originalbild sofort -> GLB laedt -> Weltraum startet -> Planet und Todesstern blenden darueber -> Schuss.
import { ladeProfile, PLANET_STUFEN } from './leistung/profil.js';
import { erkenneGeraet } from './leistung/erkennen.js';
import { leseAuswahl, baueAuswahl } from './leistung/auswahl.js';
import { starteRegler } from './leistung/regler.js';
import { zeigeOriginal } from './ebenen/original.js';
import { starteWeltraum } from './ebenen/weltraum.js';
import { erstellePlanet } from './ebenen/planet.js';
import { erstelleTodesstern } from './ebenen/todesstern.js';
import { baueKarte } from './ui/karte.js';
import { leseDesign } from './ui/design.js';
import { t, sprache } from './ui/sprache.js';

if (leseDesign() === 'alt') document.body.append(baueAuswahl(null, leseAuswahl(), null));
else await neuesDesign();

async function neuesDesign() {
	const wirt = document.createElement('div');
	wirt.id = 'login3d';
	document.body.prepend(wirt);
	document.body.classList.add('login3d');
	const original = zeigeOriginal(wirt);
	baueKarte();

	const [profile, geraet] = await Promise.all([ladeProfile(), erkenneGeraet()]);
	const auswahl = leseAuswahl();
	const auto = profile.auto[geraet.klasse] || profile.auto.laptop;
	let planetStufe = auswahl.planet !== 'auto' && profile.planet[auswahl.planet] ? auswahl.planet : auto.planet;
	const glbStufe = auswahl.glb !== 'auto' && profile.glb[auswahl.glb] ? auswahl.glb : auto.glb;
	try { const s = sessionStorage.getItem('login3d.planetStufe'); if (s && auswahl.planet === 'auto' && PLANET_STUFEN.indexOf(s) < PLANET_STUFEN.indexOf(planetStufe)) planetStufe = s; } catch { /* privat */ }

	const info = () => [t('klasse.' + geraet.klasse), geraet.webgpu ? t('webgpu') : t('ohneWebgpu'),
		`${t('planet')}: ${t('planet.' + planetStufe)}`, `${t('todesstern')}: ${t('glb.' + glbStufe)}`].join(' · ');
	document.body.append(baueAuswahl(profile, auswahl, info));
	if (!geraet.webgpu) { console.info('Login3D: kein WebGPU – Originalbild bleibt.'); return; }

	// Ebenen anlegen: Weltraum (Leinwand) startet erst, wenn der Todesstern geladen ist
	const himmel = document.createElement('canvas'); himmel.className = 'login3d-weltraum'; wirt.append(himmel);
	const planet = erstellePlanet(wirt, { profil: profile.planet[planetStufe], layout: profile.layout });
	const stern = erstelleTodesstern(wirt, { stufe: glbStufe, profil: profile.glb[glbStufe], layout: profile.layout });
	document.body.classList.add('login3d-laedt');

	await stern.geladen;
	window.login3dWeltraum = await starteWeltraum(himmel, {
		fps: geraet.klasse === 'handy' ? 24 : 30,
		qualitaet: { handy: 'niedrig', laptop: 'mittel', rechner: 'hoch' }[geraet.klasse] ?? 'mittel',
	});
	himmel.classList.add('an');

	await stern.bereit;
	stern.element.classList.add('an');
	// Das Originalbild geht erst, wenn Todesstern und Planet wirklich bereit sind (keine Frist)
	await planet.bereit;
	planet.element.classList.add('an');
	original.blendeAus(0.6);
	document.body.classList.remove('login3d-laedt');
	stern.feuer();                                  // sofort auf den Planeten

	addEventListener('resize', () => stern.neueAnordnung(profile.layout));
	starteRegler({
		zielFps: profile.ziel_fps, aktuelleStufe: planetStufe,
		senken(stufe, fps) {
			console.info(`Login3D: ${fps.toFixed(0)} fps < ${profile.ziel_fps} -> Planet ${stufe}`);
			try { sessionStorage.setItem('login3d.planetStufe', stufe); } catch { /* privat */ }
			planet.entferne();
			Object.assign(planet, erstellePlanet(wirt, { profil: profile.planet[stufe], layout: profile.layout }));
			planet.element.classList.add('an');
		},
	});
}
