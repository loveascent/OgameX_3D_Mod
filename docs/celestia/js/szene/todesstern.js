// Ebene 3: der fertige Todesstern aus der Login-Szene (allianz-vorschau/mods/login3d/todesstern/host.html), unveraendert
// per iframe. Layout-Werte wie im Login: Station oben rechts, Planet unten links. Schuss bei "feuer()".
const HOST = new URL('../../../allianz-vorschau/mods/login3d/todesstern/host.html', import.meta.url);
export const LAYOUT = { station: { x: 0.78, y: 0.24, breite: 0.30 }, planet: { x: 0.24, y: 0.70, radius: 0.21 } };

export function erstelleTodesstern(wirt) {
	const f = document.createElement('iframe'); f.className = 'stern'; f.title = 'Todesstern'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
	let geladen = false, bereit = false, hat = false;
	const sende = (m) => f.contentWindow?.postMessage(m, location.origin);
	addEventListener('message', (e) => {
		if (e.origin !== location.origin || e.source !== f.contentWindow) return;
		if (e.data?.todesstern === 'geladen') sende({ layout: LAYOUT });
		if (e.data?.todesstern === 'bereit') bereit = true;
	});
	addEventListener('resize', () => sende({ layout: LAYOUT }));
	wirt.append(f);
	let gefeuert = false;
	return {
		element: f,
		lade() { if (geladen) return; geladen = true; f.src = HOST + '?' + new URLSearchParams({ stufe: innerWidth < 700 ? 'niedrig' : 'mittel', dpr: 1.5, fps: 60 }); },
		/** a: Deckkraft 0..1; feuer: true sobald der Schuss fallen soll */
		lege(a, feuer) {
			f.style.opacity = a.toFixed(3); f.style.visibility = a < 0.003 ? 'hidden' : 'visible';
			if (feuer && bereit && !gefeuert) { gefeuert = true; sende({ feuer: true }); }
			if (a < 0.003) gefeuert = false;
		},
	};
}
