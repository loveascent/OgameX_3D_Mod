// Ebene 2: der Gasriese = der Planeteneditor des Urhebers im Stand "current" (planet/editor.html, unveraendert, Apache-2.0
// siehe planet/LICENSE und NOTICE) -- mit seinen eigenen Werten fuer Tempo, Drehung und Hintergrund. Es wird nichts
// nachgerechnet: die Seite blendet nur die Bedienoberflaeche aus und skaliert das Fenster per CSS.
const PLANET_URL = new URL('../../planet/editor.html', import.meta.url);
// Anteil des Planetenradius an der Fensterkante des Editors in Vollansicht (aus der Anzeige gemessen)
const RADIUS_ANTEIL = 0.41;

const BLENDE_UI = `
	html, body, #app, #stage { background: transparent !important; }
	#app { grid-template-columns: 1fr !important; }
	#panel, #stage > *:not(#view) { display: none !important; }
	#view { cursor: default; pointer-events: none; }`;

export function erstellePlanet(wirt, { vorlage = 'Jupiter', seed = 1 } = {}) {
	const klein = Math.min(innerWidth, innerHeight) < 600;
	const f = document.createElement('iframe');
	f.className = 'planet-embed'; f.title = 'Gasriese'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
	const seite = Math.round(Math.min(innerHeight * 1.1, innerWidth * 0.95));
	f.style.width = f.style.height = seite + 'px';
	let bereit; const fertig = new Promise((r) => { bereit = r; });

	let aktuell = vorlage;
	function waehle(v) {
		aktuell = v;
		const sel = f.contentDocument?.getElementById('ctl-preset');
		if (sel && sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); }
	}
	f.addEventListener('load', () => {
		const d = f.contentDocument; if (!d) return;
		const st = d.createElement('style'); st.textContent = BLENDE_UI; d.head.append(st);
		let n = 0;
		const warte = setInterval(() => {
			const sel = d.getElementById('ctl-preset');
			if (sel || ++n > 100) { clearInterval(warte); waehle(aktuell); setTimeout(bereit, 1500); }
		}, 150);
	}, { once: true });
	f.src = PLANET_URL + '?' + new URLSearchParams({ quality: klein ? 'phone' : 'standard', seed });
	wirt.append(f);

	return {
		element: f, bereit: fertig, radius: seite * RADIUS_ANTEIL, seite, wechsle: waehle,
		/** cx/cy: Mitte auf dem Bildschirm (px), s: Massstab (1 = Vollansicht), a: Deckkraft */
		lege({ cx, cy, s, a, clip = 'none' }) {
			f.style.transform = `translate3d(${(cx - seite / 2).toFixed(1)}px,${(cy - seite / 2).toFixed(1)}px,0) scale(${Math.max(0.001, s).toFixed(4)})`;
			f.style.opacity = a.toFixed(3);
			f.style.visibility = a < 0.003 ? 'hidden' : 'visible';
			f.style.clipPath = clip;
		},
	};
}
