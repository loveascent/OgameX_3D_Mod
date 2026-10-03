// Leistungsstufen vom Server holen (Admin-Bereich: /admin/login3d). Ohne Antwort gelten diese Notfallwerte.
const NOTFALL = {
	planet: {
		'phone-low': { label: 'Smartphone niedrig', quality: 'phone', velRes: 64, dyeRes: 256, pixelDensity: 0.75, einschwingen: 400, timeScale: 0.25, autoQuality: 1, fps: 30 },
		'phone-high': { label: 'Smartphone hoch', quality: 'phone', velRes: 96, dyeRes: 384, pixelDensity: 1, einschwingen: 800, timeScale: 0.25, autoQuality: 1, fps: 60 },
		laptop: { label: 'Laptop', quality: 'standard', velRes: 128, dyeRes: 768, pixelDensity: 1.25, einschwingen: 1200, timeScale: 0.25, autoQuality: 1, fps: 60 },
		gaming: { label: 'Gaming-Rechner', quality: 'high', velRes: 192, dyeRes: 1024, pixelDensity: 1.75, einschwingen: 1800, timeScale: 0.25, autoQuality: 1, fps: 60 },
	},
	glb: {
		niedrig: { label: 'Niedrig (3,3 MB)', dpr: 1, fps: 60 },
		mittel: { label: 'Mittel (7,4 MB)', dpr: 1.5, fps: 60 },
		hoch: { label: 'Hoch (15,8 MB)', dpr: 2, fps: 60 },
	},
	ziel_fps: 50,
	auto: { handy: { planet: 'phone-high', glb: 'mittel' }, laptop: { planet: 'laptop', glb: 'mittel' }, rechner: { planet: 'gaming', glb: 'hoch' } },
	layout: { station: { x: 0.78, y: 0.24, breite: 0.30 }, planet: { x: 0.24, y: 0.70, radius: 0.21 } },
};

/** Reihenfolge der Planeten-Stufen von leicht nach schwer (für die Selbstregelung). */
export const PLANET_STUFEN = ['phone-low', 'phone-high', 'laptop', 'gaming'];

export async function ladeProfile() {
	try {
		const r = await fetch('/login3d/profile.json', { cache: 'no-cache' });
		if (r.ok) return await r.json();
	} catch { /* Notfallwerte */ }
	return NOTFALL;
}
