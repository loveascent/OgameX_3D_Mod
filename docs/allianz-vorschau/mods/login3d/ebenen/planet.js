// Ebene "Planet": der Fluid Gas Planet (Quelle des Urhebers, Einbettung: resources/gasplanet-v04/EINBETTUNG.md)
// in einem iframe, quadratisch um den Planeten gelegt (spart Grafikkartenarbeit). Seine Regler bleiben seine;
// die Leistungsstufe setzt nur Auflösungen (profil.planet[stufe]).
const SEITE = 2.6;          // Kantenlänge des Fensters in Planetenradien
const ABSTAND = 4.3;        // Kameraabstand in Radien (sein Standard)

/** fov so, dass die Planetenscheibe `rPx` Pixel Radius in einem Fenster der Kantenlänge `seitePx` hat. */
function fovFuer(rPx, seitePx) {
	const winkel = Math.asin(1 / ABSTAND);
	return 2 * Math.atan((seitePx / 2) * Math.tan(winkel) / rPx) * 180 / Math.PI;
}

export function erstellePlanet(wirt, { profil, layout, vorlage = 'Heißer Jupiter', seed = 7 }) {
	const f = document.createElement('iframe');
	f.className = 'login3d-planet'; f.title = 'Planet'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
	let bereit;
	const fertig = new Promise((r) => { bereit = r; });
	function setze() {
		const W = innerWidth, H = innerHeight;
		const rPx = layout.planet.radius * Math.min(W, H), seite = Math.round(rPx * SEITE);
		Object.assign(f.style, { width: seite + 'px', height: seite + 'px', left: Math.round(layout.planet.x * W - seite / 2) + 'px', top: Math.round(layout.planet.y * H - seite / 2) + 'px' });
		return { fov: fovFuer(rPx, seite) };
	}
	const { fov } = setze();
	const q = new URLSearchParams({
		einbettung: 1, vorlage, seed, fov: fov.toFixed(3), abstand: ABSTAND,
		quality: profil.quality, velRes: profil.velRes, dyeRes: profil.dyeRes, pixelDensity: profil.pixelDensity,
		einschwingen: profil.einschwingen, timeScale: profil.timeScale, autoQuality: profil.autoQuality,
	});
	f.src = '/OgameX_3D_Mod/allianz-vorschau/mods/_gemeinsam/planet/index.html?' + q;
	addEventListener('message', (e) => {
		if (e.origin === location.origin && e.source === f.contentWindow && e.data?.gasplanet === 'bereit') bereit();
	});
	// Größe/Lage bei Fensteränderung: Fenster neu legen; Bildwinkel ändert sich dabei nur über die Seitenlänge, die Scheibe bleibt
	// im Verhältnis (Seite = SEITE · Radius) – daher genügt neu positionieren.
	addEventListener('resize', setze);
	wirt.append(f);
	return { element: f, bereit: fertig, entferne() { f.remove(); } };
}
