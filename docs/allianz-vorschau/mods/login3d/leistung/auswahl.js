// Grafik-Fenster beim Login (unten links): Design (altes/neues, das aktive farbig hinterlegt), Todesstern-Datei
// (Downloadgröße) und Planeten-Leistung (nur Grafikkarte). Gespeichert im Browser (localStorage). "auto" = erkannt und selbstgeregelt.
import { t, sprache } from '../ui/sprache.js';
import { leseDesign, setzeDesign } from '../ui/design.js';

const KEY = 'login3d.auswahl';

export function leseAuswahl() {
	try { return { planet: 'auto', glb: 'auto', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { planet: 'auto', glb: 'auto' }; }
}

function speichere(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* privat */ } }

/** profile/auswahl/info dürfen null sein (altes Design: nur die Design-Knöpfe). info: () => Text */
export function baueAuswahl(profile, auswahl, info) {
	const design = leseDesign();
	const kasten = document.createElement('div');
	kasten.id = 'login3d-auswahl';
	const stufen = (art, obj, wert) => [`<option value="auto"${wert === 'auto' ? ' selected' : ''} data-t="auto"></option>`]
		.concat(Object.entries(obj).map(([k, v]) => `<option value="${k}"${wert === k ? ' selected' : ''} data-t="${art}.${k}" data-fallback="${v.label}"></option>`)).join('');
	kasten.innerHTML = `
		<button type="button" id="login3d-auswahl-knopf" aria-expanded="false"><span aria-hidden="true">⚙</span> <span data-t="grafik"></span></button>
		<div id="login3d-auswahl-feld" hidden>
			<div class="l3d-design" role="group">
				<span class="l3d-etikett" data-t="design"></span>
				<button type="button" data-d="alt" class="${design === 'alt' ? 'an' : ''}" data-t="designAlt"></button>
				<button type="button" data-d="neu" class="${design === 'neu' ? 'an' : ''}" data-t="designNeu"></button>
			</div>
			${profile ? `
			<label><span data-t="todesstern"></span> <small data-t="download"></small>
				<select data-k="glb">${stufen('glb', profile.glb, auswahl.glb)}</select></label>
			<label><span data-t="planet"></span> <small data-t="nurGpu"></small>
				<select data-k="planet">${stufen('planet', profile.planet, auswahl.planet)}</select></label>
			<p id="login3d-info"></p>` : ''}
		</div>`;

	const beschriften = () => {
		const s = sprache();
		kasten.querySelectorAll('[data-t]').forEach((e) => {
			const tx = t(e.dataset.t, s);
			e.textContent = tx === e.dataset.t && e.dataset.fallback ? e.dataset.fallback : tx;
		});
		const p = kasten.querySelector('#login3d-info'); if (p && info) p.textContent = info();
	};
	beschriften();
	document.addEventListener('login3d-sprache', beschriften);

	const knopf = kasten.querySelector('#login3d-auswahl-knopf'), feld = kasten.querySelector('#login3d-auswahl-feld');
	knopf.addEventListener('click', () => { feld.hidden = !feld.hidden; knopf.setAttribute('aria-expanded', String(!feld.hidden)); });
	kasten.querySelectorAll('.l3d-design button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.d !== design) setzeDesign(b.dataset.d); }));
	kasten.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => {
		const a = leseAuswahl(); a[s.dataset.k] = s.value; speichere(a); location.reload();
	}));
	return kasten;
}
