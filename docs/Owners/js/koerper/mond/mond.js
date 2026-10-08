// Der Mond, der durch den Strahl fliegt und in zwei Hälften zerschnitten wird (nur im Kapitel „spass“).
//
// Ablauf (ein Durchgang, danach von vorn):
//   warten    Station ist frei → Mond erscheint auf seiner Kreisbahn (wächst in 1,2 s ein), Schuss wird für t_f freigegeben
//   anflug    Mond fliegt auf Bahn:  pos(t) = bahn(ω·(t − t_c)),  t_c = Auslösezeit + vorlauf (der Schuss wird dort ausgelöst)
//   schnitt   Vorderkante erreicht den Strahl bei t_c − r/v, Hinterkante verlässt ihn bei t_c + r/v. Dazwischen glüht die Naht.
//   getrennt  ab t_g = t_c + r/v: jede Hälfte driftet entlang ∓n  –  Versatz s(τ) = u·(τ − τ₀·(1 − e^(−τ/τ₀))),  τ = t − t_g,  τ₀ = 0,8 s
//             (Geschwindigkeit steigt stetig von 0 auf u: die Schnittfuge öffnet sich, ohne Ruck). Hälften taumeln leicht.
//   Schnittfläche glüht: Heizung H(t) = 5·e^(−(t − t_g)/2,2) + 0,12 (Gestein kühlt ab, bleibt matt glühend)
// Der Strahl selbst ist unverändert (strahl/strahl.js): Der Mond hat Tiefe, also verdeckt er den Strahl dort, wo er davor liegt.
import * as THREE from 'three/webgpu';
import { uniform, vec3, float, mix, clamp, exp, mx_fractal_noise_float, positionLocal } from 'three/tsl';
import { erstelleMondMaterial } from './oberflaeche.js';
import { erstelleRauch } from './rauch.js';
import { istAn } from '../../kern/module.js';
import { mondGeometrie, MOND } from '../../welt/mond.js';
import { DAUER } from '../station/ablauf.js';
import { minus, plus, mal, norm, kreuz, punkt } from '../../mathe/vektor.js';

const EINBLENDEN = 1.2, NACHLAUF = 17, SPIN = 0.05;
const glatt = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const v3 = (a) => new THREE.Vector3(...a);

