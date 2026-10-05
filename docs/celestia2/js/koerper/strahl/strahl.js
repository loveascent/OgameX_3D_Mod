// Der Strahl: drei leuchtende Zylinder (Kern, Mantel, Schein) von der Mündung entlang der Waffenachse bis zum Planeten.
//
// Länge L = Abstand Mündung → Eintrittspunkt in das Ellipsoid (mathe/ellipsoid.js), im Körperrahmen gerechnet:
//   o = B·(M − P),  d_K = B·d   (B = Welt→Körper, Zeilen vom Planeten),  L = schnitt(o, d_K, R, f)
// Trifft die Achse nicht, läuft der Strahl bis zur Probenlänge (800 000 km) – er endet nicht künstlich.
// Radien in km aus dem Modell: 0,14 / 0,3 / 0,6 Modell-Einheiten × Maßstab der Station.
// Helligkeiten der Lagen wie im Blender-Material (14 / 3,5 / 0,18 bei voller Leistung).
import { vec4, color } from 'three/tsl';
import { strahlUniforms, zylinderLage } from './zylinder.js';
import { proben, RATE, N } from './verlauf.js';
import { glanzMischung } from '../../gpu/mischung.js';
import { schnitt } from '../../mathe/ellipsoid.js';
import { minus, punkt, plus, mal } from '../../mathe/vektor.js';
import { MASSE } from '../../welt/masse.js';

const LAGEN = [[0.14, [0.85, 0.95, 1], 14], [0.3, [0.25, 0.6, 1], 3.5], [0.6, [0.15, 0.45, 1], 0.18]];
const MAX_L = (N / RATE) * MASSE.c;

/** Achse in den Körperrahmen des Planeten: Zeilen z₀, z₁, z₂ von B */
export const inKoerper = (zeilen, v) => zeilen.map((z) => punkt(z, v));

export function treffer(welt, zeilen, M, d) {
	const t = schnitt(inKoerper(zeilen, minus(M, welt.P)), inKoerper(zeilen, d), welt.R, welt.f);
	return t === null ? null : { L: t, E: plus(M, mal(d, t)) };
}

export function erstelleStrahl(szene, massstab) {
	const u = strahlUniforms();
	const lagen = LAGEN.map(([r, farbe, hell]) => zylinderLage(u, r * massstab,
		(leistung, sehne, k) => vec4(color(...farbe).mul(leistung.mul(hell).mul(sehne).div(k)), 1), glanzMischung));
	for (const l of lagen) szene.add(l.mesh);
	const zustand = { L: MAX_L, E: null, an: false };

	return {
		u, zustand,
		/** st: Zustand der Station · planet: für die Körpermatrix · z: { t, kamera, hoehePx } */
		schritt(welt, st, planet, z) {
			const pr = proben(u.proben.array, z.t, st.feuerZeit);
			const an = pr.some((p) => p > 0.001);
			for (const l of lagen) l.mesh.visible = an;
			zustand.an = an;
			if (!an) return zustand;
			const h = treffer(welt, planet.koerper, st.M, st.d);
			zustand.L = h ? Math.min(h.L, MAX_L) : MAX_L; zustand.E = h?.E ?? null;
			u.M.value.set(...st.M); u.d.value.set(...st.d); u.L.value = zustand.L;
			u.px.value = (2 * Math.tan((z.kamera.fov * Math.PI) / 360)) / z.hoehePx;
			return zustand;
		},
		dispose() { for (const l of lagen) { szene.remove(l.mesh); l.mesh.material.dispose(); } },
	};
}
