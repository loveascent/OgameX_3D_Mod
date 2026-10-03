// Schriftmasken fuer den Glas-Titel (2048 x 1024, Karte deckt 2.0 x 1.0 Welteinheiten):
//   scharf = Buchstabenform,  hoehe = weichgezeichnete Form (daraus rechnet der Shader die Glas-Normalen).
const B = 2048, H = 1024;

export async function baueTitelMasken(zeilen) {
	const schrift = '900 {S}px "Segoe UI Black","Arial Black","Helvetica Neue",Arial,sans-serif';
	try { await document.fonts.load(schrift.replace('{S}', '200'), zeilen.join(' ')); } catch { /* Systemschrift */ }

	const zeichne = (blur) => {
		const c = document.createElement('canvas'); c.width = B; c.height = H;
		const g = c.getContext('2d');
		g.fillStyle = '#000'; g.fillRect(0, 0, B, H);
		// Schriftgroesse so, dass die breiteste Zeile ~84 % der Breite fuellt, hoechstens zwei Zeilen
		let s = 330; g.font = schrift.replace('{S}', s); g.letterSpacing = (s * 0.04) + 'px';
		const breit = Math.max(...zeilen.map((z) => g.measureText(z).width));
		s = Math.floor(s * Math.min(1, (B * 0.84) / breit));
		g.font = schrift.replace('{S}', s); g.letterSpacing = (s * 0.04) + 'px';
		g.textAlign = 'center'; g.textBaseline = 'middle';
		g.fillStyle = '#fff';
		if (blur) g.filter = `blur(${blur}px)`;
		const zh = s * 0.98, y0 = H / 2 - ((zeilen.length - 1) * zh) / 2;
		zeilen.forEach((z, i) => g.fillText(z, B / 2 + (s * 0.04) / 2, y0 + i * zh));
		return c;
	};
	return { scharf: zeichne(0), hoehe: zeichne(16) };
}
