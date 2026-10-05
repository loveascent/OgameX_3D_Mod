// Ein GPU-Gerät für die ganze Seite: three.js und der Planeten-Simulator teilen es (ein Speicher, eine Warteschlange,
// keine Kopien zwischen zwei Geräten). Ohne WebGPU: three.js zeichnet mit WebGL 2, der Planet kommt dann als Ersatz.
//
// Tiefe: reversed-Z (1 = nah, 0 = fern). Gleitkommazahlen sind nahe 0 am feinsten – genau dort, wo bei großen
// Entfernungen die Tiefenwerte zusammenrücken. So passen 1 km und 500 000 km ohne Flackern in einen Tiefenpuffer.
import * as THREE from 'three/webgpu';

async function holeGeraet() {
	if (!navigator.gpu) return null;
	try {
		const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
		if (!adapter) return null;
		const L = adapter.limits;
		const device = await adapter.requestDevice({
			label: 'celestia2',
			requiredFeatures: [...adapter.features],   // komprimierte Texturen (KTX2) u. a. – was das Gerät kann
			requiredLimits: {   // der Simulator braucht große Speicherpuffer, three.js große Texturen
				maxStorageBufferBindingSize: L.maxStorageBufferBindingSize, maxBufferSize: L.maxBufferSize,
				maxTextureDimension2D: L.maxTextureDimension2D,
			},
		});
		device.lost.then((i) => console.warn('celestia2: GPU-Gerät verloren –', i.message));
		return { device, info: adapter.info };
	} catch (e) { console.warn('celestia2: kein WebGPU-Gerät –', e); return null; }
}

export async function erstelleRenderer(leinwand) {
	const { device = null, info = null } = (await holeGeraet()) ?? {};
	const renderer = new THREE.WebGPURenderer({
		canvas: leinwand, antialias: false, alpha: false, reversedDepthBuffer: true,
		...(device ? { device } : { forceWebGL: true }),
	});
	await renderer.init();
	renderer.setClearColor(0x000000, 0);
	renderer.toneMapping = THREE.NoToneMapping;   // Tonwert macht gpu/bild.js (dieselbe Kurve wie der Planet)
	const webgpu = !!renderer.backend.isWebGPUBackend;
	// info: welche Grafikkarte wirklich rechnet (Hersteller, Architektur) – wird in window.celestia.gpu gezeigt
	return { renderer, device: webgpu ? device : null, webgpu, info: info ? { hersteller: info.vendor, architektur: info.architecture, beschreibung: info.description } : null };
}
