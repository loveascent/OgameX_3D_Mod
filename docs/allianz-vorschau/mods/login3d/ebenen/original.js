// Ebene "Original": das alte Titelbild (Planet und Todesstern) steht sofort da, bis die lebenden Ebenen bereit sind.
// Das Bild ist Gameforge-Artwork (nur lokal genutzt, Urheberhinweis bleibt: assets/ und CREDITS.md).
export function zeigeOriginal(wirt) {
	const d = document.createElement('div');
	d.className = 'login3d-original';
	wirt.append(d);
	return { element: d, blendeAus(sekunden = 0.6) { d.style.transition = `opacity ${sekunden}s ease`; d.style.opacity = '0'; setTimeout(() => d.remove(), sekunden * 1000 + 80); } };
}
