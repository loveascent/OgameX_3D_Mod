// Qualitätsstufen – einzige Quelle für alles, was Leistung kostet. Jedes Bauteil liest nur seinen Teil.
//   dpr      Pixel pro CSS-Pixel (höchstens die echte Bildschirmdichte)
//   planet   Geräteklasse des Gasplaneten-Simulators (Gitter, Farbauflösung)
//   modell   gewünschte Modellstufe des Todessterns (geladen wird sie nur, wenn die Leitung es hergibt)
//   blitz    Stützpunkte je Blitz · lichter: Punktlichter in der Station · bloom: Glanz · msaa: Kantenglättung
//   schatten Eigenschatten der Station (Kartengröße, 0 = aus)
//
// Grundsatz: Eine Stufe wird EINMAL beim Start gewählt (aus der Grafikkarte) – oder vom Besucher. Während man
// zuschaut, wird nie umgebaut: ein Stufenwechsel startet den Planeten neu und übersetzt Shader, das Bild stünde.
// Was die Automatik im Lauf regelt, ist nur die Auflösung (Faktor 0,6 … 1 auf dpr) – das kostet keinen Neuaufbau.
export const STUFEN = {
	smartphone: { name: 'Smartphone', dpr: 1,    planet: 'phone',    modell: 'niedrig', blitz: 16, lichter: 2, bloom: false, msaa: 1, schatten: 0 },
	laptop:     { name: 'Laptop',     dpr: 1.25, planet: 'standard', modell: 'mittel',  blitz: 28, lichter: 4, bloom: true,  msaa: 1, schatten: 0 },
	desktop:    { name: 'Desktop',    dpr: 1.5,  planet: 'high',     modell: 'mittel',  blitz: 40, lichter: 4, bloom: true,  msaa: 4, schatten: 1024 },
	highend:    { name: 'High-End',   dpr: 2,    planet: 'ultra',    modell: 'hoch',    blitz: 64, lichter: 8, bloom: true,  msaa: 4, schatten: 2048 },
};
export const REIHE = Object.keys(STUFEN);
const SCHLUESSEL = 'owners-stufe';

/** Startstufe aus der Grafikkarte (adapter.info). Eigene Grafikkarten der aktuellen Generationen → High-End. */
export function vermuteStufe(gpu) {
	const handy = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
	if (handy) return 'smartphone';
	const h = gpu?.hersteller ?? '', a = gpu?.architektur ?? '';
	if (h === 'nvidia' && /blackwell|lovelace|ada|ampere/.test(a)) return 'highend';
	if (h === 'nvidia' || (h === 'amd' && /rdna-[34]/.test(a))) return 'desktop';
	return 'laptop';   // iGPU, Apple, unbekannt
}

// Auflösungsregler: Bildzeit gleitend gemittelt (τ ≈ 1 s). Über ZIEL_MS → Faktor runter, deutlich darunter → rauf.
// Kleine Schritte (5 %) und Ruhezeit nach jeder Änderung, damit das Bild nicht pumpt.
const ZIEL_MS = 19, GUT_MS = 12;

export function erstelleQualitaet(beiWechsel) {
	const url = new URLSearchParams(location.search).get('stufe');
	let gemerkt = null;
	try { gemerkt = localStorage.getItem(SCHLUESSEL); } catch { /* Speicher gesperrt */ }
	let fest = STUFEN[url] ? url : STUFEN[gemerkt] ? gemerkt : null;
	let name = fest ?? 'laptop', faktor = 1, mittel = 16.7, ruhe = 3;

	return {
		get name() { return name; }, get werte() { return STUFEN[name]; }, get auto() { return !fest; }, get faktor() { return faktor; },
		/** Vor dem Laden des Planeten aufrufen: Stufe aus der Grafikkarte (wenn der Besucher nichts gewählt hat). */
		start(gpu) { if (!fest) name = vermuteStufe(gpu); return STUFEN[name]; },
		/** Wahl des Besuchers (null = Automatik). Nur hier wird umgebaut. */
		waehle(neu) {
			fest = neu;
			try { neu ? localStorage.setItem(SCHLUESSEL, neu) : localStorage.removeItem(SCHLUESSEL); } catch { /* gesperrt */ }
			const alt = name; name = neu ?? name; faktor = 1; ruhe = 4;
			if (name !== alt) beiWechsel(STUFEN[name], name, alt);
		},
		pause(s = 3) { ruhe = Math.max(ruhe, s); },
		/** Je Bild. Liefert true, wenn sich der Auflösungsfaktor geändert hat. */
		messe(dt) {
			if (ruhe > 0) { ruhe -= dt; return false; }
			mittel += (dt * 1000 - mittel) * Math.min(1, dt);
			let neu = faktor;
			if (mittel > ZIEL_MS) neu = Math.max(0.6, faktor - 0.05);
			else if (mittel < GUT_MS) neu = Math.min(1, faktor + 0.05);
			if (neu === faktor) return false;
			faktor = neu; ruhe = 1.5;
			return true;
		},
	};
}

export const pixeldichte = (werte, faktor = 1) => Math.max(0.5, Math.min(werte.dpr, Math.max(1, globalThis.devicePixelRatio || 1)) * faktor);
