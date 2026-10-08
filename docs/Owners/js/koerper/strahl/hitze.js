// Hitzeflimmern um den Strahl. Im Vakuum flimmert keine Luft – hier ist es das Plasma, das der Strahl aus der
// Mündung mitreißt: Brechzahl eines Plasmas n = √(1 − ω_p²/ω²) < 1, und die Elektronendichte schwankt.
// Umsetzung: eine Hülle (Zylinder, 3× Scheinradius) schreibt nur in den Alpha-Kanal (gpu/mischung.js hitzeMischung):
//   Hitze = 0,35 · Leistung(s) · Sehne / k    (dieselbe Leistung entlang der Achse wie der Strahl)
// gpu/bild.js verschiebt dort die Abtastung des Hintergrunds um Hitze · Rauschen (Brechung).
// Die Hülle teilt die Uniforms des Strahls, also Lage, Länge und Zeitverlauf – sie kann nicht „daneben“ liegen.
import { vec4, float } from 'three/tsl';
import { zylinderLage } from './zylinder.js';
import { hitzeMischung } from '../../gpu/mischung.js';

export function erstelleHitze(szene, strahl, massstab) {
	const lage = zylinderLage(strahl.u, 0.6 * 3 * massstab,
		(leistung, sehne, k) => vec4(0, 0, 0, float(0.35).mul(leistung).mul(sehne).div(k)), hitzeMischung);
	szene.add(lage.mesh);
	return {
		schritt() { lage.mesh.visible = strahl.zustand.an; },
		dispose() { szene.remove(lage.mesh); lage.mesh.material.dispose(); },
	};
}
