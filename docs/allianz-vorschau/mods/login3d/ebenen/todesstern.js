// Ebene "Todesstern": GLB (Stufe niedrig/mittel/hoch) in einem iframe über das ganze Fenster.
// Ablauf: Seite lädt GLB -> meldet 'geladen' -> wir senden die Anordnung -> erstes Bild 'bereit' -> Schuss.
export function erstelleTodesstern(wirt, { stufe, profil, layout }) {
	const f = document.createElement('iframe');
	f.className = 'login3d-todesstern'; f.title = 'Todesstern'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
	let geladen, bereit;
	const pGeladen = new Promise((r) => { geladen = r; }), pBereit = new Promise((r) => { bereit = r; });
	const sende = (m) => f.contentWindow?.postMessage(m, location.origin);
	addEventListener('message', (e) => {
		if (e.origin !== location.origin || e.source !== f.contentWindow) return;
		const d = e.data || {};
		if (d.todesstern === 'geladen') { sende({ layout }); geladen(); }
		else if (d.todesstern === 'bereit') bereit();
	});
	f.src = '/OgameX_3D_Mod/allianz-vorschau/mods/login3d/todesstern/host.html?' + new URLSearchParams({ stufe, dpr: profil.dpr, fps: profil.fps });
	wirt.append(f);
	return {
		element: f, geladen: pGeladen, bereit: pBereit,
		feuer() { sende({ feuer: true }); },
		neueAnordnung(l) { sende({ layout: l }); },
		entferne() { f.remove(); },
	};
}
