// Die Station als Körper der Welt: im Ursprung, in echter Größe, Waffenachse = +z des Modells.
//
// Zielen:   Soll-Ausrichtung = blickQuat(Ziel − Mündung, Welt-oben). Die Station dreht träge mit höchstens
//           ω_max = 1,5°/s (mathe/ausrichtung.js drehBegrenzt). Gefeuert wird nur, wenn sie ruhig auf das Ziel zeigt
//           (Restfehler < 0,05°); während des Schusses hält sie still. Darum ist der Strahl exakt gerade:
//           jedes Photon fliegt auf der Achse, die beim Aussenden galt, und diese Achse ändert sich im Schuss nicht.
// Ziele:    nacheinander verschiedene Punkte auf der der Station zugewandten Planetenseite (ZIELE, in Planetenradien).
// Ablauf:   station/ablauf.js (Laden, Blenden, Strahlleistung) – Rotoren, Blenden, Iris, Blitze, Lichter folgen ihm.
// Maßstab:  Modell ±6,65 Einheiten breit → km je Einheit = Stationsradius / 6,65.
// Waffe:    Austrittspunkt und Achse werden beim Laden am Modell gemessen (modell.js vermesseWaffe: Iris-Mitte,
//           Iris-Normale). Zielen dreht die gemessene Achse auf das Ziel: q = blickQuat(Ziel − Mündung) · q_korr,
//           q_korr = Drehung Achse → +z. Austritt M = S + q·(Mündung·Maßstab), Richtung d = q·Achse.
import * as THREE from 'three/webgpu';
import { ladeModell, vorwaermen, entsorge, MODELLE, MODELL_REIHE } from './modell.js';
import { erstelleBlitze } from './blitze.js';
import { erstelleLicht } from './licht.js';
import { ablauf, DAUER } from './ablauf.js';
import { PFADE } from '../../pfade.js';
import { blickQuat, drehBegrenzt, quatWinkel, drehe, quatMal, quatVonNach } from '../../mathe/ausrichtung.js';
import { kombi, minus, plus, mal } from '../../mathe/vektor.js';
import { lohntSich } from '../../kern/leitung.js';
import { leerlauf, bildruhe } from '../../kern/luft.js';

const HALBBREITE = 6.65;                 // Modell-Einheiten (aus den Grenzen des GLB)
const OMEGA_MAX = 1.5 * Math.PI / 180;   // rad/s
const RUHIG = 0.05 * Math.PI / 180;      // rad
const DREH_TROMMEL = -0.02618, DREH_RING = 0.064577;   // rad/s um +z (aus der Blender-Animation)
const ZIELE = [[0, 0], [0.32, 0.12], [-0.28, -0.18], [0.12, -0.34], [-0.36, 0.2], [0.24, 0.3]];   // (seite, oben) · R

/** Download und Dekodieren (Web-Worker) der kleinsten Modellstufe – kann starten, bevor Planet und Welt stehen. */
export function vorabStation(renderer, beiFortschritt) {
	return { blitze: fetch(PFADE.blitze).then((r) => r.json()), modell: ladeModell(renderer, 'niedrig', beiFortschritt) };
}