export function erstelleMond(szene, welt, { stufe }) {
	const g = mondGeometrie(welt);
	const geometrie = new THREE.IcosahedronGeometry(1, stufe?.mondDetail ?? 6);
	const gruppe = new THREE.Group(); gruppe.name = 'Mond'; gruppe.visible = false;
	const hitze = uniform(0);
	const haelften = [1, -1].map((s) => {
		const { material, u } = erstelleMondMaterial(s);
		const mesh = new THREE.Mesh(geometrie, material);
		mesh.frustumCulled = false;
		return { s, mesh, u };
	});
	// Schnittflächen: Scheiben, die das offene Schalenstück schließen. Gestein mit Rissen, glühend → abkühlend.
	const kappe = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
	{
		const p = positionLocal.mul(3);
		const riss = clamp(mx_fractal_noise_float(p.mul(2.2), 3, 2, 0.5).mul(1.4).add(0.55), 0, 1);
		const heiss = hitze.mul(riss.mul(0.7).add(0.5));
		const gestein = mix(vec3(0.07, 0.06, 0.055), vec3(0.2, 0.17, 0.14), riss);
		kappe.colorNode = gestein.add(mix(vec3(1, 0.3, 0.05), vec3(1, 0.8, 0.5), clamp(heiss.mul(0.2), 0, 1)).mul(heiss));
	}
	const kappen = haelften.map(() => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 64), kappe); m.frustumCulled = false; return m; });
	for (const h of haelften) gruppe.add(h.mesh);
	for (const k of kappen) gruppe.add(k);
	szene.add(gruppe);
	const rauch = istAn('rauch') ? erstelleRauch(szene) : { schritt() {}, reset() {}, dispose() {} };   // ?aus=rauch

	let zustand = 'ruhe', ts = 0, tf = 0, tc = 0, plan = null;   // plan: Schnittebene (aus dem echten Strahl beim Auslösen)
	const q = new THREE.Quaternion(), achse = new THREE.Vector3(0.35, 1, 0.2).normalize();

	const verstecke = () => { gruppe.visible = false; zustand = 'ruhe'; rauch.reset(); };
	function setzeAus(h, C, scale, spin, n, h0, X, v, naht) {
		h.mesh.position.set(...C); h.mesh.scale.setScalar(scale);
		h.mesh.quaternion.setFromAxisAngle(achse, spin);
		Object.assign(h.u.C.value, v3(C)); h.u.n.value.copy(v3(n)); h.u.h.value = h0;
		h.u.X.value.copy(v3(X)); h.u.v.value.copy(v3(v)); h.u.naht.value = naht;
	}

	return {
		gruppe, geometrie: g, get zustand() { return zustand; },
		/** Freigabe für die Station: darf jetzt gefeuert werden? (Schuss wird so ausgelöst, dass der Mond den Strahl nach vorlauf kreuzt) */
		freigabe(t) { return zustand === 'anflug' && t >= tf; },
		/** Ziel der Station in diesem Kapitel */
		get ziel() { return g.T; },
		/** st: Station (zustand, fehlerGrad) · z: { t, kapitel } */
		schritt(welt2, st, z) {
			if (z.kapitel.id !== 'spass') { if (zustand !== 'ruhe') verstecke(); return; }
			const t = z.t;
			if (zustand === 'ruhe') {
				// Schuss frühestens, wenn die Station frei ist (laufender Schuss: Auslösezeit + DAUER) und danach ruhig auf T zeigt (1,5 °/s).
				// Der Mond fliegt schon vorher an – so, dass er den Strahl genau vorlauf Sekunden nach dem Auslösen kreuzt.
				const frei = st.aktiv ? st.feuerZeit + DAUER : t, dreh = (st.fehlerGrad ?? 0) / 1.5;
				zustand = 'anflug'; ts = t; tf = Math.max(t + 4, frei + dreh + 1.5); tc = tf + MOND.vorlauf; plan = null;
				gruppe.visible = true;
			}
			if (zustand === 'ruhe') return;
			if (zustand === 'anflug' && st.aktiv && st.feuerZeit >= tf - 1e-3) {   // Schuss ist raus: echte Achse → Schnittebene
				tc = st.feuerZeit + MOND.vorlauf;
				const d = st.d, v = mal(g.e2, MOND.v);
				const n = norm(kreuz(d, v));
				const C = g.bahn(0);
				// Strahlpunkt auf der Bahn der Mondmitte: Fußpunkt von C auf die Strahlgerade
				const X = plus(st.M, mal(d, punkt(minus(C, st.M), d)));
				plan = { n, v: norm(v), X, h: punkt(minus(X, C), n), d };
				zustand = 'schnitt';
			}
			const phi = g.omega * (t - tc);
			const C0 = g.bahn(phi), r = MOND.radius;
			const dauer = r / MOND.v, tg = tc + dauer;
			const ein = glatt((t - ts) / EINBLENDEN), aus = 1 - glatt((t - (tc + NACHLAUF - 1.5)) / 1.5);
			const groesse = r * ein * aus;
			const spin = SPIN * (t - ts);
			if (!plan) {   // Anflug: ganzer Mond (die beiden Hälften zeichnen zusammen die Kugel)
				rauch.schritt(z, null);
				for (const h of haelften) setzeAus(h, C0, groesse, spin, g.nPi, 0, g.X, g.e2, 0);
				for (const k of kappen) k.visible = false;
				return;
			}
			const tau = Math.max(0, t - tg), t0 = 0.8;
			const versatz = MOND.trennung * (tau - t0 * (1 - Math.exp(-tau / t0)));
			const naht = glatt((t - (tc - dauer)) / 0.15) * (1 - glatt((t - (tg + 6)) / 3));
			hitze.value = t < tc - dauer ? 0 : 5 * Math.exp(-Math.max(0, t - tg) / 2.2) + 0.12;
			const nahtBreite = 3 + 4 * glatt((t - tc) / 3);
			haelften.forEach((h, i) => {
				const s = h.s, C = plus(C0, mal(plan.n, s * versatz));
				const kipp = tau > 0 ? s * 0.03 * tau : 0;
				setzeAus(h, C, groesse, spin + kipp, plan.n, plan.h, plan.X, plan.v, naht);
				h.u.nahtBreite.value = nahtBreite;
				const k = kappen[i];
				k.visible = tau > 0 && ein * aus > 0.02;
				if (!k.visible) return;
				const a = Math.sqrt(Math.max(0, groesse * groesse - plan.h * plan.h));
				k.position.set(...plus(C, mal(plan.n, plan.h)));
				k.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v3(plan.n));
				k.scale.setScalar(a * 0.999);
			});
			const a = Math.sqrt(Math.max(0, groesse * groesse - plan.h * plan.h));
			rauch.schritt(z, groesse > 0.5 * r && t > tc - dauer ? { C: C0, a, n: plan.n, h: plan.h, X: plan.X, v: plan.v, vMond: mal(plan.v, MOND.v), rate: naht, schub: t >= tg } : null);
			if (t > tc + NACHLAUF) verstecke();
		},
		dispose() { rauch.dispose(); szene.remove(gruppe); geometrie.dispose(); kappe.dispose(); for (const h of haelften) h.mesh.material.dispose(); },
	};
}
