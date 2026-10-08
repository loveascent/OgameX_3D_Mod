// Der Mond: kreist dauerhaft um den Planeten (Bahn und Geschwindigkeit: welt/mond.js) und wird, wenn die Station schießt,
// vom Strahl in zwei Hälften geschnitten. Er wird nicht „erzeugt“, wenn man ein Kapitel betritt – er ist immer da.
//
// Ablauf eines Mondes:
//   umlauf    φ̇ = ω(φ): klein und weit weg hinter dem Planeten, dann größer zur Station hin, dann Kreuzung mit dem Strahl.
//   schnitt   Auslöser: die Station hat geschossen, während der Mond in 5,5 … 8,6 s den Strahl kreuzt. t_c = jetzt + T(φ) steht damit fest.
//             Vorderkante erreicht den Strahl bei t_c − r/v, Hinterkante verlässt ihn bei t_c + r/v (v = Bahngeschwindigkeit an der Kreuzung).
//             Dazwischen glüht die Naht. Ab t_g = t_c + r/v driftet jede Hälfte entlang ∓n:
//             Versatz s(τ) = u·(τ − τ₀·(1 − e^(−τ/τ₀))),  τ = t − t_g,  τ₀ = 0,8 s  (Geschwindigkeit steigt stetig von 0 auf u, kein Ruck)
//             Schnittflächen glühen: H(t) = 5·e^(−(t − t_g)/2,2) + 0,12.  Beide Hälften fliegen auf der Bahn weiter (gleiches φ).
//   Nach t_c + 1 s kommt ein neuer Mond von der Rückseite (φ ≈ −π, winzig, wächst in 1,2 s ein); die Hälften verschwinden nach 15 s.
// Die Station schießt in Kapiteln mit Feuerplan NUR auf Freigabe des Mondes (freigabe): Der Strahl ist 6,5 s nach dem Auslösen da,
// also wird ausgelöst, wenn der Mond noch 8,2 s bis zur Kreuzung braucht. Ohne Schuss fliegt der Mond unversehrt weiter.
// Der Strahl selbst bleibt unverändert (strahl/strahl.js): Der Mond hat Tiefe und verdeckt den Strahl, wo er davor liegt.
import * as THREE from 'three/webgpu';
import { uniform, vec3, mix, clamp, mx_fractal_noise_float, positionLocal } from 'three/tsl';
import { erstelleMondMaterial } from './oberflaeche.js';
import { erstelleRauch } from './rauch.js';
import { istAn } from '../../kern/module.js';
import { mondGeometrie, MOND, weiter, zeitBis } from '../../welt/mond.js';
import { plus, mal, norm, kreuz, minus, punkt } from '../../mathe/vektor.js';

const EINBLENDEN = 1.2, NACHLAUF = 15, SPIN = 0.05, START_PHI = -1.25;
const glatt = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const v3 = (a) => new THREE.Vector3(...a);