/** vorab: Ergebnis von vorabStation (sonst wird hier geladen). kompiliere: Shader im Ziel des Bildes übersetzen (gpu/bild.js) */
export async function erstelleStation({ renderer, szene, kamera, welt, stufe, beiFortschritt, vorab = null, kompiliere = null }) {
	const gruppe = new THREE.Group();
	gruppe.name = 'Station';
	const massstab = welt.stationRadius / HALBBREITE;
	gruppe.scale.setScalar(massstab);
	const v = vorab ?? vorabStation(renderer, beiFortschritt);
	const [blitzDaten, modell0] = await Promise.all([v.blitze, v.modell]);
	let modell = modell0;
	const blitze = {
		saeule: erstelleBlitze(blitzDaten.saeule, { amplitude: 0.13 / 2.35, feinheit: 1.1, dicke: 0.011, schein: 7, bogen: 0.38 }, stufe.blitz),
		waffe: erstelleBlitze(blitzDaten.waffe, { amplitude: 0.16 / 2.35, feinheit: 2.4, dicke: 0.016, schein: 3 }, Math.max(8, Math.round(stufe.blitz * 0.55))),
		plasma: erstelleBlitze(blitzDaten.plasma, { amplitude: 0.07 / 2.35, feinheit: 3.5, dicke: 0.014, schein: 4 }, Math.max(6, Math.round(stufe.blitz * 0.35))),
	};
	for (const b of Object.values(blitze)) gruppe.add(b.mesh);
	const schatten = (o) => o.traverse((k) => { if (k.isMesh && !k.isInstancedMesh && k.geometry && !k.geometry.isInstancedBufferGeometry) k.castShadow = k.receiveShadow = !!stufe.schatten; });
	schatten(modell.wurzel);
	gruppe.add(modell.wurzel);
	const licht = erstelleLicht(szene, gruppe, { lichter: stufe.lichter, schatten: stufe.schatten, stationRadius: welt.stationRadius });
	await vorwaermen(renderer, gruppe, kamera, szene, kompiliere);
	szene.add(gruppe);

	let quat = null, feuerZeit = -1e9, zielNr = 0, letzteSoll = null;
	const zustand = { M: [0, 0, 0], d: [0, 0, 1], leistung: 0, ladung: 0, aktiv: false, feuerZeit };
	const zielPunkt = (w) => { const [s, o] = ZIELE[zielNr % ZIELE.length]; return kombi(w.P, [s * w.R, w.seite], [o * w.R, w.oben]); };

	async function wechsleModell(name) {
		if (name === modell.stufe) return;
		const neu = await ladeModell(renderer, name);
		await bildruhe();
		schatten(neu.wurzel);
		await vorwaermen(renderer, neu.wurzel, kamera, szene, kompiliere);
		// Zustand der Rotoren übernehmen, dann in einem Bild tauschen
		neu.trommel?.rotation.copy(modell.trommel.rotation); neu.ring?.rotation.copy(modell.ring.rotation);
		gruppe.remove(modell.wurzel); gruppe.add(neu.wurzel);
		entsorge(modell.wurzel);
		modell = neu;
	}

	return {
		gruppe, zustand, massstab,
		get modellStufe() { return modell.stufe; },
		/** Besseres Modell nachladen, wenn Stufe es will und die Leitung es hergibt (gemessen, nicht geraten). */
		async nachladen(wunsch) {
			const ziel = MODELL_REIHE.indexOf(wunsch);
			for (let i = MODELL_REIHE.indexOf(modell.stufe) + 1; i <= ziel; i++) {
				if (!lohntSich(MODELLE[MODELL_REIHE[i]].bytes)) return;
				await leerlauf();
				await wechsleModell(MODELL_REIHE[i]);
			}
		},
		/** z: { dt, t, kapitel, kamera, hoehePx } */
		schritt(w, z) {
			// 1. Zielen (nicht während des Schusses)
			const lauf = ablauf(z.t - feuerZeit);
			const korr = quatVonNach(modell.achse, [0, 0, 1]);
			const M0 = drehe(quat ?? [0, 0, 0, 1], mal(modell.muendung, massstab));
			const ziel = z.kapitel.feuer && z.mond ? z.mond.ziel : zielPunkt(w);   // mit Mond: Planetenmitte (Strahl liegt in der Mondbahn-Ebene)
			const soll = quatMal(blickQuat(minus(ziel, plus(w.S, M0)), w.oben), korr);
			if (!quat) quat = soll;
			if (!lauf.aktiv) quat = drehBegrenzt(quat, soll, OMEGA_MAX, z.dt);
			letzteSoll = soll;
			gruppe.position.set(...w.S);
			gruppe.quaternion.set(...quat);

			// 2. Feuerplan des Kapitels
			const plan = z.kapitel.feuer;
			if (plan && !lauf.aktiv && z.t - (feuerZeit + DAUER) >= plan.pause && quatWinkel(quat, soll) < RUHIG
				&& (!z.mond || z.mond.freigabe(z.t))) {   // mit Mond: nur schießen, wenn er in ~8 s den Strahl kreuzt
				feuerZeit = z.t;
			}
			if (zustand.aktiv && !lauf.aktiv) zielNr++;   // Schuss vorbei: nächstes Ziel

			// 3. Mechanik: Rotoren, Blenden (45° offen bei bluete = 1), Iris
			const thetaT = DREH_TROMMEL * z.t;
			modell.trommel?.rotation.set(0, 0, thetaT);
			modell.ring?.rotation.set(0, 0, DREH_RING * z.t);
			const q = new THREE.Quaternion();
			for (const b of modell.blenden) b.o.quaternion.copy(b.ruhe).multiply(q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (Math.PI / 4) * lauf.bluete));
			if (modell.iris) modell.iris.material.emissiveIntensity = modell.irisBasis * (0.15 + 6 * lauf.ladung ** 2 + 8 * lauf.strahl) / 0.15;

			// 4. Blitze: Takt in Blender-Bildern (30/s); 1 Pixel = Abstand · pxWinkel (Modell-Einheiten über den Maßstab)
			const f = z.t * 30, l = lauf.ladung, pxWinkel = (2 * Math.tan((z.kamera.fov * Math.PI) / 360)) / z.hoehePx;
			const kern = 30 * (1 + 0.5 * l), schein = 3.2 * 0.3 * (1 + 0.6 * l);
			blitze.saeule.update({ takt: f / 10, fluss: f * 0.012, anteil: Math.min(0.9, 0.55 * (1 + 0.5 * l)), thetaT, ziel: blitzDaten.ziel, kern, schein, pxWinkel });
			blitze.waffe.update({ takt: f / 1.5 + 100, fluss: f / 1.5 + 100, anteil: Math.min(0.35, 0.5 * l * lauf.bluete), kern, schein, pxWinkel });
			blitze.plasma.update({ takt: f / 1.2 + 200, fluss: f / 1.2 + 200, anteil: Math.min(0.55, 0.3 + 0.3 * l), kern, schein, pxWinkel });
			licht.schritt(w, l, z.t, massstab);

			// 5. Für Strahl und Einschlag: Mündung und Achse in der Welt, Leistung jetzt
			const d = drehe(quat, modell.achse);
			Object.assign(zustand, { M: plus(w.S, drehe(quat, mal(modell.muendung, massstab))), d, muendungModell: modell.muendung, leistung: lauf.strahl, ladung: l, aktiv: lauf.aktiv, feuerZeit, fehlerGrad: (quatWinkel(quat, soll) * 180) / Math.PI });
			return zustand;
		},
		/** Ausrichtungsfehler in Grad (für Prüfungen) */
		get fehlerGrad() { return quat && letzteSoll ? (quatWinkel(quat, letzteSoll) * 180) / Math.PI : null; },
		dispose() { licht.dispose(); entsorge(modell.wurzel); for (const b of Object.values(blitze)) b.dispose(); szene.remove(gruppe); },
	};
}
