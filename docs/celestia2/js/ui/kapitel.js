// Baut die Kapitel als HTML (sofort beim Laden, ohne 3D) und zeigt jeweils eines.
// Alle Kapitel stehen im DOM (Suchmaschinen, Bildschirmleser, Seite ohne JavaScript-3D); sichtbar ist nur das aktive.
import { TEXTE } from '../inhalt/texte.js';

const el = (tag, klasse, text) => { const e = document.createElement(tag); if (klasse) e.className = klasse; if (text) e.textContent = text; return e; };

function verweis({ text, url }, klasse) {
	const a = el('a', klasse, text);
	a.href = url; a.target = '_blank'; a.rel = 'noopener';
	return a;
}

export function baueKapitel(wirt, ids) {
	const sektionen = ids.map((id, nr) => {
		const t = TEXTE[id] ?? { titel: id };
		const s = el('section', 'kapitel');
		s.id = id; s.setAttribute('aria-hidden', 'true');
		const kasten = el('div', id === 'start' ? 'spalte spalte-titel' : 'spalte');
		if (id === 'start') {
			kasten.append(el('h1', 'titel', t.titel), el('p', 'unter', t.unter));
			const ul = el('ul', 'leitsaetze');
			for (const z of t.leitsaetze) ul.append(el('li', '', z));
			kasten.append(ul);
		} else {
			kasten.append(el('p', 'marke', `${String(nr + 1).padStart(2, '0')} — ${t.marke ?? ''}`), el('h2', '', t.titel));
			for (const z of t.zeilen ?? []) kasten.append(el('p', '', z));
		}
		if (t.knopf) kasten.append(verweis(t.knopf, 'knopf'));
		if (t.links) { const p = el('p', 'verweise'); for (const l of t.links) p.append(verweis(l, 'verweis')); kasten.append(p); }
		s.append(kasten);
		wirt.append(s);
		return s;
	});
	return {
		zeige(i) {
			sektionen.forEach((s, k) => { const an = k === i; s.classList.toggle('aktiv', an); s.setAttribute('aria-hidden', String(!an)); s.inert = !an; });
		},
	};
}
