// Leiste „Qualität“: Auto + die vier Stufen. Zeigt immer die tatsächlich laufende Stufe an.
import { STUFEN } from '../kern/qualitaet.js';

export function erstelleStufenwahl(wirt, qualitaet) {
	wirt.innerHTML = '<span class="leiste-titel">Qualität</span>';
	const knoepfe = [['auto', 'Auto'], ...Object.entries(STUFEN).map(([k, v]) => [k, v.name])].map(([k, text]) => {
		const b = document.createElement('button');
		b.type = 'button'; b.textContent = text; b.dataset.stufe = k;
		b.addEventListener('click', () => { qualitaet.waehle(k === 'auto' ? null : k); zeige(); });
		wirt.append(b);
		return b;
	});
	function zeige() {
		for (const b of knoepfe) {
			const k = b.dataset.stufe;
			b.setAttribute('aria-pressed', String(k === 'auto' ? qualitaet.auto : !qualitaet.auto && k === qualitaet.name));
			b.classList.toggle('laeuft', k === qualitaet.name);
		}
	}
	zeige();
	return { zeige };
}
