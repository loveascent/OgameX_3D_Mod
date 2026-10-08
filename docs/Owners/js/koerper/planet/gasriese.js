// Anbindung an den Gasplaneten-Simulator (fremd/gasplanet-kern.js, gebaut von werkzeug/gasplanet/bauen.mjs).
// Der Simulator bleibt unverändert. Diese Unterklasse stellt nur von außen ein, was eine Welt braucht:
//   - Zeichenziel: eigene Textur statt Leinwand (targetView)
//   - Kamera:      die Weltkamera statt der Umlaufkamera des Editors (writeRender: invViewProj, Auge, Pixelwinkel)
//   - Sonne:       die Sonne der Welt (welt/masse.js), damit Planet und Station von derselben Seite beleuchtet sind
//   - Himmel:      Schlüssel der Milchstraße (HIMMEL). Der Simulator würfelt die Lage des Bandes aus dem Text „Seed + Vorlage“ (hier „1Jupiter“);
//                  damit lag das Band 60° neben der Startansicht und war unsichtbar. Ein anderer Text legt es durchs Bild (Probe: himmel.mjs, ?himmel=…).
//   - Oberfläche:  Editor-Menü, Maus, Verlauf gibt es hier nicht (leere Methoden)
//
// Koordinaten: Der Simulator rechnet in Planetenradien um die Planetenmitte, Achsen wie die Welt.
//   Auge_sim = (Auge_welt − P) / R
//   invViewProj_sim = Kamera_welt(Translation = Auge_sim) · Projektion⁻¹   (gleicher Bildwinkel, gleiches Seitenverhältnis)
// Damit trifft jeder Bildpunkt des Simulators genau dieselbe Stelle wie der Bildpunkt von three.js.
//
// Belegung des Render-Uniforms (Floats), aus writeRender des Simulators abgelesen:
//   0–15 invViewProj · 16–19 Auge · 20–31 Zeilen Welt→Körper · 32–35 Sonne · 40 Abplattung · 57 Pixelwinkel
/** Würfelschlüssel des Sternenhimmels: Band der Milchstraße liegt bei diesem Text in allen Kapiteln nahe der Blickrichtung (≤ 10° neben der Bildmitte; Ausnahme „zusammen“) */
const HIMMEL = 'owners303';
/** Stärke des Bandes: breiter (1,6) und heller (1,3) als die Simulator-Vorgabe (width 1, bright 0,85) – so liegt es sichtbar hinter Station und Planet. Proben per URL: ?breit=…&hell=… */
const HIMMEL_WERTE = { width: 1.6, core: 1, dust: 1, hii: 1, bright: 1.3, hue: 0.5 };
const U = { inv: 0, auge: 16, koerper: 20, sonne: 32, pxWinkel: 57 };

/** Der Simulator liest beim Import einige Seitenelemente (id view, status, …). Sie werden unsichtbar bereitgestellt. */
function stummel() {
	if (document.getElementById('gasplanet-stummel')) return;
	const box = Object.assign(document.createElement('div'), { id: 'gasplanet-stummel', hidden: true });
	const c = Object.assign(document.createElement('canvas'), { id: 'view', width: 16, height: 16 });
	box.append(c, ...['status', 'fps', 'loading', 'load-bar', 'load-note'].map((id) => Object.assign(document.createElement('div'), { id })));
	document.body.append(box);
}

