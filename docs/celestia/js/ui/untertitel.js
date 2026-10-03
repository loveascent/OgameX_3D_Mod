// Blendet die Erzaehlzeilen je nach Scroll-Fortschritt ein und aus.
import { fenster } from '../kern/zeitleiste.js';
import { UNTERTITEL } from './texte.js';

export function erstelleUntertitel(wirt) {
	const huelle = document.createElement('div'); huelle.className = 'untertitel'; wirt.append(huelle);
	const eintraege = UNTERTITEL.map((u) => {
		const e = document.createElement('p'); e.className = 'ut' + (u.oben ? ' oben' : '');
		e.innerHTML = u.zeilen.map((z, i) => `<span class="ut-z${i}">${z}</span>`).join('');
		huelle.append(e); return { ...u, e };
	});
	return {
		lege(p) {
			for (const u of eintraege) {
				const w = fenster(p, ...u.f);
				u.e.style.opacity = w.toFixed(3);
				u.e.style.transform = `translate3d(0,${((1 - w) * 24).toFixed(1)}px,0)`;
				u.e.style.filter = w > 0.99 || w < 0.01 ? 'none' : `blur(${((1 - w) * 6).toFixed(1)}px)`;
			}
		},
	};
}
