// Mischarten für Leuchten und Hitze – passend zur Kanal-Belegung in gpu/bild.js.
//   glanz:  Farbe wird addiert (Licht addiert sich), Alpha bleibt  → Quelle·1 + Ziel,  α: 0·α_Q + 1·α_Z
//   hitze:  nur Alpha wird addiert (Hitzemenge), Farbe bleibt       → Quelle·0 + Ziel,  α: 1·α_Q + 1·α_Z
import * as THREE from 'three/webgpu';

function setze(m, srcF, srcA) {
	m.blending = THREE.CustomBlending;
	m.blendEquation = m.blendEquationAlpha = THREE.AddEquation;
	m.blendSrc = srcF; m.blendDst = THREE.OneFactor;
	m.blendSrcAlpha = srcA; m.blendDstAlpha = THREE.OneFactor;
	m.premultipliedAlpha = false;
	return m;
}
export const glanzMischung = (m) => setze(m, THREE.OneFactor, THREE.ZeroFactor);
export const hitzeMischung = (m) => setze(m, THREE.ZeroFactor, THREE.OneFactor);