export async function ladeGasriese(device, { qualitaet = 'phone', vorlage = 'Jupiter', sonne, vorrechnenSchritte = 360 }) {
	stummel();
	const { App, S } = await import('../../../fremd/gasplanet-kern.js');
	const leinwand = document.getElementById('view');

	class Gasriese extends App {
		buildUI() {} bindInput() {} remember() {} updateInfo() {} updateUndoButtons() {} updateVisibility() {} applyStaticText() {} memoryNote() {}
		panel = { refresh() {}, visible() {}, custom() {} };
		ziel = null;     // GPUTextureView
		welt = null;     // { inv, auge, pxWinkel }
		targetView() { return this.ziel; }
		writeRender() {
			super.writeRender();
			const d = this.renderData, w = this.welt;
			if (!w) return;
			d.set(w.inv, U.inv); d.set(w.auge, U.auge); d.set(sonne, U.sonne); d[U.pxWinkel] = w.pxWinkel;
			this.device.queue.writeBuffer(this.renderBuf, 0, d);
		}
	}

	Object.assign(S, { remember: false, paused: false, quality: qualitaet, preset: vorlage, seed: 1 });
	const app = new Gasriese(device);
	{
		const q = new URLSearchParams(location.search), z = (n, v) => (q.has(n) ? Number(q.get(n)) : v);
		app.sky.generate(q.get('himmel') ?? HIMMEL, { ...HIMMEL_WERTE, width: z('breit', HIMMEL_WERTE.width), bright: z('hell', HIMMEL_WERTE.bright), core: z('kern', HIMMEL_WERTE.core), dust: z('staub', HIMMEL_WERTE.dust) });
	}
	app.warmSteps = vorrechnenSchritte;   // Einschwingen: 360 Schritte = 6 s Simulationszeit (Original: 1200)
	let textur = null, rechnet = false;

	return {
		get format() { return app.format; },
		get textur() { return textur; },
		get radiusKm() { return (app.preset.facts?.diameterKm ?? 142984) / 2; },
		get abplattung() { return app.preset.oblateness ?? 0; },
		/** Zeilen der Matrix Welt→Körper (nach dem letzten Bild): toBody(v) = (z₀·v, z₁·v, z₂·v) */
		get koerper() { const d = app.renderData, k = U.koerper; return [d.slice(k, k + 3), d.slice(k + 4, k + 7), d.slice(k + 8, k + 11)]; },
		get eingeschwungen() { return !(app.warm > 0) && !app.needsInit && !app.needsDye; },
		/** Zeichenfläche in Pixeln. true = neue Textur (Aufrufer muss sie neu einbinden). */
		flaeche(b, h) {
			b = Math.max(16, Math.round(b)); h = Math.max(16, Math.round(h));
			if (textur && textur.width === b && textur.height === h) return false;
			textur?.destroy();
			textur = device.createTexture({ label: 'gasriese', size: [b, h], format: app.format,
				usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
			app.ziel = textur.createView();
			leinwand.width = b; leinwand.height = h;   // der Simulator liest daraus das Seitenverhältnis
			return true;
		},
		kamera(welt) { app.welt = welt; },
		/** Einschwingen in Häppchen (~40 ms GPU je Häppchen, nie zwei gleichzeitig). true = fertig. */
		vorrechnen() {
			app.initIfNeeded();
			if (!(app.warm > 0)) return true;
			if (!rechnet) { rechnet = true; app.warmBatch().finally(() => { rechnet = false; }); }
			return false;
		},
		/** Ein Bild: Simulationsschritte für dt Echtzeit (60 Schritte/s), dann Zeichnen in die Textur. */
		zeichne(dt) { if (textur && app.welt) app.frameOnce(Math.min(dt, 0.1)); },
		stufe(q) { if (S.quality !== q) { S.quality = q; app.applyQuality(true); } },
		/** Einschlag: Wirbel mit dunkler Farbe an Breite/Länge (Grad, Körperrahmen) – über die Sturm-Mechanik des
		 *  Simulators (neue Stürme mit Antriebszeit), so wie dort auch die Konvektion neue Wirbel anstößt. */
		wirbel({ breite, laenge, radius = 2.5, staerke = 0.9, farbe = [0.09, 0.06, 0.05], dauer = 18 }) {
			if (app.storms.filter((s) => s.kick > 0).length >= 8) return;
			app.storms.push({ lat: breite, lon: laenge, radius, sign: breite >= 0 ? 1 : -1, strength: staerke, color: farbe, kick: dauer, life: dauer });
		},
	};
}
