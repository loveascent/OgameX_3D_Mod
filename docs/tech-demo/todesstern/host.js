// Todesstern als Login-Ebene. Adresse: host.html?stufe=niedrig|mittel|hoch&dpr=1.5&fps=60
// Nachrichten an den Login (parent): { todesstern: 'geladen' | 'bereit' | 'fps', wert }
// Nachrichten vom Login:             { layout: {station:{x,y,breite}, planet:{x,y,radius}} }  (jederzeit, auch bei Resize)
//                                    { feuer: true }
import * as THREE from 'three/webgpu';
import { pass, texture3D, log2, max, clamp, vec4, float } from 'three/tsl';
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ladeTodesstern, szeneEinrichten, ladeLut, LUT, STUFEN, ABGLEICH } from './todesstern.js';
import { anordnen } from './anordnung.js';

const q = new URLSearchParams(location.search);
const stufe = STUFEN[q.get('stufe')] ? q.get('stufe') : 'mittel';
const S = STUFEN[stufe];
const fpsMax = +q.get('fps') || 60;
let dpr = Math.min(+q.get('dpr') || devicePixelRatio, S.dpr);
const melde = (todesstern, wert) => { try { parent.postMessage({ todesstern, wert }, location.origin); } catch { /* ohne Elternfenster */ } };

const renderer = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance' });
await renderer.init();
renderer.toneMapping = THREE.NoToneMapping;           // Tonwert über die Blender-LUT (s. u.)
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOV = 30;
const kamera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 4000);
const lichtFolgt = szeneEinrichten(scene, kamera, { stufe, renderer, ohneHimmel: true });

const ts = await ladeTodesstern(renderer, { stufe, basis: './' });
scene.add(ts.gruppe);
const huelle = new THREE.Box3().setFromObject(ts.gruppe).getBoundingSphere(new THREE.Sphere());
const stationR = huelle.radius;
// Nachbearbeitung wie ansicht.html: Bloom + Blender-Farbtransformation (LUT)
const pipeline = new THREE.RenderPipeline(renderer);
const szenePass = pass(scene, kamera);
szenePass.setResolutionScale(S.szene);
const farbe = szenePass.getTextureNode('output');
const glanz = S.bloom ? bloom(farbe.min(6), ABGLEICH.bloomStaerke, ABGLEICH.bloomRadius, 1.6) : null;
const hdr = glanz ? farbe.add(glanz) : farbe;
const lutTex = await ladeLut('./');
const logv = clamp(log2(max(hdr.rgb, 1e-10).div(0.18)).sub(LUT.min).div(LUT.max - LUT.min), 0, 1);
pipeline.outputColorTransform = false;
pipeline.outputNode = lut3D(vec4(logv, 1), texture3D(lutTex), LUT.n, float(1));

// Anordnung (Anteile von Fenster) – kommt vom Login; bis dahin nichts zeichnen
let layout = null, erstesBild = false, strahlFaktor = 1;
function legeAus() {
	if (!layout) return;
	const W = innerWidth, H = innerHeight;
	kamera.aspect = W / H; kamera.fov = FOV; kamera.updateProjectionMatrix();
	renderer.setSize(W, H);
	const a = anordnen({ W, H, fov: FOV, stationR, layout });
	// Station bleibt im Ursprung (Licht und Schatten der Szene gehen davon aus); stattdessen steht die Kamera
	// dort, von wo die berechnete Anordnung (Station bei stationPos, gedreht um quat) so aussähe.
	const M = new THREE.Matrix4().compose(a.stationPos, a.quat, new THREE.Vector3(1, 1, 1));
	const camW = M.invert().multiply(new THREE.Matrix4().makeTranslation(0, 0, a.dist));
	camW.decompose(kamera.position, kamera.quaternion, kamera.scale);
	kamera.up.set(0, 1, 0).applyQuaternion(kamera.quaternion);
	ts.zustand.strahlMax = a.strahlMax * strahlFaktor;
	kamera.far = a.dist * 20; kamera.updateProjectionMatrix();
}
addEventListener('resize', legeAus);

const uhr = new THREE.Timer();
addEventListener('message', (e) => {
	if (e.origin !== location.origin) return;
	const d = e.data || {};
	if (d.layout) { layout = d.layout; legeAus(); }
	if (d.feuer) ts.feuer(uhr.getElapsed());
	if (d.strahlFaktor) { strahlFaktor = d.strahlFaktor; legeAus(); }
	if ('halte' in d) ts.zustand.halte = !!d.halte;   // Tech Demo: Strahl stehen lassen, bis der Mond geteilt ist
});

melde('geladen');   // erst jetzt: Nachrichtenhorcher steht, der Login darf die Anordnung schicken

// Bildschleife mit Bildratenbegrenzung, Messung alle 60 Bilder
let letzt = 0, mess = [];
renderer.setAnimationLoop((zeit) => {
	if (!layout) return;
	if (fpsMax && zeit - letzt < 1000 / fpsMax - 2) return;
	const dt = zeit - letzt; letzt = zeit;
	uhr.update(zeit);
	lichtFolgt();
	ts.update(uhr.getElapsed(), kamera, renderer.domElement.height / renderer.getPixelRatio() * dpr);
	pipeline.render();
	if (!erstesBild) { erstesBild = true; melde('bereit'); }
	if (dt > 0 && dt < 500) mess.push(dt);
	if (mess.length >= 60) {
		mess.sort((a, b) => a - b);
		melde('fps', 1000 / mess[30]);
		mess = [];
	}
});
