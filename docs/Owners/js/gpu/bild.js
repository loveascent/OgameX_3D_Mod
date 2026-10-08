// Das fertige Bild aus zwei Quellen, mit EINER Kamera gezeichnet:
//   Hintergrund  Himmel + Planet vom Simulator (Anzeigeraum, schon tonwertgemappt) – oder schwarz (Ersatz)
//   Szene        three.js: Station, Strahl, Blitze, Einschlag (linear, HDR) + Tiefe des Planeten (Stellvertreter)
//
// Belegung des Alpha-Kanals der Szene (Halbfloat-Ziel, Werte über 1 möglich):
//   undurchsichtige Körper schreiben 1  → Rumpf = step(0,75, α)
//   Leuchten (Strahl, Blitze) addieren nur Farbe, α bleibt (Mischung: Quelle·1 + Ziel, α: Ziel)
//   Hitzeflimmern addiert nur α (0 … 0,5) → Hitze = α − Rumpf
// Hitzeflimmern = Brechung: Wo Hitze ist, wird an einer verschobenen Stelle abgetastet, Versatz = Hitze · Rauschen.
//
// Tonwert: dieselbe Kurve wie im Planeten-Shader (ACES nach Narkowicz 2015, dann Gamma 2,2), damit Station und
// Planet mit derselben „Blende“ belichtet sind:  T(x) = x(2,51x + 0,03) / (x(2,43x + 0,59) + 0,14)
// Leuchten über dem Hintergrund: „Screen“  1 − (1 − Hintergrund)(1 − Szene)  – hellt auf, ohne zu überstrahlen.
import * as THREE from 'three/webgpu';
import { pass, vec2, vec3, vec4, float, screenUV, time, mx_noise_vec3, step, clamp, pow, mix, uniform } from 'three/tsl';
import { bloom } from '../../fremd/three/zusatz.min.js';

const aces = (x) => clamp(x.mul(x.mul(2.51).add(0.03)).div(x.mul(x.mul(2.43).add(0.59)).add(0.14)), 0, 1);

export function erstelleBild(renderer, szene, kamera, { hintergrund, stufe }) {
	const szenenPass = pass(szene, kamera, { samples: stufe.msaa > 1 ? stufe.msaa : 0, type: THREE.HalfFloatType });
	const roh = szenenPass.getTextureNode('output');
	const belichtung = uniform(1);
	const flimmern = uniform(0.012);   // größter Versatz in Bildanteilen

	const rumpf = step(0.75, roh.a);
	const hitze = clamp(roh.a.sub(rumpf), 0, 0.5);
	const versatz = mx_noise_vec3(vec3(screenUV.mul(vec2(70, 40)), time.mul(5))).xy.mul(hitze).mul(flimmern);
	const uv = screenUV.add(versatz);
	const szeneFarbe = roh.sample(uv).rgb;

	let hdr = szeneFarbe;
	const glanz = stufe.bloom ? bloom(roh.rgb, 0.35, 0.4, 0.9) : null;
	if (glanz) hdr = hdr.add(glanz.rgb);
	const tm = pow(aces(hdr.mul(belichtung)), vec3(1 / 2.2));
	const hg = hintergrund ? hintergrund(uv).rgb : vec3(0);
	const eins = vec3(1);
	const ueber = eins.sub(eins.sub(hg).mul(eins.sub(tm)));
	const bild = mix(ueber, tm, rumpf);

	const pipeline = new THREE.RenderPipeline(renderer);
	pipeline.outputColorTransform = false;   // alles liegt schon im Anzeigeraum
	pipeline.outputNode = vec4(bild, float(1));
	return {
		belichtung, flimmern,
		render: () => pipeline.render(),
		/** Shader asynchron übersetzen, genau so wie das Bild sie später braucht (gleiche Szene, Halbfloat-/MSAA-Ziel, gleiche Lichter) – sonst
		 *  übersetzt das erste Bild sie noch einmal im Hauptstrang und ruckelt. Das Objekt hängt dazu kurz in der Szene, aber nur auf Ebene 1:
		 *  die Bildkamera (Ebene 0) sieht es nicht, die Übersetzungskamera schon. Unsichtbare Teile (Schnittkappen u. ä.) werden dafür kurz eingeschaltet. */
		async kompiliere(objekt, zielSzene) {
			const ebene = (n) => objekt.traverse((o) => o.layers.set(n));
			const k = kamera.clone(); k.layers.enable(1); k.updateMatrixWorld(true);
			const t = renderer.getRenderTarget(), m = renderer.getMRT();
			const sicht = []; objekt.traverse((o) => { sicht.push([o, o.visible]); o.visible = true; });
			ebene(1); zielSzene.add(objekt);
			try {
				renderer.setRenderTarget(szenenPass.renderTarget); renderer.setMRT(szenenPass.getMRT?.() ?? null);
				const p = renderer.compileAsync(zielSzene, k);   // liest das Ziel vor dem ersten Warten
				renderer.setRenderTarget(t); renderer.setMRT(m);
				await p;
			} finally { zielSzene.remove(objekt); ebene(0); for (const [o, v] of sicht) o.visible = v; }
		},
		dispose: () => { pipeline.dispose?.(); szenenPass.dispose?.(); glanz?.dispose?.(); },
	};
}
