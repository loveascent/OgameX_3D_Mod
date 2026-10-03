// Die Login-Karte: EIN Kasten mit zwei Reitern (Anmelden | Registrieren), darin die Originalformulare der Seite
// (#login und #subscribe werden nur umgesetzt, nicht nachgebaut – IDs, Felder und Skripte bleiben). Dazu DE | EN
// und ein Info-Knopf, der die Original-Reiter der Seite (Start, Über OGame, Medien, Wiki, Forum) ohne Trailer-Video zeigt.
import { t, sprache, setzeSprache, uebersetze, beobachte } from './sprache.js';

export function baueKarte() {
	const login = document.getElementById('login'), reg = document.getElementById('subscribe'), menue = document.getElementById('contentWrap');
	if (!login || !reg) return null;                      // fremde Seitenstruktur: nichts anfassen

	const karte = document.createElement('div');
	karte.id = 'login3d-karte';
	karte.innerHTML = `
		<div class="l3d-kopf">
			<div class="l3d-reiter" role="tablist">
				<button type="button" role="tab" data-seite="login" class="an" data-t="reiterLogin"></button>
				<button type="button" role="tab" data-seite="reg" data-t="reiterReg"></button>
			</div>
			<div class="l3d-sprache" title="Sprache / Language">
				<button type="button" data-s="de">DE</button><span>|</span><button type="button" data-s="en">EN</button>
			</div>
		</div>
		<div class="l3d-seite l3d-login"></div>
		<div class="l3d-seite l3d-reg" hidden></div>
		<div class="l3d-fuss"><button type="button" class="l3d-info-knopf" data-t="info"></button></div>`;
	karte.querySelector('.l3d-login').append(login);
	karte.querySelector('.l3d-reg').append(reg);
	document.body.append(karte);

	// Info-Tafel: die Originalreiter, ohne Trailer; öffnet über den Info-Knopf
	let tafel = null;
	if (menue) {
		tafel = document.createElement('div');
		tafel.id = 'login3d-info-tafel'; tafel.hidden = true;
		tafel.innerHTML = '<button type="button" class="l3d-zu" aria-label="Close">×</button>';
		tafel.append(menue);
		document.body.append(tafel);
		tafel.querySelector('.l3d-zu').addEventListener('click', () => { tafel.hidden = true; });
	} else karte.querySelector('.l3d-info-knopf').remove();

	const seiten = { login: karte.querySelector('.l3d-login'), reg: karte.querySelector('.l3d-reg') };
	karte.querySelectorAll('.l3d-reiter button').forEach((b) => b.addEventListener('click', () => {
		for (const [k, el] of Object.entries(seiten)) el.hidden = k !== b.dataset.seite;
		karte.querySelectorAll('.l3d-reiter button').forEach((x) => x.classList.toggle('an', x === b));
	}));
	karte.querySelector('.l3d-info-knopf')?.addEventListener('click', () => { tafel.hidden = !tafel.hidden; });

	const spracheAnwenden = () => {
		const s = sprache();
		document.documentElement.dataset.l3dSprache = s;
		karte.querySelectorAll('[data-t]').forEach((e) => { e.textContent = t(e.dataset.t, s); });
		karte.querySelectorAll('.l3d-sprache button').forEach((b) => b.classList.toggle('an', b.dataset.s === s));
		uebersetze(document.body, s);
	};
	karte.querySelectorAll('.l3d-sprache button').forEach((b) => b.addEventListener('click', () => { setzeSprache(b.dataset.s); spracheAnwenden(); document.dispatchEvent(new Event('login3d-sprache')); }));
	spracheAnwenden();
	beobachte(document.body);
	return karte;
}
