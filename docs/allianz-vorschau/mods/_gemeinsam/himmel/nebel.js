// Gasnebel als echte 3D-Himmelskugel (TSL): Der Nebel hängt FEST an Richtungen im Raum – es gibt keine Zeit im Shader,
// nichts verformt oder verändert sich. Bewegung entsteht allein dadurch, dass die Kamera sich minimal dreht (himmel.js).
// Aussehen nach den Homeworld-Nebelsprites (am Atlas gemessen: Staub ≈ 61/28/22, Schein ≈ 15/30/49, helle Kerne blau/orange),
// aber ohne Bilddatei: dreidimensionales Rauschen (MaterialX, in three.js eingebaut), nahtlos rund um die Kugel.
import { Fn, vec3, float, dot, normalize, mix, smoothstep, pow, exp, length, clamp, mx_fractal_noise_float } from 'three/tsl';

// Feste, gleichmäßig verteilte Wolkenmassen (Fibonacci-Kugel) und je 1–2 Kerne daneben – deterministisch, kein Zufall zur Laufzeit.
function erzeugeAnordnung(anzahl = 10) {
	let st = 12345; const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
	const wolken = [], kerne = [];
	const gold = Math.PI * (3 - Math.sqrt(5));
	for (let i = 0; i < anzahl; i++) {
		const y = 1 - (2 * (i + 0.5)) / anzahl, r = Math.sqrt(1 - y * y), phi = i * gold;
		const c = [Math.cos(phi) * r, y, Math.sin(phi) * r];
		wolken.push({ c, s: 0.075 + rnd() * 0.07 });                    // Größe: exp(-(1-cos)/s) ≈ 15–25° Radius
		const n = 1 + (i % 2);
		for (let k = 0; k < n; k++) {
			const o = [c[0] + (rnd() - 0.5) * 0.35, c[1] + (rnd() - 0.5) * 0.35, c[2] + (rnd() - 0.5) * 0.35];
			const l = Math.hypot(...o);
			const orange = (i + k) % 2 === 0;
			kerne.push({ c: o.map((x) => x / l), farbe: orange ? [1.0, 0.60, 0.33] : [0.42, 0.60, 1.0], st: 0.7 + rnd() * 0.5 });
		}
	}
	return { wolken, kerne };
}
export const ANORDNUNG = erzeugeAnordnung();

// d: normalisierte Blickrichtung (Welt), oktaven: 3 (Handy) bis 5 (Rechner)
export function erzeugeNebel(oktaven = 4) {
	const rauschen = (p) => mx_fractal_noise_float(p, oktaven, 2.0, 0.5).mul(0.5).add(0.5);

	return Fn(([d]) => {
		// leichtes, FESTES Verformen: ausgefranste Ränder statt glatter Blasen (ändert sich nie)
		const q = vec3(rauschen(d.mul(1.7)), rauschen(d.mul(1.7).add(5.2)), rauschen(d.mul(1.7).add(9.1)));
		const w = d.add(q.sub(0.5).mul(0.30));
		const dichte = rauschen(w.mul(3.4));

		let maske = float(0);
		ANORDNUNG.wolken.forEach(({ c, s }) => { maske = maske.add(exp(float(1).sub(dot(normalize(w), vec3(...c))).div(s).negate())); });
		maske = clamp(maske, 0, 1.2);

		const staub = smoothstep(0.40, 0.66, dichte).mul(smoothstep(0.08, 0.5, maske));
		const feinheit = rauschen(w.mul(9.0));                              // feine Fasern im Staub
		const staubDicht = staub.mul(feinheit.mul(0.7).add(0.45));

		// Licht der Kerne: nah = kräftig, weit = sanft; färbt den Staub und erzeugt Kern und Hof
		let licht = vec3(0, 0, 0), glanz = vec3(0, 0, 0);
		ANORDNUNG.kerne.forEach(({ c, farbe, st }) => {
			const r = length(d.sub(vec3(...c)));
			const f = vec3(...farbe);
			licht = licht.add(f.mul(exp(r.mul(4.5).negate())).mul(st));
			glanz = glanz.add(f.mul(float(0.00022).div(r.mul(r).add(0.00022))).mul(st).mul(0.9));
		});
		const staubFarbe = mix(vec3(0.20, 0.08, 0.06), vec3(0.95, 0.46, 0.28), clamp(licht.x.mul(0.9), 0, 1));
		const staubLicht = staubFarbe.mul(staubDicht).mul(licht.mul(0.55).add(0.34)).mul(0.68);

		// weiter blauer Schein um die Massen, vom Staub teilweise verdeckt
		const schein = vec3(0.07, 0.17, 0.30).mul(pow(clamp(maske, 0, 1), 1.1)).mul(float(1.0).sub(staubDicht.mul(0.55))).mul(0.52);

		return staubLicht.add(schein).add(glanz.mul(float(1.0).sub(staubDicht.mul(0.5))));
	});
}
