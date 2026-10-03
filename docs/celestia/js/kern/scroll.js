// Scroll-Fortschritt 0..1 mit sanftem Nachziehen (filmisch statt ruckelnd). ?p=0.5 setzt zum Testen einen festen Wert.
export function starteScroll(beiBild) {
	const fest = new URLSearchParams(location.search).get('p');
	let ziel = 0, p = 0, alt = performance.now();
	const lies = () => {
		const max = document.documentElement.scrollHeight - innerHeight;
		ziel = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
	};
	addEventListener('scroll', lies, { passive: true }); addEventListener('resize', lies); lies();
	if (fest !== null) { p = ziel = Number(fest); }
	function takt(jetzt) {
		const dt = Math.min(0.1, (jetzt - alt) / 1000); alt = jetzt;
		if (fest === null) p += (ziel - p) * (1 - Math.exp(-dt * 5.5));
		beiBild(p, jetzt / 1000);
		requestAnimationFrame(takt);
	}
	requestAnimationFrame(takt);
	return { get p() { return p; }, springe(x) { const max = document.documentElement.scrollHeight - innerHeight; scrollTo({ top: x * max, behavior: 'smooth' }); } };
}
