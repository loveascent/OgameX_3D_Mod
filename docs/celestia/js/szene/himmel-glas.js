// WebGPU-Ebene 1: Nebel/Sterne + Liquid-Glass-Titel (Shader: shader/himmel_glas.wgsl).
// Roh-WebGPU, kein three.js noetig: ein Vollbilddreieck, ein Uniform-Puffer, zwei Texturen (Schriftmasken).
import { baueTitelMasken } from './titel-maske.js';

const SHADER = new URL('./shader/himmel_glas.wgsl', import.meta.url);

export async function starteHimmelGlas(leinwand, { zeilen = ['WORLD OF', 'CELESTIA'] } = {}) {
	if (!navigator.gpu) throw new Error('kein WebGPU');
	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) throw new Error('kein WebGPU-Adapter');
	const geraet = await adapter.requestDevice();
	const ctx = leinwand.getContext('webgpu');
	const format = navigator.gpu.getPreferredCanvasFormat();
	ctx.configure({ device: geraet, format, alphaMode: 'opaque' });

	const code = await (await fetch(SHADER)).text();
	const modul = geraet.createShaderModule({ code });
	const info = await modul.getCompilationInfo();
	const fehler = info.messages.filter((m) => m.type === 'error');
	if (fehler.length) throw new Error('WGSL: ' + fehler.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join(' | '));

	const masken = await baueTitelMasken(zeilen);
	const textur = (cv) => {
		const t = geraet.createTexture({ size: [cv.width, cv.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
		geraet.queue.copyExternalImageToTexture({ source: cv }, { texture: t }, [cv.width, cv.height]);
		return t;
	};
	const tScharf = textur(masken.scharf), tHoehe = textur(masken.hoehe);
	const sampler = geraet.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
	const ubo = geraet.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

	const pipeline = geraet.createRenderPipeline({
		layout: 'auto',
		vertex: { module: modul, entryPoint: 'vs' },
		fragment: { module: modul, entryPoint: 'fs', targets: [{ format }] },
		primitive: { topology: 'triangle-list' },
	});
	const gruppe = geraet.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: ubo } },
			{ binding: 1, resource: sampler },
			{ binding: 2, resource: tScharf.createView() },
			{ binding: 3, resource: tHoehe.createView() },
		],
	});

	const z = { flug: 0, titel: 1, tempo: 0, waerme: 0, zeigerX: 0, zeigerY: 0 };
	const daten = new Float32Array(12);
	let w = 0, h = 0, dpr = 1;
	function groesse() {
		dpr = Math.min(devicePixelRatio || 1, 1.5);
		w = Math.max(2, Math.round(innerWidth * dpr)); h = Math.max(2, Math.round(innerHeight * dpr));
		if (leinwand.width !== w || leinwand.height !== h) { leinwand.width = w; leinwand.height = h; }
	}
	groesse(); addEventListener('resize', groesse);

	addEventListener('pointermove', (e) => { z.zielX = (e.clientX / innerWidth) * 2 - 1; z.zielY = (e.clientY / innerHeight) * 2 - 1; });

	let laeuft = true, letzte = 0;
	function bild(ms) {
		if (!laeuft) return;
		requestAnimationFrame(bild);
		// Nach dem Titel reichen 30 fps fuer den Hintergrund (schont die Onboard-GPU)
		if (z.titel < 0.01 && ms - letzte < 33) return;
		letzte = ms;
		z.zeigerX += ((z.zielX ?? 0) - z.zeigerX) * 0.06;
		z.zeigerY += ((z.zielY ?? 0) - z.zeigerY) * 0.06;
		const aspekt = w / h;
		daten.set([w, h, ms / 1000, z.flug, z.zeigerX, z.zeigerY, z.titel, aspekt, z.tempo, Math.min(1, aspekt / 1.95), z.waerme, 0]);
		geraet.queue.writeBuffer(ubo, 0, daten);
		const enc = geraet.createCommandEncoder();
		const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' }] });
		pass.setPipeline(pipeline); pass.setBindGroup(0, gruppe); pass.draw(3); pass.end();
		geraet.queue.submit([enc.finish()]);
	}
	requestAnimationFrame(bild);

	geraet.lost.then((i) => console.warn('Celestia: GPU-Geraet verloren', i.message));
	return { z, stop() { laeuft = false; }, geraet };
}