export function erstelleMond(szene, welt, { stufe }) {
	const g = mondGeometrie(welt);
	const geometrie = new THREE.IcosahedronGeometry(1, stufe?.mondDetail ?? 6);
	const gruppe = new THREE.Group(); gruppe.name = 'Mond';
	const hitze = uniform(0);
	const rauch = istAn('rauch') ? erstelleRauch(szene) : { schritt() {}, reset() {}, dispose() {} };   // ?aus=rauch

	// Schnittflächen: Scheiben, die das offene Schalenstück schließen. Gestein mit Rissen, glühend → abkühlend.
	const kappe = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
	{
		const p = positionLocal.mul(3);
		const riss = clamp(mx_fractal_noise_float(p.mul(2.2), 3, 2, 0.5).mul(1.4).add(0.55), 0, 1);
		const heiss = hitze.mul(riss.mul(0.7).add(0.5));
		const gestein = mix(vec3(0.07, 0.06, 0.055), vec3(0.2, 0.17, 0.14), riss);
		kappe.colorNode = gestein.add(mix(vec3(1, 0.3, 0.05), vec3(1, 0.8, 0.5), clamp(heiss.mul(0.2), 0, 1)).mul(heiss));
	}
	const kappenGeo = new THREE.CircleGeometry(1, 64);

	/** Ein Mondkörper = zwei Hälften (zusammen die ganze Kugel) + zwei Schnittflächen */
	function baueKoerper() {
		const haelften = [1, -1].map((s) => {
			const { material, u } = erstelleMondMaterial(s);
			const mesh = new THREE.Mesh(geometrie, material);
			mesh.frustumCulled = false; mesh.visible = false;
			gruppe.add(mesh);
			return { s, mesh, u };
		});
		const kappen = [0, 1].map(() => { const k = new THREE.Mesh(kappenGeo, kappe); k.frustumCulled = false; k.visible = false; gruppe.add(k); return k; });
		return { haelften, kappen };
	}
	szene.add(gruppe);

	const frei = [baueKoerper(), baueKoerper()];
	const monde = [];   // aktive Monde: { k, zustand, phi, ts, tc, plan, ende }
	const q = new THREE.Quaternion(), achse = new THREE.Vector3(0.35, 1, 0.2).normalize(), z0 = new THREE.Vector3(0, 0, 1);
	let letzterSchuss = -1e9;

	const haupt = () => monde.find((m) => m.zustand === 'umlauf');
	function starte(t, phi) {
		const k = frei.find((f) => !monde.some((m) => m.k === f));
		if (!k) return;
		for (const h of k.haelften) h.mesh.visible = true;
		monde.push({ k, zustand: 'umlauf', phi, ts: t, tc: 0, plan: null });
	}
	function beende(m) {
		for (const h of m.k.haelften) h.mesh.visible = false;
		for (const c of m.k.kappen) c.visible = false;
		monde.splice(monde.indexOf(m), 1);
	}

	function setzeAus(h, C, scale, spin, n, h0, X, v, naht) {
		h.mesh.position.set(...C); h.mesh.scale.setScalar(Math.max(scale, 1e-3));
		h.mesh.quaternion.setFromAxisAngle(achse, spin);
		h.u.C.value.copy(v3(C)); h.u.n.value.copy(v3(n)); h.u.h.value = h0;
		h.u.X.value.copy(v3(X)); h.u.v.value.copy(v3(v)); h.u.naht.value = naht;
	}

	return {
		gruppe, geometrie: g,
		get zustand() { return monde.some((m) => m.zustand === 'schnitt') ? 'schnitt' : 'umlauf'; },
		get phi() { return haupt()?.phi ?? null; },
		/** Ziel der Station, solange der Mond da ist: die Planetenmitte (der Strahl liegt dann in der Bahnebene) */
		get ziel() { return g.T; },
		/** Darf die Station jetzt schießen? Ja, wenn der Mond in 6,2 … 8,2 s den Strahl kreuzt (Strahl ist 6,5 s nach dem Auslösen da). */
		freigabe(t) {
			const m = haupt();
			if (!m || t - m.ts < EINBLENDEN) return false;
			const T = zeitBis(g, m.phi);
			return T <= MOND.vorlauf && T >= 6.2;
		},
		/** st: Station (zustand: M, d, aktiv, feuerZeit) · z: { t, dt, kamera } */
		schritt(welt2, st, z) {
			const t = z.t, dt = Math.min(z.dt, 0.1), r = MOND.radius;
			if (!monde.length) starte(t, START_PHI);
			for (const m of monde) m.phi = weiter(g, m.phi, dt);

			// Schuss erkannt: kreuzt der Mond den Strahl, steht der Schnitt fest
			if (st.aktiv && st.feuerZeit !== letzterSchuss) {
				letzterSchuss = st.feuerZeit;
				const m = haupt();
				const T = m ? zeitBis(g, m.phi) : 0;
				if (m && T > 5.5 && T < 8.6) {
					const d = st.d, v = g.e2, n = norm(kreuz(d, v)), C = g.bahn(0);
					const X = plus(st.M, mal(d, punkt(minus(C, st.M), d)));   // Strahlpunkt bei der Kreuzung
					m.plan = { n, v, X, h: punkt(minus(X, C), n) };
					m.zustand = 'schnitt'; m.tc = t + T;
				}
			}
			// neuer Mond von der Rückseite, sobald der alte geschnitten ist
			if (!haupt()) { const alt = monde.find((m) => m.zustand === 'schnitt'); if (!alt || t > alt.tc + 1) starte(t, -Math.PI + 0.03); }

			let quelle = null;
			for (const m of monde.slice()) {
				const C0 = g.bahn(m.phi), spin = SPIN * (t - m.ts);
				const ein = glatt((t - m.ts) / EINBLENDEN);
				if (!m.plan) {   // unversehrt: beide Hälften zeichnen zusammen die ganze Kugel
					for (const h of m.k.haelften) setzeAus(h, C0, r * ein, spin, g.nPi, 0, g.X, g.e2, 0);
					continue;
				}
				const dauer = r / MOND.vNah, tg = m.tc + dauer, p = m.plan;
				const aus = 1 - glatt((t - (m.tc + NACHLAUF - 1.5)) / 1.5), groesse = r * ein * aus;
				const tau = Math.max(0, t - tg), t0 = 0.8;
				const versatz = MOND.trennung * (tau - t0 * (1 - Math.exp(-tau / t0)));
				const naht = glatt((t - (m.tc - dauer)) / 0.15) * (1 - glatt((t - (tg + 6)) / 3));
				hitze.value = t < m.tc - dauer ? 0 : 5 * Math.exp(-Math.max(0, t - tg) / 2.2) + 0.12;
				const a = Math.sqrt(Math.max(0, groesse * groesse - p.h * p.h));
				m.k.haelften.forEach((h, i) => {
					const C = plus(C0, mal(p.n, h.s * versatz));
					setzeAus(h, C, groesse, spin + (tau > 0 ? h.s * 0.03 * tau : 0), p.n, p.h, p.X, p.v, naht);
					h.u.nahtBreite.value = 3 + 4 * glatt((t - m.tc) / 3);
					const k = m.k.kappen[i];
					k.visible = tau > 0 && aus > 0.02;
					if (!k.visible) return;
					k.position.set(...plus(C, mal(p.n, p.h)));
					k.quaternion.setFromUnitVectors(z0, v3(p.n));
					k.scale.setScalar(Math.max(a * 0.999, 1e-3));
				});
				if (groesse > 0.5 * r && t > m.tc - dauer) quelle = { C: C0, a, n: p.n, h: p.h, X: p.X, v: p.v, vMond: mal(p.v, MOND.vNah), rate: naht, schub: t >= tg };
				if (t > m.tc + NACHLAUF) beende(m);
			}
			rauch.schritt(z, quelle);
		},
		dispose() { rauch.dispose(); szene.remove(gruppe); geometrie.dispose(); kappenGeo.dispose(); kappe.dispose(); for (const f of frei) for (const h of f.haelften) h.mesh.material.dispose(); },
	};
}
