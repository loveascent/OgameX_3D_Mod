// Blitze der Station als GPU-Bänder. Daten: blitze.json (Kanten A→B aus dem Blender-Modell, Modell-Einheiten).
//
// Form eines Blitzes (je Kante, t ∈ [0, 1]):
//   p(t) = A + t·(B − A) + sin(πt) · ( Rauschen(p₀·F + w) · Amplitude + Bogen )
//   sin(πt) hält beide Enden fest am Elektrodenpunkt; w wandert mit der Zeit → der Kanal zuckt.
// Darstellung: ein zur Kamera gedrehtes Band (2 Dreiecke je Abschnitt) statt einer Röhre. Breite mindestens
//   0,7 Pixel, damit ein dünner Blitz in großer Entfernung nicht flimmert (Abtastgrenze); die Helligkeit sinkt dabei
//   im selben Verhältnis (Energie bleibt gleich: Leuchtdichte · Breite = const).
// Querprofil: Kern (hart) + Schein ∝ (1 − x²)^1,5 – Leuchtdichte eines Plasmakanals mit Randabfall.
//
// Säulenblitze springen von der festen Säule (innen) auf die Elektroden der drehenden Trommel (außen):
//   Elektroden stehen im Trommelrahmen bei k·Teilung + Teilung/2, nur innerhalb zweier Bögen.
//   Außenende mit Ruhewinkel φ₀: Trommelwinkel rel = φ₀ − θ_T, nächste Elektrode sn, Weltwinkel = sn + θ_T.
//   Liegt keine Elektrode in Reichweite (außerhalb der Bögen), zündet der Blitz nicht.
import * as THREE from 'three/webgpu';
import { Fn, attribute, uniform, vec3, vec4, float, sin, mix, normalize, cross, abs, pow, max, smoothstep, select, varying,
	mx_fractal_noise_vec3, PI, color, modelWorldMatrixInverse, cameraPosition, length } from 'three/tsl';
import { glanzMischung } from '../../gpu/mischung.js';

/** Zufall je (Gruppe, Takt), gleichverteilt in [0, 1) – fest, damit derselbe Takt dasselbe Bild gibt. */
export function hash(a, b) {
	let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
	h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
	return (h >>> 0) / 4294967296;
}

