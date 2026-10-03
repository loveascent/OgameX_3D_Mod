// Ebene 2: der Gasriese. Eingebettet ist der Fluid Gas Planet (Quelle: elias-nero-tron, Apache-2.0, in der
// feinabgestimmten Fassung "Heisser Jupiter") als iframe im Einbettungsmodus. Die Kamera dort ist beim Laden fest,
// darum wird der Zoom per CSS-Transform gemacht: das Fenster ist in der groessten Darstellung scharf angelegt und
// wird nur verkleinert (nie hochskaliert), damit es bei jedem Massstab knackig bleibt.
const SEITE = 2.6;      // Fensterkante in Planetenradien (wie im Login-Mod)
const ABSTAND = 4.3;    // Kameraabstand in Radien

const PLANET_URL = new URL('../../../allianz-vorschau/mods/_gemeinsam/planet/index.html', import.meta.url);

const STUFEN = {
	handy: { quality: 'phone', velRes: 96, dyeRes: 384, pixelDensity: 1, einschwingen: 800, timeScale: 0.25, autoQuality: 1 },
	laptop: { quality: 'standard', velRes: 128, dyeRes: 768, pixelDensity: 1.25, einschwingen: 1200, timeScale: 0.25, autoQuality: 1 },
};

function fovFuer(rPx, seitePx) {
	const winkel = Math.asin(1 / ABSTAND);
	return (2 * Math.atan((seitePx / 2) * Math.tan(winkel) / rPx) * 180) / Math.PI;
}

export function erstellePlanet(wirt, { vorlage = 'Heißer Jupiter', seed = 7 } = {}) {
	const klein = Math.min(innerWidth, innerHeight) < 600;
	const stufe = klein ? STUFEN.handy : STUFEN.laptop;
	const f = document.createElement('iframe');
	f.className = 'planet-embed'; f.title = 'Gasriese'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
	let bereit; const fertig = new Promise((r) => { bereit = r; });

	// Planetenradius in der Vollansicht (Pixel); danach wird nur noch per Transform gearbeitet
	const R = Math.round(Math.min(innerWidth * 0.5, innerHeight * 0.95) * 0.5);
	const seite = Math.round(R * SEITE);
	f.style.width = f.style.height = seite + 'px';
	const q = new URLSearchParams({ einbettung: 1, vorlage, seed, fov: fovFuer(R, seite).toFixed(3), abstand: ABSTAND, ...stufe });
	const lade = (v) => { q.set('vorlage', v); f.src = PLANET_URL + '?' + q; };
	lade(vorlage);
	addEventListener('message', (e) => {
		if (e.origin === location.origin && e.source === f.contentWindow && e.data?.gasplanet === 'bereit') bereit();
	});
	wirt.append(f);

	return {
		element: f, bereit: fertig, radius: R, seite, wechsle: lade,
		/** cx/cy: Mitte auf dem Bildschirm (px), s: Massstab (1 = Vollansicht), a: Deckkraft, clip: optional CSS clip-path */
		lege({ cx, cy, s, a, clip = 'none' }) {
			f.style.transform = `translate3d(${(cx - seite / 2).toFixed(1)}px,${(cy - seite / 2).toFixed(1)}px,0) scale(${Math.max(0.001, s).toFixed(4)})`;
			f.style.opacity = a.toFixed(3);
			f.style.visibility = a < 0.003 ? 'hidden' : 'visible';
			f.style.clipPath = clip;
		},
	};
}
