// Prüft alle Kapitel rechnerisch (ohne Browser): wo Station und Planet im Bild liegen und wie groß sie sind.
// Bildlage x, y in −1 … 1 (mit Objektiv-Shift), Größe = Durchmesser / Bildhöhe.   node werkzeug/seite/kompositionen.mjs
const js = '../../docs/celestia2/js/';
const { KAPITEL } = await import(js + 'welt/kapitel.js'); const { erstelleWelt } = await import(js + 'welt/welt.js');
const { MASSE } = await import(js + 'welt/masse.js'); const v = await import(js + 'mathe/vektor.js');
const w = erstelleWelt(MASSE.planetRadius, 0.0649);
for (const e of KAPITEL) for (const [n, k] of [['quer', 16 / 9], ['hoch', 390 / 844]]) {
	const pos = e.auge(w), f = v.norm(v.minus(e.ziel(w, pos), pos)), r = v.norm(v.kreuz(f, [0, 1, 0])), o = v.kreuz(r, f);
	const T = Math.tan((e.fov[n] * Math.PI) / 360), sh = e.shift[n];
	const lage = (m, rad) => { const d = v.minus(m, pos), z = v.punkt(d, f), l = v.laenge(d);
		return `x ${(v.punkt(d, r) / (z * T * k) + sh[0]).toFixed(2)} y ${(v.punkt(d, o) / (z * T) + sh[1]).toFixed(2)} Gr ${((Math.tan(Math.asin(Math.min(1, rad / l))) / T)).toFixed(2)}`; };
	console.log(e.id.padEnd(9), n, 'Station:', lage(w.S, w.stationRadius).padEnd(24), 'Planet:', lage(w.P, w.R));
}
