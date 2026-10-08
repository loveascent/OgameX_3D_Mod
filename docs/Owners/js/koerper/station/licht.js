// Licht an der Station – eine Sonne für die ganze Welt, dazu was physikalisch noch ankommt:
//   Sonne        gerichtetes Licht aus welt.sonne (dieselbe Richtung wie im Planeten-Shader)
//   Planetenschein  vom Planeten zurückgeworfenes Sonnenlicht. Beleuchtungsstärke relativ zur Sonne:
//                E_P / E_S = A · (R/d)² · Φ(α),   Φ(α) = ((π − α)cos α + sin α)/π   (Lambert-Kugel, Phasenwinkel α)
//                A = 0,5 (Albedo Jupiter), d = Abstand Planetenmitte. Bei 6,5 R: höchstens ~1,2 % der Sonne.
//   Sternlicht   sehr schwaches Umgebungslicht (sonst wäre die Nachtseite der Station reines Schwarz)
//   Emitter      bläuliche Punktlichter im Blitzraum; Anzahl je Qualitätsstufe. Positionen aus dem Blender-Modell
//                (Blender-Achsen → glTF: (x, y, z) ↦ (x, z, −y)), Helligkeit flackert wie die Blitze.
import * as THREE from 'three/webgpu';
import { minus, laenge, norm, punkt } from '../../mathe/vektor.js';

const SONNE_LUX = 3.2, ALBEDO = 0.5, STERNLICHT = 0.05;
const EMITTER = [[2.256, -1.1, 0.449], [-2.256, 0.8, -0.449], [1.278, 0.8, 1.912], [-1.278, -1.1, -1.912],
	[-0.449, -1.1, 2.256], [0.449, 0.8, -2.256], [-1.912, 0.8, 1.278], [1.912, -1.1, -1.278]].map(([x, y, z]) => [x, z, -y]);

export function erstelleLicht(szene, gruppe, { lichter, schatten, stationRadius }) {
	const sonne = new THREE.DirectionalLight(0xfff2e0, SONNE_LUX);
	const schein = new THREE.DirectionalLight(0xf0c9a0, 0);
	const stern = new THREE.AmbientLight(0x8aa4ff, STERNLICHT);
	szene.add(sonne, sonne.target, schein, schein.target, stern);
	if (schatten) {
		sonne.castShadow = true;
		sonne.shadow.mapSize.set(schatten, schatten);
		const c = sonne.shadow.camera, r = stationRadius * 1.25;
		c.left = c.bottom = -r; c.right = c.top = r; c.near = r * 0.2; c.far = r * 6;
		sonne.shadow.bias = -0.0005; sonne.shadow.normalBias = 0.02;
	}
	const punkte = EMITTER.slice(0, lichter).map((p) => {
		const l = new THREE.PointLight(0x2f9eff, 0, 0, 2);
		l.position.set(...p);
		gruppe.add(l);
		return l;
	});

	return {
		/** welt: Lage von Sonne und Planet · ladung: 0…1 · zeit: s · massstab: km je Modell-Einheit */
		schritt(welt, ladung, zeit, massstab) {
			sonne.position.set(...welt.sonne.map((k) => k * stationRadius * 3)); sonne.target.position.set(...welt.S);
			const zumPlanet = minus(welt.P, welt.S), d = laenge(zumPlanet), richtung = norm(zumPlanet);
			const alpha = Math.acos(Math.max(-1, Math.min(1, punkt(welt.sonne, richtung.map((k) => -k)))));   // Sonne–Planet–Station
			const phi = ((Math.PI - alpha) * Math.cos(alpha) + Math.sin(alpha)) / Math.PI;
			schein.intensity = SONNE_LUX * ALBEDO * (welt.R / d) ** 2 * Math.max(phi, 0);
			schein.position.set(...richtung.map((k) => k * stationRadius * 3)); schein.target.position.set(...welt.S);
			// Punktlicht mit Abfall 1/r²: Weltabstände sind massstab-mal größer → Stärke · massstab²
			punkte.forEach((l, i) => { l.intensity = (1 + 0.7 * ladung) * (240 + 170 * Math.sin(zeit * 27.9 + 1.7 * i) * Math.sin(zeit * 12.3 + 0.8 * i)) / (4 * Math.PI) * (16 / punkte.length) * 0.15 * massstab ** 2; });
		},
		dispose() { szene.remove(sonne, sonne.target, schein, schein.target, stern); for (const l of punkte) l.removeFromParent(); },
	};
}
