// Qualitätsstufen – einzige Quelle für alles, was Leistung kostet. Jedes Bauteil liest nur seinen Teil.
//   dpr      Pixel pro CSS-Pixel (höchstens die echte Bildschirmdichte)
//   planet   Geräteklasse des Gasplaneten-Simulators (Gitter, Farbauflösung)
//   modell   gewünschte Modellstufe des Todessterns (geladen wird sie nur, wenn die Leitung es hergibt)
//   blitz    Stützpunkte je Blitz · lichter: Punktlichter in der Station · bloom: Glanz an/aus · msaa: Kantenglättung
//   schatten Eigenschatten der Station (Kartengröße, 0 = aus)
export const STUFEN = {
	smartphone: { name: 'Smartphone', dpr: 1,    planet: 'phone',    modell: 'niedrig', blitz: 16, lichter: 2, bloom: false, msaa: 1, schatten: 0 },
	laptop:     { name: 'Laptop',     dpr: 1.25, planet: 'standard', modell: 'mittel',  blitz: 28, lichter: 4, bloom: true,  msaa: 1, schatten: 0 },
	desktop:    { name: 'Desktop',    dpr: 1.5,  planet: 'high',     modell: 'mittel',  blitz: 40, lichter: 4, bloom: true,  msaa: 4, schatten: 1024 },
	highend:    { name: 'High-End',   dpr: 2,    planet: 'ultra',    modell: 'hoch',    blitz: 64, lichter: 8, bloom: true,  msaa: 4, schatten: 2048 },
};
export const REIHE = Object.keys(STUFEN);
const SCHLUESSEL = 'celestia2-stufe';

// Automatik: gemessen wird die Bildrate (der Takt begrenzt auf 60 Bilder/s, also dt ≥ 16,7 ms).
//   Mittel über FENSTER s.  Schlechter als LANGSAM_MS  in 2 Fenstern  → eine Stufe tiefer.
//   Besser als FLUESSIG_MS in 4 Fenstern → eine Stufe höher – außer diese Stufe war schon einmal zu langsam (gelernt).
const FENSTER = 2, LANGSAM_MS = 26, FLUESSIG_MS = 17.6;

function vermuteStufe() {
	const handy = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
	return handy ? 'smartphone' : 'laptop';
}

export function erstelleQualitaet(beiWechsel) {
	const url = new URLSearchParams(location.search).get('stufe');
	let gemerkt = null;
	try { gemerkt = localStorage.getItem(SCHLUESSEL); } catch { /* Speicher gesperrt */ }
	let auto = !(STUFEN[url] || STUFEN[gemerkt]);
	let name = STUFEN[url] ? url : STUFEN[gemerkt] ? gemerkt : vermuteStufe();
	const zuLangsam = new Set();
	let summe = 0, n = 0, zeit = 0, schlecht = 0, gut = 0, ruhe = 4;   // ruhe: s ohne Bewertung (Laden, Umschalten)

	function setze(neu, grund) {
		if (neu === name || !STUFEN[neu]) return;
		const alt = name; name = neu; summe = n = zeit = schlecht = gut = 0; ruhe = 4;
		beiWechsel(STUFEN[neu], neu, alt, grund);
	}
	return {
		get name() { return name; }, get werte() { return STUFEN[name]; }, get auto() { return auto; },
		/** Wahl des Besuchers: fest, gemerkt. null = Automatik. */
		waehle(neu) {
			auto = neu === null;
			try { auto ? localStorage.removeItem(SCHLUESSEL) : localStorage.setItem(SCHLUESSEL, neu); } catch { /* gesperrt */ }
			if (!auto) setze(neu, 'wahl'); else beiWechsel(STUFEN[name], name, name, 'auto');
		},
		/** Nach Ladevorgängen kurz nicht bewerten (die messen sonst das Laden, nicht die Szene). */
		pause(s = 3) { ruhe = Math.max(ruhe, s); summe = n = zeit = 0; },
		messe(dt) {
			if (!auto) return;
			if (ruhe > 0) { ruhe -= dt; return; }
			summe += dt * 1000; n++; zeit += dt;
			if (zeit < FENSTER) return;
			const mittel = summe / n; summe = n = zeit = 0;
			const i = REIHE.indexOf(name);
			if (mittel > LANGSAM_MS) { gut = 0; if (++schlecht >= 2 && i > 0) { zuLangsam.add(name); setze(REIHE[i - 1], 'langsam'); } }
			else if (mittel < FLUESSIG_MS) { schlecht = 0; if (++gut >= 4 && i < REIHE.length - 1 && !zuLangsam.has(REIHE[i + 1])) setze(REIHE[i + 1], 'fluessig'); }
			else { schlecht = 0; gut = 0; }
		},
	};
}

export const pixeldichte = (werte) => Math.min(werte.dpr, Math.max(1, globalThis.devicePixelRatio || 1));
