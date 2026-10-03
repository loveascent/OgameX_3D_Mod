// Ebene 4: das "Planet generieren"-Fenster = der echte Planeteneditor (gleiche Datei wie der Gasriese, aber ohne
// ?einbettung -> mit allen Reglern). Er wird nur eingeblendet; nichts daran ist nachgebaut.
import { glatt, mix } from '../kern/zeitleiste.js';

const PLANET_URL = new URL('../../../allianz-vorschau/mods/_gemeinsam/planet/index.html', import.meta.url);

export function erstelleEditor(wirt, { titel }) {
	const huelle = document.createElement('section'); huelle.className = 'editor'; huelle.setAttribute('aria-label', 'Planeteneditor');
	huelle.innerHTML = `
		<div class="editor-fenster"><iframe class="editor-frame" title="Planeteneditor (Fluid Gas Planet)" tabindex="-1"></iframe></div>
		<button class="editor-knopf" type="button" hidden>Regler selbst ausprobieren</button>`;
	wirt.append(huelle);
	const rahmen = huelle.querySelector('.editor-frame'), knopf = huelle.querySelector('.editor-knopf');
	let geladen = false, interaktiv = false;

	knopf.addEventListener('click', () => {
		interaktiv = !interaktiv;
		huelle.classList.toggle('interaktiv', interaktiv);
		knopf.textContent = interaktiv ? 'Weiter scrollen' : 'Regler selbst ausprobieren';
	});

	function layout() {
		const b = Math.min(innerWidth * 0.92, 1320), h = Math.min(innerHeight * 0.66, b * 0.6);
		huelle.style.setProperty('--ew', Math.round(b) + 'px'); huelle.style.setProperty('--eh', Math.round(h) + 'px');
	}
	layout(); addEventListener('resize', layout);

	return {
		element: huelle,
		lade() {
			if (geladen) return; geladen = true;
			rahmen.src = PLANET_URL + '?' + new URLSearchParams({ vorlage: 'Heißer Jupiter', seed: 7 });
			// Im Voll-Editor greift ?vorlage nicht von selbst: Vorlage per Auswahlfeld setzen (gleiche Seite, gleicher Ursprung)
			rahmen.addEventListener('load', () => {
				let n = 0;
				const warte = setInterval(() => {
					const sel = rahmen.contentDocument?.getElementById('ctl-preset');
					if (sel || ++n > 100) clearInterval(warte);
					if (sel && sel.value !== 'Heißer Jupiter') { sel.value = 'Heißer Jupiter'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
				}, 150);
			}, { once: true });
		},
		/** ein: Einblenden 0..1, aus: Ausblenden 0..1 */
		lege({ ein, aus }) {
			const sichtbar = ein > 0.001 && aus < 0.999;
			huelle.style.visibility = sichtbar ? 'visible' : 'hidden';
			if (!sichtbar) { if (interaktiv) knopf.click(); return; }
			const e = glatt(ein), a = glatt(aus);
			huelle.style.opacity = (e * (1 - a)).toFixed(3);
			huelle.style.transform = `translate3d(0,${((1 - e) * 60 - a * 40).toFixed(1)}px,0) scale(${mix(0.9, 1, e) * mix(1, 0.96, a)})`;
			knopf.hidden = !(e > 0.95 && a < 0.02);
			if (a > 0.02 && interaktiv) knopf.click();
		},
	};
}
