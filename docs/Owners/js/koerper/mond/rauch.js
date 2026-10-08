// Rauch und Glut des Laserschnitts: weiche, zur Kamera gedrehte Wolkenflecken (Partikel, CPU-bewegt, eine Zeichnung).
//
// Entstehung: Beim Schnitt verdampft Gestein entlang der Naht. Neue Partikel entstehen auf dem Schnittkreis (Mitte Cc, Radius a)
// auf der schon durchflogenen Seite, Abstand δ hinter dem Strahl exponentiell verteilt (Mittel 70 km – wie das Glühen der Naht):
//   cos θ = (s₀ + δ)/a,  s₀ = (X − Cc)·v̂
// Bewegung (kräftefrei, Welt):  x ← x + w·dt,  w = v_Mond + u_aus·û + Streuung   (Rauch fliegt zuerst mit dem Mond mit)
// Beim Auseinanderbrechen (t_g) kommt ein Schub: Partikel über die ganze Schnittfläche, schnell entlang ±n (die Fuge füllt sich mit Dampf).
// Aussehen:  Größe s = s₀·(1 + 0,55·Alter),  Dichte = Fleck(r)·Rauschen·Ein/Aus,  Glut G = e^(−Alter/1,1)
//   Dichte ∝ (1 + 0,55·Alter)^−2,1: dieselbe Masse auf größerer Fläche wird dünner (sonst blenden Hunderte überlappender Flecken weiß aus)
//   Farbe = (Rauchgrau + 1,6·G·Glutfarbe)·Dichte, nahe der Kamera (< 1 800 km) ausgeblendet   – additiv (Licht), darum keine schwarzen Flächen; Rauch ist nur dort zu sehen, wo er Licht hat.
import * as THREE from 'three/webgpu';
import { vec3, float, uv, smoothstep, exp, mix, clamp, length, positionWorld, cameraPosition, mx_noise_float, instancedDynamicBufferAttribute } from 'three/tsl';
import { glanzMischung } from '../../gpu/mischung.js';
import { plus, mal, norm, kreuz, minus, punkt } from '../../mathe/vektor.js';

const N = 640, LEBEN = 9;
const zufall = (a = 0, b = 1) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.75;

export function erstelleRauch(szene) {
	const daten = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);   // Alter, Zufallszahl
	daten.setUsage(THREE.DynamicDrawUsage);
	const a = instancedDynamicBufferAttribute(daten);
	const q = uv().sub(0.5).mul(2);
	const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
	glanzMischung(m);
	const alter = a.x, saat = a.y;
	const rausch = mx_noise_float(vec3(q.mul(1.7), saat.mul(31.7).add(alter.mul(0.35)))).mul(0.5).add(0.5);
	const fleck = smoothstep(1, 0, q.length()).pow(1.6);
	const dichte = fleck.mul(rausch.mul(0.9).add(0.35)).mul(smoothstep(0, 0.35, alter)).mul(float(1).sub(smoothstep(LEBEN * 0.3, LEBEN, alter))).mul(smoothstep(500, 1800, length(cameraPosition.sub(positionWorld)))).mul(0.09).div(float(1).add(alter.mul(0.55)).pow(2.1));   // nah an der Kamera ausblenden; je größer die Wolke, desto dünner (gleiche Masse auf mehr Fläche) ausblenden (sonst füllt ein Fleck das Bild)
	const glut = exp(alter.mul(-0.9));
	const rauch = vec3(0.5, 0.44, 0.38);
	const glutfarbe = mix(vec3(1.0, 0.32, 0.05), vec3(1.0, 0.75, 0.4), clamp(glut.mul(0.6), 0, 1));
	m.colorNode = rauch.add(glutfarbe.mul(glut.mul(1.6))).mul(dichte);
	const geo = new THREE.PlaneGeometry(2, 2);
	const gitter = new THREE.InstancedMesh(geo, m, N);
	gitter.frustumCulled = false; gitter.renderOrder = 11;
	szene.add(gitter);

	const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), groesse = new Float32Array(N), lebt = new Uint8Array(N);
	let naechster = 0, uebrig = 0, schubGegeben = false;
	const mat = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3(), qk = new THREE.Quaternion();
	const nullMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
	for (let i = 0; i < N; i++) gitter.setMatrixAt(i, nullMatrix);

	function neu(P, V, g) {
		const i = naechster; naechster = (naechster + 1) % N;
		pos.set(P, i * 3); vel.set(V, i * 3); groesse[i] = g; lebt[i] = 1;
		daten.setXY(i, 0, Math.random());
	}

	return {
		gitter,
		/** e: Quelle { C, a, n, h, X, v (Einheitsvektor Flugrichtung), vMond (km/s, Vektor), rate (0…1), schub (bool, einmal) } oder null */
		schritt(z, e) {
			const dt = Math.min(z.dt, 0.1);
			if (e) {
				const Cc = plus(e.C, mal(e.n, e.h)), b1 = e.v, b2 = norm(kreuz(e.n, e.v));
				const s0 = punkt(minus(e.X, Cc), b1);
				uebrig += 120 * e.rate * dt;
				for (; uebrig >= 1; uebrig--) {
					const delta = -70 * Math.log(1 - Math.random() * 0.97), c = Math.min(1, (s0 + delta) / e.a);
					const th = Math.acos(Math.max(-1, c)) * (Math.random() < 0.5 ? 1 : -1);
					const radial = plus(mal(b1, Math.cos(th)), mal(b2, Math.sin(th)));
					const aus = zufall(12, 50);
					const streu = [gauss() * 25, gauss() * 25, gauss() * 25];   // Strahlfleck ist keine Punktquelle: Ort und Geschwindigkeit streuen
					neu(plus(plus(Cc, mal(radial, e.a)), streu), plus(plus(e.vMond, mal(radial, aus)), plus(mal(e.n, gauss() * 14), mal(b1, gauss() * 10))), zufall(35, 75));
				}
				if (e.schub && !schubGegeben) {
					schubGegeben = true;
					for (let k = 0; k < 60; k++) {
						const r = e.a * Math.sqrt(Math.random()), th = zufall(0, 2 * Math.PI);
						const radial = plus(mal(b1, Math.cos(th)), mal(b2, Math.sin(th)));
						neu(plus(Cc, mal(radial, r)), plus(plus(e.vMond, mal(radial, (r / e.a) * zufall(5, 30))), mal(e.n, gauss() * 38)), zufall(60, 130));
					}
				}
			} else { uebrig = 0; schubGegeben = false; }
			qk.copy(z.kamera.quaternion);
			for (let i = 0; i < N; i++) {
				if (!lebt[i]) continue;
				const alt = daten.getX(i) + dt;
				if (alt > LEBEN) { lebt[i] = 0; gitter.setMatrixAt(i, nullMatrix); continue; }
				daten.setX(i, alt);
				for (let k = 0; k < 3; k++) pos[i * 3 + k] += vel[i * 3 + k] * dt;
				p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
				s.setScalar(groesse[i] * (1 + 0.55 * alt));
				gitter.setMatrixAt(i, mat.compose(p, qk, s));
			}
			gitter.instanceMatrix.needsUpdate = true; daten.needsUpdate = true;
		},
		reset() { lebt.fill(0); uebrig = 0; schubGegeben = false; for (let i = 0; i < N; i++) gitter.setMatrixAt(i, nullMatrix); gitter.instanceMatrix.needsUpdate = true; },
		dispose() { szene.remove(gitter); geo.dispose(); m.dispose(); },
	};
}