/** daten: ein Eintrag aus blitze.json · p: { amplitude, feinheit, dicke (Modell-Einheiten), schein, bogen } · punkte je Blitz */
export function erstelleBlitze(daten, p, punkte) {
	const n = daten.E.length;
	const A = daten.E.map((e) => daten.V[e[0]]), B = daten.E.map((e) => daten.V[e[1]]);
	const gruppe = daten.E.map((e) => Math.round(daten.gruppe[e[0]]));
	const endeB = daten.ende ? daten.E.map((e) => daten.ende[e[1]] > 0.5) : null;
	const endeA = daten.ende ? daten.E.map((e) => daten.ende[e[0]] > 0.5) : null;
	const ruhe = daten.zielwinkel ? daten.E.map((e) => daten.zielwinkel[e[0]]) : null;
	const bogen = gruppe.map((g) => { const v = [hash(g, 31) * 2 - 1, hash(g, 32) * 2 - 1, hash(g, 33) * 2 - 1]; const l = Math.hypot(...v) || 1; return v.map((k) => (k / l) * (p.bogen ?? 0)); });

	const g = new THREE.InstancedBufferGeometry();
	const tt = new Float32Array(punkte * 2), seite = new Float32Array(punkte * 2);
	for (let i = 0; i < punkte; i++) { tt[2 * i] = tt[2 * i + 1] = i / (punkte - 1); seite[2 * i] = -1; seite[2 * i + 1] = 1; }
	const idx = [];
	for (let i = 0; i < punkte - 1; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
	g.setIndex(idx);
	g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(punkte * 6), 3));
	g.setAttribute('tt', new THREE.BufferAttribute(tt, 1));
	g.setAttribute('seite', new THREE.BufferAttribute(seite, 1));
	const iA = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), iB = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
	const iBogen = new THREE.InstancedBufferAttribute(new Float32Array(bogen.flat()), 3), iHell = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
	for (const a of [iA, iB, iHell]) a.setUsage(THREE.DynamicDrawUsage);
	g.setAttribute('iA', iA); g.setAttribute('iB', iB); g.setAttribute('iBogen', iBogen); g.setAttribute('iHell', iHell);
	g.instanceCount = n;

	const uW = uniform(0), uKern = uniform(30), uSchein = uniform(3), uPx = uniform(0.001);
	const F = float(p.feinheit), amp = float(p.amplitude), dicke = float(p.dicke), schein = float(p.dicke * p.schein);
	const punkt = Fn(([t]) => {
		const basis = mix(attribute('iA', 'vec3'), attribute('iB', 'vec3'), t);
		const n1 = mx_fractal_noise_vec3(basis.mul(F).add(vec3(uW, uW.mul(0.71), uW.mul(1.37))), 4, 2.0, 0.65, 1.0);
		const n2 = mx_fractal_noise_vec3(basis.mul(F.mul(4.5)).add(vec3(uW.mul(1.9), uW, uW.mul(0.53))), 4, 2.0, 0.65, 1.0);
		return basis.add(n1.add(n2.mul(0.28)).mul(amp).add(attribute('iBogen', 'vec3')).mul(sin(t.mul(PI))));
	});
	// Kamera im Modellrahmen; Breiten (Kern, Schein, Band) aus dem Abstand: 1 Pixel = Abstand · uPx
	const kameraLokal = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz;
	const breiten = Fn(() => {
		const px = length(kameraLokal.sub(mix(attribute('iA', 'vec3'), attribute('iB', 'vec3'), attribute('tt', 'float')))).mul(uPx);
		const kern = max(dicke, px.mul(0.7)), sch = max(schein, px.mul(2.5));
		return vec3(max(kern, sch), kern, sch);
	});
	const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
	glanzMischung(m);
	m.positionNode = Fn(() => {
		const t = attribute('tt', 'float'), s = attribute('seite', 'float');
		const p1 = punkt(t), p2 = punkt(t.add(0.01));
		const quer = normalize(cross(normalize(p2.sub(p1)), normalize(kameraLokal.sub(p1))));
		return select(attribute('iHell', 'float').greaterThan(0), p1.add(quer.mul(s.mul(breiten().x))), vec3(0));
	})();
	const vB = varying(breiten()), vS = varying(attribute('seite', 'float')), vH = varying(attribute('iHell', 'float'));
	m.colorNode = Fn(() => {
		const d = abs(vS).mul(vB.x);
		const kernI = uKern.mul(vH).mul(dicke.div(vB.y)).mul(float(1).sub(smoothstep(vB.y.mul(0.6), vB.y, d)));
		const x = d.div(vB.z);
		const scheinI = uSchein.mul(vH).mul(schein.div(vB.z)).mul(pow(max(float(1).sub(x.mul(x)), 0), 1.5));
		return vec4(color(0.72, 0.87, 1.0).mul(kernI).add(color(0.12, 0.42, 1.0).mul(scheinI)), 1);
	})();
	const mesh = new THREE.Mesh(g, m);
	mesh.frustumCulled = false;
	mesh.renderOrder = 10;

	const winkelRast = (P, an) => { const r = Math.hypot(P[0], P[1]); return [r * Math.cos(an), r * Math.sin(an), P[2]]; };

	return {
		mesh,
		/** f: Zeit in Takten · anteil: Anteil der Gruppen, die gerade zünden · thetaT: Trommelwinkel · ziel: Elektroden (blitze.json) */
		update({ takt, fluss, anteil, thetaT = 0, ziel = null, kern, schein, pxWinkel }) {
			const T = Math.floor(takt);
			uW.value = fluss * 1.618; uKern.value = kern; uSchein.value = schein; uPx.value = pxWinkel;
			const a = iA.array, b = iB.array, h = iHell.array;
			for (let i = 0; i < n; i++) {
				let sicht = anteil > 0 && hash(gruppe[i], T) <= anteil;
				let pa = A[i], pb = B[i];
				if (ziel && ruhe) {
					const tau = 2 * Math.PI, rel = (((ruhe[i] - thetaT) % tau) + tau) % tau;
					const sn = (Math.floor(rel / ziel.Teilung) + 0.5) * ziel.Teilung;
					const drin = (sn > ziel.Bogen1_von + ziel.Rand && sn < ziel.Bogen1_bis - ziel.Rand) || (sn > ziel.Bogen2_von + ziel.Rand && sn < ziel.Bogen2_bis - ziel.Rand);
					if (!drin) sicht = false;
					if (endeA[i]) pa = winkelRast(pa, sn + thetaT);
					if (endeB[i]) pb = winkelRast(pb, sn + thetaT);
				}
				a.set(pa, 3 * i); b.set(pb, 3 * i);
				h[i] = sicht ? 0.35 + 1.25 * hash(gruppe[i], T + 977) : 0;
			}
			iA.needsUpdate = iB.needsUpdate = iHell.needsUpdate = true;
		},
		dispose() { g.dispose(); m.dispose(); },
	};
}
