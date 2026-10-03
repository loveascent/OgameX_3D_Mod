// Schlusstafel: Titel, vier Slogans (nacheinander), Link zur Allianzseite.
import { bereich, glatt } from '../kern/zeitleiste.js';
import { ABSCHLUSS, ALLIANZ_URL } from './inhalt.js';

export function erstelleAbschluss(wirt) {
	const h = document.createElement('section'); h.className = 'abschluss'; h.setAttribute('aria-label', 'Allianz');
	h.innerHTML = `
		<h2>${ABSCHLUSS.titel}</h2><p class="sub">${ABSCHLUSS.sub}</p>
		<ul>${ABSCHLUSS.slogans.map((s) => `<li>${s}</li>`).join('')}</ul>
		<a class="cta" href="${ALLIANZ_URL}" target="_blank" rel="noopener">${ABSCHLUSS.knopf}</a>`;
	wirt.append(h);
	const li = [...h.querySelectorAll('li')], teile = [h.querySelector('h2'), h.querySelector('.sub'), ...li, h.querySelector('.cta')];
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
