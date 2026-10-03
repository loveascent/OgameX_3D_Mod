// Standbild des letzten Himmels über Seitenwechsel hinweg (das Spiel lädt bei jedem Klick eine neue Seite):
// ein kleines JPEG in sessionStorage. Die nächste Seite zeigt es sofort (vorab.js, noch vor dem ersten Zeichnen) und blendet
// dann auf den lebenden Himmel über. Die Bewegung selbst hängt nicht daran – sie ist eine Funktion der absoluten Uhrzeit.
const KEY = 'ogx.himmel';

/** Muss im selben Arbeitsgang wie das Zeichnen aufgerufen werden (WebGPU-Leinwand sonst leer). */
export function speichereStand(leinwand, sek) {
	try {
		const k = document.createElement('canvas');
		k.width = 768; k.height = Math.max(1, Math.round(768 * leinwand.height / leinwand.width));
		const g = k.getContext('2d');
		g.drawImage(leinwand, 0, 0, k.width, k.height);
		// leeres/schwarzes Bild nie speichern (sonst blitzt es beim nächsten Seitenaufruf schwarz)
		const p = g.getImageData(0, 0, k.width, k.height).data; let s = 0;
		for (let i = 0; i < p.length; i += 4 * 997) s += p[i] + p[i + 1] + p[i + 2];
		if (s < 300) return;
		sessionStorage.setItem(KEY, JSON.stringify({ t: sek, wall: Date.now(), bild: k.toDataURL('image/jpeg', 0.78) }));
	} catch { /* privat oder voll: dann eben ohne Standbild */ }
}
