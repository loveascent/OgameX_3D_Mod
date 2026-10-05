// Schlusstafel: Titel, vier Slogans (nacheinander), Link zur Allianzseite.
import { bereich, glatt } from '../kern/zeitleiste.js';
import { ABSCHLUSS, ALLIANZ_URL } from './inhalt.js';

const PLANET_URL = new URL('../../planet/editor.html', import.meta.url);
const PLANETEN = ['Jupiter', 'Neptun', 'Saturn'];

export function erstelleAbschluss(wirt, { planetWechsel, planetAus } = {}) {
	const h = document.createElement('section'); h.className = 'abschluss'; h.setAttribute('aria-label', 'Allianz');
	h.innerHTML = `
		<h2>${ABSCHLUSS.titel}</h2><p class="sub">${ABSCHLUSS.sub}</p>
		<ul>${ABSCHLUSS.slogans.map((s) => `<li>${s}</li>`).join('')}</ul>
		<a class="cta" href="${ALLIANZ_URL}" target="_blank" rel="noopener">${ABSCHLUSS.knopf}</a>
		<div class="wahl"><span>Planet</span>${PLANETEN.map((n) => `<button type="button" data-v="${n}">${n}</button>`).join('')}</div>
		<button class="testen" type="button">3D Planeten testen</button>`;
	wirt.append(h);
	let aktuell = PLANETEN[0], fenster = null;
	h.querySelector('.testen').addEventListener('click', () => {
		if (!fenster) {
			fenster = document.createElement('div'); fenster.className = 'testfenster';
			fenster.innerHTML = '<button class="zu" type="button">Schließen</button><iframe title="3D Planeten testen"></iframe>';
			h.append(fenster);
			const fr = fenster.querySelector('iframe');
			fenster.querySelector('.zu').addEventListener('click', () => { fenster.style.display = 'none'; planetAus?.(false); });
			fr.src = PLANET_URL + '?quality=standard&seed=1';
			fr.addEventListener('load', () => { let n = 0; const w = setInterval(() => { const sel = fr.contentDocument?.getElementById('ctl-preset'); if (sel || ++n > 100) clearInterval(w); if (sel && sel.value !== aktuell) { sel.value = aktuell; sel.dispatchEvent(new Event('change', { bubbles: true })); } }, 150); }, { once: true });
		}
		fenster.style.display = 'block'; planetAus?.(true);
	});
	h.querySelectorAll('.wahl button').forEach((b) => b.addEventListener('click', () => {
		h.querySelectorAll('.wahl button').forEach((x) => x.classList.toggle('an', x === b)); aktuell = b.dataset.v; planetWechsel?.(b.dataset.v);
	}));
	h.querySelector('.wahl button')?.classList.add('an');
	const li = [...h.querySelectorAll('li')], teile = [h.querySelector('h2'), h.querySelector('.sub'), ...li, h.querySelector('.cta'), h.querySelector('.wahl'), h.querySelector('.testen')];
	return {
		lege(t) {
			h.style.visibility = t > 0.001 ? 'visible' : 'hidden';
			h.style.pointerEvents = t > 0.6 ? 'auto' : 'none';
			teile.forEach((e, i) => {
				const w = glatt(bereich(t, i * 0.09, i * 0.09 + 0.3));
				e.style.opacity = w.toFixed(3);
				e.style.transform = `translate3d(0,${((1 - w) * 22).toFixed(1)}px,0)`;
			});
		},
	};
}
