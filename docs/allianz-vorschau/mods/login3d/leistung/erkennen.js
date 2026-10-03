// Geräteklasse erkennen: 'handy' | 'laptop' | 'rechner'. Nur ein Startwert – die Selbstregelung (regler.js)
// korrigiert nach unten, falls die Bildrate unter dem Ziel bleibt.
export async function erkenneGeraet() {
	const handy = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
	let adapter = null;
	try { adapter = navigator.gpu ? await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }) : null; } catch { /* kein WebGPU */ }
	const info = adapter?.info || {};
	const hersteller = String(info.vendor || '').toLowerCase();
	const bauart = String(info.architecture || '').toLowerCase();
	let klasse = handy ? 'handy' : 'laptop';
	if (!handy) {
		const stark = hersteller === 'nvidia' || /rdna-?[34]|ada|blackwell|lovelace|ampere/.test(bauart);
		if (stark && (navigator.hardwareConcurrency || 4) >= 8) klasse = 'rechner';
	}
	return { klasse, webgpu: !!adapter, hersteller, bauart, kerne: navigator.hardwareConcurrency || 0, speicherGB: navigator.deviceMemory || 0 };
}
