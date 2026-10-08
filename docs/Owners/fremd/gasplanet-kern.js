// GEBAUT von werkzeug/gasplanet/bauen.mjs (Gasplanet-Simulation, Stand d8d1537, Apache-2.0). Nicht von Hand ändern.
const K = `// Gemeinsame Bausteine für alle Compute-Shader.\r
// Alle Felder liegen als Cubemap (6 Ebenen) auf der Einheitskugel.\r
// Vektoren (Wind) werden als 3D-Tangentialvektoren in Körperkoordinaten gespeichert,\r
// dadurch gibt es keine Pol-Singularität und keine Sonderfälle an Würfelkanten.\r
\r
const PI = 3.14159265359;\r
const MAX_STORMS = 16u;\r
\r
struct Sim {\r
  dt: f32, time: f32, frame: f32, velN: f32,\r
  dyeN: f32, flowN: f32, vortexStrength: f32, omega: f32,\r
  jetStrength: f32, jetRelax: f32, turbulence: f32, turbScale: f32,\r
  confinement: f32, drag: f32, fineStripes: f32, bfecc: f32,\r
  bandRelax: f32, convection: f32, stormStrength: f32, stormCount: f32,\r
  curlStrength: f32, curlFreq: f32, curlSpeed: f32, curlOctaves: f32,\r
  particleCount: f32, lifetime: f32, opacity: f32, blur: f32,\r
  seed: f32, bandWobble: f32, stormTint: f32, vortexCount: f32,\r
  cloud: vec4f,                 // Farbe aufsteigender Konvektionswolken (linear RGB)\r
  centre: vec4f,                // Partikel-Schiene: rgb Mittelfarbe, zu der die Textur verblasst; w Verblass-Rate (1/s)\r
  view: vec4f,                  // xyz Kamerarichtung in Körperkoordinaten, w Anteil der Partikel im Sichtfeld\r
  mode: vec4f,                  // x 1 = reine Partikel (jasper-r), y Strudel-Antrieb (Geschwindigkeit), zw frei\r
  jets: array<vec4f, 16>,       // 64 Stützstellen, Breite −90°..+90°, Einheit rad/s bei jetStrength 1\r
  bands: array<vec4f, 64>,      // Bandfarbe (linear RGB) je Breite\r
  storms: array<vec4f, 16>,     // xyz Zentrum (Körperkoordinaten), w Radius in rad\r
  stormInfo: array<vec4f, 16>,  // x Drehsinn·Stärke, yzw Farbe\r
  stormWeight: array<vec4f, 4>, // wie stark jeder Sturm gerade angetrieben wird (0 = frei)\r
};\r
\r
@group(0) @binding(0) var<uniform> S: Sim;\r
\r
// ---------- Cubemap-Abbildung (WebGPU-Konvention: +X −X +Y −Y +Z −Z) ----------\r
\r
fn faceDir(face: u32, st: vec2f) -> vec3f {\r
  let a = st.x * 2.0 - 1.0;\r
  let b = st.y * 2.0 - 1.0;\r
  switch face {\r
    case 0u: { return normalize(vec3f(1.0, -b, -a)); }\r
    case 1u: { return normalize(vec3f(-1.0, -b, a)); }\r
    case 2u: { return normalize(vec3f(a, 1.0, b)); }\r
    case 3u: { return normalize(vec3f(a, -1.0, -b)); }\r
    case 4u: { return normalize(vec3f(a, -b, 1.0)); }\r
    default: { return normalize(vec3f(-a, -b, -1.0)); }\r
  }\r
}\r
\r
// Richtung -> (st in [0,1]², Fläche) ohne Begrenzung.\r
fn cubeUV(d: vec3f) -> vec3f {\r
  let ad = abs(d);\r
  var face = 0.0; var sc = 0.0; var tc = 0.0; var ma = 1.0;\r
  if (ad.x >= ad.y && ad.x >= ad.z) {\r
    ma = ad.x;\r
    if (d.x > 0.0) { face = 0.0; sc = -d.z; } else { face = 1.0; sc = d.z; }\r
    tc = -d.y;\r
  } else if (ad.y >= ad.z) {\r
    ma = ad.y;\r
    if (d.y > 0.0) { face = 2.0; tc = d.z; } else { face = 3.0; tc = -d.z; }\r
    sc = d.x;\r
  } else {\r
    ma = ad.z;\r
    if (d.z > 0.0) { face = 4.0; sc = d.x; } else { face = 5.0; sc = -d.x; }\r
    tc = -d.y;\r
  }\r
  return vec3f(vec2f(sc, tc) / ma * 0.5 + 0.5, face);\r
}\r
\r
// Nahtloses bilineares Abtasten der Würfelfelder.\r
// Gemessen: das Hardware-Abtasten über Würfelkanten weicht bis zu 500-mal stärker ab als im\r
// Flächeninneren. Weil die Farbe jeden Schritt neu abgetastet wird, wachsen daraus Narben.\r
// Darum: im Inneren tastet die Hardware ab (dort exakt); nahe der Kante werden die vier\r
// Nachbar-Texel einzeln geholt, Texel jenseits der Kante über ihre Richtung auf der Nachbarfläche.\r
fn loadDir(t: texture_2d_array<f32>, s: sampler, q: vec3f) -> vec4f {\r
  let u = cubeUV(q);\r
  return textureSampleLevel(t, s, u.xy, i32(u.z), 0.0);\r
}\r
\r
fn sampleCube(t: texture_2d_array<f32>, s: sampler, p: vec3f) -> vec4f {\r
  let n = f32(textureDimensions(t).x);\r
  let u = cubeUV(p);\r
  let x = u.xy * n - 0.5;\r
  if (all(x >= vec2f(0.0)) && all(x <= vec2f(n - 1.0))) {\r
    return textureSampleLevel(t, s, u.xy, i32(u.z), 0.0);\r
  }\r
  let i0 = floor(x);\r
  let f = x - i0;\r
  let face = u32(u.z);\r
  var c: array<vec4f, 4>;\r
  for (var k = 0u; k < 4u; k++) {\r
    let ij = i0 + vec2f(f32(k & 1u), f32(k >> 1u));\r
    if (all(ij >= vec2f(0.0)) && all(ij <= vec2f(n - 1.0))) {\r
      c[k] = textureLoad(t, vec2i(ij), i32(face), 0);\r
    } else {\r
      c[k] = loadDir(t, s, faceDir(face, (ij + 0.5) / n));\r
    }\r
  }\r
  return mix(mix(c[0], c[1], f.x), mix(c[2], c[3], f.x), f.y);\r
}\r
\r
// Richtung -> (Fläche, Texel) für Schreibzugriffe aus Partikeln.\r
fn dirToTexel(d: vec3f, n: u32) -> vec3u {\r
  let ad = abs(d);\r
  var face = 0u; var sc = 0.0; var tc = 0.0; var ma = 1.0;\r
  if (ad.x >= ad.y && ad.x >= ad.z) {\r
    ma = ad.x;\r
    if (d.x > 0.0) { face = 0u; sc = -d.z; } else { face = 1u; sc = d.z; }\r
    tc = -d.y;\r
  } else if (ad.y >= ad.z) {\r
    ma = ad.y;\r
    if (d.y > 0.0) { face = 2u; tc = d.z; } else { face = 3u; tc = -d.z; }\r
    sc = d.x;\r
  } else {\r
    ma = ad.z;\r
    if (d.z > 0.0) { face = 4u; sc = d.x; } else { face = 5u; sc = -d.x; }\r
    tc = -d.y;\r
  }\r
  let st = clamp(vec2f(sc, tc) / ma * 0.5 + 0.5, vec2f(0.0), vec2f(0.99999));\r
  let px = vec2u(st * f32(n));\r
  return vec3u(px, face);\r
}\r
\r
// Orthonormale Tangentenbasis. Die Wahl darf von Punkt zu Punkt springen,\r
// weil Divergenz, Laplace und Gradient unabhängig von der Basisdrehung sind.\r
fn tangentBasis(p: vec3f) -> mat2x3f {\r
  let helper = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(p.y) < 0.9);\r
  let e1 = normalize(cross(helper, p));\r
  let e2 = cross(p, e1);\r
  return mat2x3f(e1, e2);\r
}\r
\r
fn east(p: vec3f) -> vec3f {\r
  let e = cross(vec3f(0.0, 1.0, 0.0), p);\r
  let l = length(e);\r
  return select(vec3f(1.0, 0.0, 0.0), e / l, l > 1e-5);\r
}\r
\r
fn latitude(p: vec3f) -> f32 { return asin(clamp(p.y, -1.0, 1.0)); }\r
\r
fn stepOn(p: vec3f, v: vec3f) -> vec3f { return normalize(p + v); }\r
\r
fn tangent(p: vec3f, v: vec3f) -> vec3f { return v - p * dot(p, v); }\r
\r
// ---------- Tabellen ----------\r
\r
fn jetAt(lat: f32) -> f32 {\r
  let x = clamp((lat / PI + 0.5) * 63.0, 0.0, 63.0);\r
  let i = u32(floor(x));\r
  let j = min(i + 1u, 63u);\r
  let a = S.jets[i / 4u][i % 4u];\r
  let b = S.jets[j / 4u][j % 4u];\r
  return mix(a, b, fract(x)) * S.jetStrength;\r
}\r
\r
fn bandAt(lat: f32) -> vec3f {\r
  let x = clamp((lat / PI + 0.5) * 63.0, 0.0, 63.0);\r
  let i = u32(floor(x));\r
  let j = min(i + 1u, 63u);\r
  return mix(S.bands[i].rgb, S.bands[j].rgb, fract(x));\r
}\r
\r
// ---------- Zufall und Rauschen ----------\r
\r
fn pcg3d(v0: vec3u) -> vec3u {\r
  var v = v0 * 1664525u + 1013904223u;\r
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;\r
  v ^= v >> vec3u(16u);\r
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;\r
  return v;\r
}\r
\r
fn hash3(i: vec3f) -> vec3f {\r
  let h = pcg3d(bitcast<vec3u>(vec3i(i)));\r
  return vec3f(h) * (2.0 / 4294967295.0) - 1.0;\r
}\r
\r
fn rand4(a: u32, b: u32) -> vec4f {\r
  let h = pcg3d(vec3u(a, b, 0x9e3779b9u));\r
  let g = pcg3d(h.zxy ^ vec3u(b, a, 7u));\r
  return vec4f(vec3f(h), f32(g.x)) / 4294967295.0;\r
}\r
\r
// Gradientenrauschen mit analytischer Ableitung: x = Wert, yzw = Gradient.\r
fn noised(x: vec3f) -> vec4f {\r
  let i = floor(x);\r
  let f = fract(x);\r
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);\r
  let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);\r
\r
  let ga = hash3(i + vec3f(0.0, 0.0, 0.0));\r
  let gb = hash3(i + vec3f(1.0, 0.0, 0.0));\r
  let gc = hash3(i + vec3f(0.0, 1.0, 0.0));\r
  let gd = hash3(i + vec3f(1.0, 1.0, 0.0));\r
  let ge = hash3(i + vec3f(0.0, 0.0, 1.0));\r
  let gf = hash3(i + vec3f(1.0, 0.0, 1.0));\r
  let gg = hash3(i + vec3f(0.0, 1.0, 1.0));\r
  let gh = hash3(i + vec3f(1.0, 1.0, 1.0));\r
\r
  let va = dot(ga, f - vec3f(0.0, 0.0, 0.0));\r
  let vb = dot(gb, f - vec3f(1.0, 0.0, 0.0));\r
  let vc = dot(gc, f - vec3f(0.0, 1.0, 0.0));\r
  let vd = dot(gd, f - vec3f(1.0, 1.0, 0.0));\r
  let ve = dot(ge, f - vec3f(0.0, 0.0, 1.0));\r
  let vf = dot(gf, f - vec3f(1.0, 0.0, 1.0));\r
  let vg = dot(gg, f - vec3f(0.0, 1.0, 1.0));\r
  let vh = dot(gh, f - vec3f(1.0, 1.0, 1.0));\r
\r
  let k0 = va;\r
  let k1 = vb - va;\r
  let k2 = vc - va;\r
  let k3 = ve - va;\r
  let k4 = va - vb - vc + vd;\r
  let k5 = va - vc - ve + vg;\r
  let k6 = va - vb - ve + vf;\r
  let k7 = -va + vb + vc - vd + ve - vf - vg + vh;\r
\r
  let value = k0 + u.x * k1 + u.y * k2 + u.z * k3 + u.x * u.y * k4 + u.y * u.z * k5\r
            + u.z * u.x * k6 + u.x * u.y * u.z * k7;\r
\r
  let grad = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.z * (ge - ga)\r
           + u.x * u.y * (ga - gb - gc + gd) + u.y * u.z * (ga - gc - ge + gg)\r
           + u.z * u.x * (ga - gb - ge + gf) + u.x * u.y * u.z * (-ga + gb + gc - gd + ge - gf - gg + gh)\r
           + du * (vec3f(k1, k2, k3) + u.yzx * vec3f(k4, k5, k6) + u.zxy * vec3f(k6, k4, k5)\r
                   + u.yzx * u.zxy * k7);\r
  return vec4f(value, grad);\r
}\r
\r
// Divergenzfreies Rauschfeld auf der Kugel: v = p × ∇ψ (ψ = FBM-Rauschen als Stromfunktion).\r
fn curlOnSphere(p: vec3f, freq: f32, t: f32, octaves: i32) -> vec3f {\r
  var g = vec3f(0.0);\r
  var amp = 1.0;\r
  var fr = freq;\r
  for (var o = 0; o < octaves; o++) {\r
    let off = vec3f(f32(o) * 17.3, t * (1.0 + 0.37 * f32(o)), f32(o) * -9.1);\r
    g += noised(p * fr + off).yzw * amp * fr / freq;\r
    amp *= 0.5;\r
    fr *= 2.03;\r
  }\r
  return cross(p, g);\r
}\r
\r
fn stormW(i: u32) -> f32 { return S.stormWeight[i / 4u][i % 4u]; }\r
\r
// Drehfeld der angetriebenen Stürme: Rotation um das Zentrum, Gauß-Profil.\r
fn stormFlow(p: vec3f) -> vec3f {\r
  var v = vec3f(0.0);\r
  let n = u32(S.stormCount);\r
  for (var i = 0u; i < min(n, MAX_STORMS); i++) {\r
    let c = S.storms[i].xyz;\r
    let r = S.storms[i].w;\r
    let d = acos(clamp(dot(c, p), -1.0, 1.0));\r
    let x = d / r;\r
    // Geschwindigkeit ~ x·exp(−x²): null im Kern, Maximum am Rand, dann Abfall.\r
    let prof = x * exp(-x * x) * 2.33;\r
    v += cross(c, p) / max(sin(d), 1e-4) * prof * S.stormInfo[i].x * stormW(i);\r
  }\r
  return v * S.stormStrength;\r
}\r
\r
// scale: Maskenradius relativ zum Sturmradius\r
fn stormMask(p: vec3f, scale: f32) -> vec4f {\r
  var tint = vec3f(0.0);\r
  var w = 0.0;\r
  let n = u32(S.stormCount);\r
  for (var i = 0u; i < min(n, MAX_STORMS); i++) {\r
    let c = S.storms[i].xyz;\r
    let r = S.storms[i].w;\r
    let d = acos(clamp(dot(c, p), -1.0, 1.0));\r
    let m = exp(-pow(d / (r * scale), 2.0)) * stormW(i);\r
    tint += S.stormInfo[i].yzw * m;\r
    w += m;\r
  }\r
  return vec4f(tint / max(w, 1e-4), min(w, 1.0));\r
}\r
`, _e = `// Stable Fluids (Stam 1999) auf der Kugel.\r
// Ablauf pro Schritt: advect -> curl -> zonalClear/zonalSum -> forces -> divergence -> jacobi×K -> project.\r
//\r
// Ableitungen: Nachbarn sind die echten Nachbarzellen des Würfelgitters. Ihre Richtungen\r
// kommen aus der Flächenparametrisierung (auch über die Flächenkante hinaus, dann landet\r
// die Abtastung nahtlos auf der Nachbarfläche). Weil die Zellen des Würfelgitters nicht\r
// gleich groß und nicht rechtwinklig sind, wird der Gradient aus einem 2×2-System mit den\r
// tatsächlichen Abstandsvektoren gelöst. Der Laplace-Operator für den Druck ist kompakt\r
// (direkte Nachbarn, wie in GPU Gems 38) und dämpft dadurch Zickzack-Moden in Gittergröße.\r
\r
@group(0) @binding(1) var samp: sampler;\r
@group(0) @binding(2) var srcA: texture_cube<f32>;\r
@group(0) @binding(3) var srcB: texture_cube<f32>;\r
@group(0) @binding(4) var dst: texture_storage_2d_array<rgba16float, write>;\r
// Breitenkreis-Mittel des Ostwinds: [2·i] = Summe, [2·i+1] = Gewicht, Festkomma.\r
@group(0) @binding(5) var<storage, read_write> zonal: array<atomic<i32>>;\r
\r
const ZBINS = 128u;\r
const ZSCALE = 10000.0;\r
\r
// Gleiche Felder als 2D-Array, für die nahtlos exakte Abtastung.\r
@group(0) @binding(6) var arrA: texture_2d_array<f32>;\r
@group(0) @binding(7) var arrB: texture_2d_array<f32>;\r
// SEAMLESS = true: an Würfelkanten die vier Nachbartexel einzeln holen (sampleCube in common.wgsl).\r
// Nötig nur auf Grafikkarten, deren Cubemap-Abtastung nicht nahtlos filtert; der Selbsttest\r
// im Abschnitt „Diagnose“ misst das. Sonst schnelle Hardware-Abtastung.\r
override SEAMLESS: bool = false;\r
fn A(d: vec3f) -> vec4f {\r
  if (SEAMLESS) { return sampleCube(arrA, samp, d); }\r
  return textureSampleLevel(srcA, samp, d, 0.0);\r
}\r
fn B(d: vec3f) -> vec4f {\r
  if (SEAMLESS) { return sampleCube(arrB, samp, d); }\r
  return textureSampleLevel(srcB, samp, d, 0.0);\r
}\r
\r
fn outside(id: vec3u) -> bool { return f32(id.x) >= S.velN || f32(id.y) >= S.velN; }\r
\r
fn put(id: vec3u, v: vec4f) { textureStore(dst, id.xy, id.z, v); }\r
\r
fn safe(v: vec3f) -> vec3f {\r
  // NaN/Inf-Schutz und Obergrenze für die Geschwindigkeit (rad/s).\r
  if (any(v != v) || any(abs(v) > vec3f(1e4))) { return vec3f(0.0); }\r
  let l = length(v);\r
  return select(v, v * (1.5 / l), l > 1.5);\r
}\r
\r
// Zelle mit ihren vier Gitternachbarn und einer lokalen Orthonormalbasis.\r
struct Cell {\r
  p: vec3f,\r
  pE: vec3f, pW: vec3f, pN: vec3f, pS: vec3f,\r
  e1: vec3f, e2: vec3f,\r
  inv: mat2x2f,     // bildet (fE−fW, fN−fS) auf den Gradienten (in e1/e2) ab\r
  ax: f32, ay: f32, // 1/Abstand² für den Laplace-Operator\r
  size: f32,        // mittlere Zellgröße (rad)\r
};\r
\r
fn cell(id: vec3u) -> Cell {\r
  let n = S.velN;\r
  let st = (vec2f(id.xy) + 0.5) / n;\r
  let d = 1.0 / n;\r
  var c: Cell;\r
  c.p = faceDir(id.z, st);\r
  c.pE = faceDir(id.z, st + vec2f(d, 0.0));\r
  c.pW = faceDir(id.z, st - vec2f(d, 0.0));\r
  c.pN = faceDir(id.z, st + vec2f(0.0, d));\r
  c.pS = faceDir(id.z, st - vec2f(0.0, d));\r
  let dA = c.pE - c.pW;\r
  let dB = c.pN - c.pS;\r
  c.e1 = normalize(tangent(c.p, dA));\r
  c.e2 = cross(c.p, c.e1);\r
  // Zeilen: dA und dB in der lokalen Basis. Gradient g erfüllt M·g = (fE−fW, fN−fS).\r
  let a = dot(dA, c.e1); let b = dot(dA, c.e2);\r
  let cc = dot(dB, c.e1); let dd = dot(dB, c.e2);\r
  let det = a * dd - b * cc;\r
  // Inverse von [[a, b], [cc, dd]] (WGSL-Matrizen sind spaltenweise).\r
  c.inv = mat2x2f(vec2f(dd, -cc), vec2f(-b, a)) * (1.0 / det);\r
  let hx = length(dA) * 0.5;\r
  let hy = length(dB) * 0.5;\r
  c.ax = 1.0 / (hx * hx);\r
  c.ay = 1.0 / (hy * hy);\r
  c.size = 0.5 * (hx + hy);\r
  return c;\r
}\r
\r
fn grad2(c: Cell, dfA: f32, dfB: f32) -> vec2f { return c.inv * vec2f(dfA, dfB); }\r
\r
@compute @workgroup_size(8, 8, 1)\r
fn initVel(@builtin(global_invocation_id) id: vec3u) {\r
  if (outside(id)) { return; }\r
  let p = cell(id).p;\r
  var v = east(p) * jetAt(latitude(p)) + curlOnSphere(p, 3.0, S.seed, 3) * 0.01;\r
  // Stürme als Anfangswirbel einsetzen. Danach leben sie nur noch von der Physik\r
  // (außer "Stürme festhalten" ist aufgedreht).\r
  v = mix(v, stormFlow(p), stormMask(p, 1.1).w);\r
  put(id, vec4f(tangent(p, v), 0.0));\r
}\r
\r
@compute @workgroup_size(8, 8, 1)\r
fn clear(@builtin(global_invocation_id) id: vec3u) {\r
  if (outside(id)) { return; }\r
  put(id, vec4f(0.0));\r
}\r
\r
// Semi-Lagrange-Advektion, optional mit BFECC-Korrektur (wie im mofu-Artikel, nur in 3D).\r
@compute @workgroup_size(8, 8, 1)\r
fn advect(@builtin(global_invocation_id) id: vec3u) {\r
  if (outside(id)) { return; }\r
  let p = cell(id).p;\r
  let dt = S.dt;\r
  let u0 = A(p).xyz;\r
  var src = stepOn(p, -u0 * dt);\r
  if (S.bfecc > 0.5) {\r
    let u1 = A(src).xyz;\r
    let back = stepOn(src, u1 * dt);\r
    let p3 = normalize(p - (back - p) * 0.5);\r
    let u2 = A(p3).xyz;\r
    src = stepOn(p3, -u2 * dt);\r
  }\r
  let v = A(src).xyz;\r
  // Paralleltransport: in die Tangentialebene bei p projizieren, Betrag erhalten.\r
  var vt = tangent(p, v);\r
  vt *= length(v) / max(length(vt), 1e-6);\r
  put(id, vec4f(safe(vt), 0.0));\r
}\r
\r
// Wirbelstärke ζ = ∂v/∂x − ∂u/∂y (Normalkomponente der Rotation) -> x\r
@compute @workgroup_size(8, 8, 1)\r
fn curl(@builtin(global_invocation_id) id: vec3u) {\r
  if (outside(id)) { return; }\r
  let c = cell(id);\r
  let dA = A(c.pE).xyz - A(c.pW).xyz;\r
  let dB = A(c.pN).xyz - A(c.pS).xyz;\r
  let g1 = grad2(c, dot(dA, c.e1), dot(dB, c.e1));   // ∇u₁\r
  let g2 = grad2(c, dot(dA, c.e2), dot(dB, c.e2));   // ∇u₂\r
  put(id, vec4f(g2.x - g1.y, 0.0, 0.0, 0.0));\r
}\r
\r
// ---------- Breitenkreis-Mittel des Ostwinds ----------\r
\r
@compute @workgroup_size(64, 1, 1)\r
fn zonalClear(@builtin(global_invocation_id) id: vec3u) {\r
  if (id.x < ZBINS * 2u) { atomicStore(&zonal[id.x], 0); }\r
}\r
\r
fn zbin(p: vec3f) -> u32 { return min(u32((latitude(p) / PI + 0.5) * f32(ZBINS)), ZBINS - 1u); }\r
\r
var<workgroup> wsum: array<atomic<i32>, 256>;\r
\r
// Erst je Arbeitsgruppe im schnellen Gruppenspeicher summieren, dann nur die belegten\r
// Bänder in den globalen Puffer: ~64× weniger konkurrierende globale Atomics.\r
@compute @workgroup_size(8, 8, 1)\r
fn zonalSum(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) li: u32) {\r
  for (var k = li; k < ZBINS * 2u; k += 64u) { atomicStore(&wsum[k], 0); }\r
  workgroupBarrier();\r
  if (!outside(id)) {\r
    let c = cell(id);\r
    let u = A(c.p).xyz;\r
    // Gewicht = Zellfläche, damit kleine Zellen an Würfelkanten nicht überzählen.\r
    let w = c.size * c.size * S.velN * S.velN;\r
    let b = zbin(c.p);\r
    atomicAdd(&wsum[2u * b], i32(dot(u, east(c.p)) * w * ZSCALE));\r
    atomicAdd(&wsum[2u * b + 1u], i32(w * 1000.0));\r
  }\r
  workgroupBarrier();\r
  for (var k = li; k < ZBINS * 2u; k += 64u) {\r
    let v = atomicLoad(&wsum[k]);\r
    if (v != 0) { atomicAdd(&zonal[k], v); }\r
  }\r
}\r
\r
fn zonalMean(p: vec3f) -> f32 {\r
  // Linear zwischen den Nachbarbändern interpolieren, sonst entstehen Stufen.\r
  let x = (latitude(p) / PI + 0.5) * f32(ZBINS) - 0.5;\r
  let i0 = u32(clamp(floor(x), 0.0, f32(ZBINS - 1u)));\r
  let i1 = min(i0 + 1u, ZBINS - 1u);\r
  let m0 = f32(atomicLoad(&zonal[2u * i0])) / ZSCALE / max(f32(atomicLoad(&zonal[2u * i0 + 1u])) / 1000.0, 1e-6);\r
  let m1 = f32(atomicLoad(&zonal[2u * i1])) / ZSCALE / max(f32(atomicLoad(&zonal[2u * i1 + 1u])) / 1000.0, 1e-6);\r
  return mix(m0, m1, clamp(x - floor(x), 0.0, 1.0));\r
}\r
\r
// Kräfte. A = Geschwindigkeit, B = Wirbelstärke.\r
@compute @workgroup_size(8, 8, 1)\r
fn forces(@builtin(global_invocation_id) id: vec3u) {\r
  if (outside(id)) { return; }\r
  let c = cell(id);\r
  let p = c.p;\r
  let dt = S.dt;\r
  var u = A(p).xyz;\r
\r
  // Jets: nur das Breitenkreis-Mittel wird zum gemessenen Profil gezogen.\r
  // Wirbel (Abweichungen vom Mittel) bleiben unberührt und können wachsen.\r
  let e = east(p);\r
  u += e * (jetAt(latitude(p)) - zonalMean(p)) * min(S.jetRelax * dt, 1.0);\r
\r
  // Coriolis: Drehung des Windvektors um die Flächennormale, f = 2Ω·sin(Breite).\r
  let a = -2.0 * S.omega * p.y * dt;\r
  u = u * cos(a) + cross(p, u) * sin(a);\r
\r
  // Stürme: Windfeld im Sturmgebiet zum Drehprofil ziehen.\r
  let sf = stormFlow(p);\r
  let sw = stormMask(p, 1.1).w;\r
  u += (sf - u) * clamp(sw * 2.0 * dt, 0.0, 1.0);\r
\r
  // Langsam wandernde Anregung: stößt Instabilitäten an. Die Reibung begrenzt die Energie.\r
  u += curlOnSphere(p, S.turbScale, S.time * 0.3 + S.seed, 2) * S.turbulence * dt;\r
\r
  // Vorticity Confinement (Fedkiw 2001): f = ε·Δx·(N × ω), N = ∇|ω| / |∇|ω||\r
  if (S.confinement > 0.0) {\r
    let g = grad2(c, abs(B(c.pE).x) - abs(B(c.pW).x), abs(B(c.pN).x) - abs(B(c.pS).x));\r
    let gl = length(g);\r
    if (gl > 1e-6) {\r
      let nvec = (c.e1 * g.x + c.e2 * g.y) / gl;\r
      u += cross(nvec, p) * B(p).x * S.confinement * c.size * dt;\r
    }\r
  }\r
\r
  u /= 1.0 + S.drag * dt;\r
  put(id, vec4f(safe(tangent(p, u)), 0.0));\r
}\r
\r
// Divergenz ∇·u -> x\r
@compute @workgroup_size(8, 8, 1)\r
fn divergence(@builtin(global_invocation_id) id: vec3u) {\r
  if (outside(id)) { return; }\r
  let c = cell(id);\r
  let dA = A(c.pE).xyz - A(c.pW).xyz;\r
  let dB = A(c.pN).xyz - A(c.pS).xyz;\r
  let g1 = grad2(c, dot(dA, c.e1), dot(dB, c.e1));\r
  let g2 = grad2(c, dot(dA, c.e2), dot(dB, c.e2));\r
  put(id, vec4f(g1.x + g2.y, 0.0, 0.0, 0.0));\r
}\r
\r
// Jacobi-Schritt für ∇²p = ∇·u mit kompaktem 5-Punkt-Stern. A = Druck, B = Divergenz.\r
@compute @workgroup_size(8, 8, 1)\r
fn jacobi(@builtin(global_invocation_id) id: vec3u) {\r
  if (outside(id)) { return; }\r
  let c = cell(id);\r
  let s = c.ax * (A(c.pE).x + A(c.pW).x) + c.ay * (A(c.pN).x + A(c.pS).x);\r
  let pr = (s - B(c.p).x) / (2.0 * (c.ax + c.ay));\r
  put(id, vec4f(pr, 0.0, 0.0, 0.0));\r
}\r
\r
// Druckgradient abziehen -> divergenzfreier Wind. A = Geschwindigkeit, B = Druck.\r
@compute @workgroup_size(8, 8, 1)\r
fn project(@builtin(global_invocation_id) id: vec3u) {\r
  if (outside(id)) { return; }\r
  let c = cell(id);\r
  let g = grad2(c, B(c.pE).x - B(c.pW).x, B(c.pN).x - B(c.pS).x);\r
  let u = A(c.p).xyz - (c.e1 * g.x + c.e2 * g.y);\r
  put(id, vec4f(safe(tangent(c.p, u)), 0.0));\r
}\r
`, Ie = `// Sichtbare Wolkenfelder: Farbstoff-Advektion, Curl-Noise-Flussfeld und Partikel.\r
\r
@group(0) @binding(1) var samp: sampler;\r
@group(0) @binding(2) var srcA: texture_cube<f32>;\r
@group(0) @binding(3) var srcB: texture_cube<f32>;\r
@group(0) @binding(4) var dst: texture_storage_2d_array<rgba16float, write>;\r
\r
struct Particle {\r
  pos: vec4f,   // xyz Richtung auf der Kugel, w Alter\r
  info: vec4f,  // x Lebensdauer, yzw Farbe\r
};\r
@group(0) @binding(5) var<storage, read_write> parts: array<Particle>;\r
\r
// Gleiche Felder als 2D-Array, für die nahtlos exakte Abtastung.\r
@group(0) @binding(6) var arrA: texture_2d_array<f32>;\r
@group(0) @binding(7) var arrB: texture_2d_array<f32>;\r
// SEAMLESS = true: an Würfelkanten die vier Nachbartexel einzeln holen (sampleCube in common.wgsl).\r
// Nötig nur auf Grafikkarten, deren Cubemap-Abtastung nicht nahtlos filtert; der Selbsttest\r
// im Abschnitt „Diagnose“ misst das. Sonst schnelle Hardware-Abtastung.\r
override SEAMLESS: bool = false;\r
fn A(d: vec3f) -> vec4f {\r
  if (SEAMLESS) { return sampleCube(arrA, samp, d); }\r
  return textureSampleLevel(srcA, samp, d, 0.0);\r
}\r
fn B(d: vec3f) -> vec4f {\r
  if (SEAMLESS) { return sampleCube(arrB, samp, d); }\r
  return textureSampleLevel(srcB, samp, d, 0.0);\r
}\r
\r
fn texDir(id: vec3u, n: f32) -> vec3f { return faceDir(id.z, (vec2f(id.xy) + 0.5) / n); }\r
\r
// Bänder mit mäandernden Rändern: die Breite wird leicht verrauscht, bevor die\r
// Bandfarbe nachgeschlagen wird.\r
fn bandTarget(p: vec3f) -> vec3f {\r
  let w = noised(p * 4.0 + vec3f(S.seed, S.time * 0.01, 0.0)).x;\r
  let lat = latitude(p) + w * S.bandWobble * 0.04;\r
  // Feine Streifen innerhalb der Bänder: ohne feine Farbunterschiede kann die Strömung\r
  // keine sichtbaren Filamente ziehen (ein gedehnter glatter Verlauf bleibt glatt).\r
  if (S.fineStripes <= 0.0) { return bandAt(lat); }   // spart 2 Rauschberechnungen pro Texel\r
  let fine = noised(vec3f(lat * 45.0, S.seed * 7.0, 0.5)).x + 0.6 * noised(vec3f(lat * 110.0, S.seed * 3.0, 2.5)).x;\r
  return bandAt(lat) * (1.0 + fine * S.fineStripes * 0.6);\r
}\r
\r
fn convectionSpot(p: vec3f) -> f32 {\r
  let n = noised(p * 13.0 + vec3f(S.seed * 3.1, 0.0, S.time * 0.04)).x;\r
  // Aufsteigende Wolkentürme vor allem in niedrigen und mittleren Breiten.\r
  return smoothstep(0.5, 0.66, n) * smoothstep(1.15, 0.8, abs(latitude(p)));\r
}\r
\r
fn relaxColor(p: vec3f, c0: vec3f) -> vec3f {\r
  let dt = S.dt;\r
  var c = mix(c0, bandTarget(p), 1.0 - exp(-S.bandRelax * dt));\r
  let sm = stormMask(p, 0.55);\r
  c = mix(c, sm.rgb, (1.0 - exp(-S.stormTint * dt)) * sm.w);\r
  c = mix(c, S.cloud.rgb, (1.0 - exp(-S.convection * dt)) * convectionSpot(p));\r
  return c;\r
}\r
\r
@compute @workgroup_size(8, 8, 1)\r
fn initDye(@builtin(global_invocation_id) id: vec3u) {\r
  if (f32(id.x) >= S.dyeN || f32(id.y) >= S.dyeN) { return; }\r
  let p = texDir(id, S.dyeN);\r
  if (S.mode.x > 0.5) { textureStore(dst, id.xy, id.z, vec4f(bandTarget(p), 1.0)); return; }\r
  let sm = stormMask(p, 0.55);\r
  textureStore(dst, id.xy, id.z, vec4f(mix(bandTarget(p), sm.rgb, sm.w), 1.0));\r
}\r
\r
// Farbstoff mit dem Wind (B) mitführen, A = Farbstoff.\r
@compute @workgroup_size(8, 8, 1)\r
fn advectDye(@builtin(global_invocation_id) id: vec3u) {\r
  if (f32(id.x) >= S.dyeN || f32(id.y) >= S.dyeN) { return; }\r
  let p = texDir(id, S.dyeN);\r
  let dt = S.dt;\r
  let u0 = B(p).xyz;\r
  var src = stepOn(p, -u0 * dt);\r
  if (S.bfecc > 0.5) {\r
    let u1 = B(src).xyz;\r
    let back = stepOn(src, u1 * dt);\r
    let p3 = normalize(p - (back - p) * 0.5);\r
    let u2 = B(p3).xyz;\r
    src = stepOn(p3, -u2 * dt);\r
  }\r
  var c = A(src).rgb;\r
  if (any(c != c)) { c = bandTarget(p); }\r
  textureStore(dst, id.xy, id.z, vec4f(relaxColor(p, c), 1.0));\r
}\r
\r
// Wirbel nach dem Rezept von Gaseous Giganticus: zufällig verteilt, aber nur dort, wo die\r
// Jets schwach sind (sonst zerreißt die Scherung sie sofort). Drehsinn wie die lokale Scherung,\r
// Drehprofil ω(d) = ω₀·sin(π·d/r) innerhalb des Radius.\r
fn curlVortices(p: vec3f) -> vec3f {\r
  var v = vec3f(0.0);\r
  let n = u32(S.vortexCount);\r
  let peak = max(abs(S.jetStrength), 1e-5);\r
  for (var i = 0u; i < n; i++) {\r
    let r4 = rand4(i + 17u, u32(S.seed * 1000.0) + 991u);\r
    let z = r4.x * 1.7 - 0.85;                     // nicht direkt an den Polen\r
    let phi = r4.y * 2.0 * PI;\r
    let s = sqrt(1.0 - z * z);\r
    let c = vec3f(s * cos(phi), z, s * sin(phi));\r
    let lat = asin(z);\r
    if (abs(jetAt(lat)) > 0.35 * peak) { continue; }\r
    let rad = 0.025 + r4.z * 0.05;\r
    let d = acos(clamp(dot(c, p), -1.0, 1.0));\r
    if (d >= rad) { continue; }\r
    // Hintergrund-Wirbelstärke ζ ≈ −∂U/∂φ: Wirbel mit gleichem Vorzeichen überleben in der Scherung.\r
    let shear = jetAt(lat + 0.01) - jetAt(lat - 0.01);\r
    let sgn = select(1.0, -1.0, shear > 0.0);\r
    // Drehtempo aus der Strudel-Stärke (S.mode.y), nicht aus der Jet-Geschwindigkeit\r
    let omega = sin(PI * d / rad) * S.vortexStrength * S.mode.y / rad * (0.6 + 0.8 * r4.w);\r
    v += cross(c, p) / max(sin(d), 1e-4) * omega * d * sgn;\r
  }\r
  return v;\r
}\r
\r
// Flussfeld für den Curl-Noise-Modus: Jets + Curl-Noise + Wirbel + Stürme.\r
@compute @workgroup_size(8, 8, 1)\r
fn flowField(@builtin(global_invocation_id) id: vec3u) {\r
  if (f32(id.x) >= S.flowN || f32(id.y) >= S.flowN) { return; }\r
  let p = texDir(id, S.flowN);\r
  var v = east(p) * jetAt(latitude(p));\r
  v += curlOnSphere(p, S.curlFreq, S.time * S.curlSpeed + S.seed, i32(S.curlOctaves)) * S.curlStrength;\r
  v += curlVortices(p);\r
  v += stormFlow(p);\r
  textureStore(dst, id.xy, id.z, vec4f(tangent(p, v), 0.0));\r
}\r
\r
// Geburtsort: gleichverteilt auf der Kugel, oder (Anteil S.view.w) in der Kappe um die\r
// Blickrichtung. So landet die Rechenarbeit dort, wo die Kamera hinschaut.\r
fn spawnPos(r: vec4f) -> vec3f {\r
  let inView = fract(r.w * 57.3) < S.view.w;\r
  let cmin = select(-1.0, 0.1, inView);           // Kappe bis ~84° um die Blickrichtung\r
  let z = 1.0 - r.x * (1.0 - cmin);\r
  let phi = r.y * 2.0 * PI;\r
  let s = sqrt(max(0.0, 1.0 - z * z));\r
  if (!inView) { return vec3f(s * cos(phi), z, s * sin(phi)); }\r
  let ax = normalize(S.view.xyz);\r
  let tb = tangentBasis(ax);\r
  return normalize(ax * z + (tb[0] * cos(phi) + tb[1] * sin(phi)) * s);\r
}\r
\r
fn spawn(i: u32, stagger: bool) -> Particle {\r
  let r = rand4(i, u32(S.frame) * 747796405u + u32(S.seed * 1000.0));\r
  let p = spawnPos(r);\r
  var col: vec3f;\r
  if (S.mode.x > 0.5) {\r
    // Partikel-Schiene (jasper-r): Farbe nur aus dem Breitenverlauf, keine Sturm- oder Konvektionsfarbe.\r
    let w = noised(p * 4.0 + vec3f(S.seed, 0.0, 0.0)).x;\r
    col = bandAt(latitude(p) + w * S.bandWobble * 0.04) * (0.9 + 0.2 * fract(r.w * 13.1));\r
  } else {\r
    col = bandTarget(p) * (0.9 + 0.2 * r.w);\r
    let sm = stormMask(p, 0.55);\r
    col = mix(col, sm.rgb, sm.w * clamp(S.stormTint * 0.5, 0.0, 1.0));\r
    if (fract(r.w * 97.0) < S.convection * 0.003) { col = S.cloud.rgb; }\r
  }\r
  let life = S.lifetime * (0.5 + r.z);\r
  var age = 0.0;\r
  if (stagger) { age = fract(r.z * 31.7) * life; }\r
  return Particle(vec4f(p, age), vec4f(life, col));\r
}\r
\r
// Partikel bewegen und in die Farbtextur mischen (Verfahren nach jasper-r).\r
// A = Farbstoff vorher, B = Flussfeld, dst = Farbstoff nachher (vorher per Kopie befüllt).\r
@compute @workgroup_size(64, 1, 1)\r
fn moveParticles(@builtin(global_invocation_id) gid: vec3u) {\r
  let i = gid.x + gid.y * 65535u * 64u;\r
  if (f32(i) >= S.particleCount) { return; }\r
  var pt = parts[i];\r
  if (pt.info.x <= 0.0) {\r
    pt = spawn(i, true);\r
  } else if (pt.pos.w >= pt.info.x && S.lifetime < 60.0) {\r
    pt = spawn(i, false);\r
  } else {\r
    let dt = S.dt;\r
    var p = pt.pos.xyz;\r
    let v1 = B(p).xyz;\r
    let mid = stepOn(p, v1 * dt * 0.5);\r
    let v2 = B(mid).xyz;\r
    p = stepOn(p, v2 * dt);\r
    pt.pos = vec4f(p, pt.pos.w + dt);\r
  }\r
  parts[i] = pt;\r
\r
  let life = max(pt.info.x, 1e-3);\r
  // Ab Lebensdauer 60 leben Partikel ewig (wie bei Gaseous Giganticus): nur einblenden, nie ausblenden.\r
  var fade = sin(PI * clamp(pt.pos.w / life, 0.0, 1.0));\r
  if (S.lifetime >= 60.0) { fade = min(pt.pos.w / 2.0, 1.0); }\r
  let a = S.opacity * fade;\r
  let t = dirToTexel(pt.pos.xyz, u32(S.dyeN));\r
  let old = A(pt.pos.xyz).rgb;\r
  textureStore(dst, t.xy, t.z, vec4f(mix(old, pt.info.yzw, a), 1.0));\r
}\r
\r
// Weichzeichnen und zur Bandfarbe zurückblenden. A = Farbstoff nach Partikeln.\r
@compute @workgroup_size(8, 8, 1)\r
fn blurRelax(@builtin(global_invocation_id) id: vec3u) {\r
  if (f32(id.x) >= S.dyeN || f32(id.y) >= S.dyeN) { return; }\r
  let p = texDir(id, S.dyeN);\r
  let tb = tangentBasis(p);\r
  let h = 1.6 / S.dyeN;\r
  let c = A(p).rgb;\r
  let avg = (A(stepOn(p, tb[0] * h)).rgb + A(stepOn(p, -tb[0] * h)).rgb\r
           + A(stepOn(p, tb[1] * h)).rgb + A(stepOn(p, -tb[1] * h)).rgb) * 0.25;\r
  let blurred = mix(c, avg, S.blur);\r
  textureStore(dst, id.xy, id.z, vec4f(relaxColor(p, blurred), 1.0));\r
}\r
\r
// Partikel-Schiene (jasper-r): weichzeichnen und langsam zu EINER Mittelfarbe verblassen.\r
// Keine Rückstellung zur Bandfarbe, keine Sturmfarbe: alle Struktur kommt von den Partikeln.\r
@compute @workgroup_size(8, 8, 1)\r
fn blurFade(@builtin(global_invocation_id) id: vec3u) {\r
  if (f32(id.x) >= S.dyeN || f32(id.y) >= S.dyeN) { return; }\r
  let p = texDir(id, S.dyeN);\r
  let tb = tangentBasis(p);\r
  let h = 1.6 / S.dyeN;\r
  let c = A(p).rgb;\r
  let avg = (A(stepOn(p, tb[0] * h)).rgb + A(stepOn(p, -tb[0] * h)).rgb\r
           + A(stepOn(p, tb[1] * h)).rgb + A(stepOn(p, -tb[1] * h)).rgb) * 0.25;\r
  let blurred = mix(c, avg, S.blur);\r
  textureStore(dst, id.xy, id.z, vec4f(mix(blurred, S.centre.rgb, 1.0 - exp(-S.centre.w * S.dt)), 1.0));\r
}\r
`, qe = `// Planeten-Darstellung: ein Vollbild-Dreieck, jeder Pixel schneidet seinen Sichtstrahl\r
// mit dem abgeplatteten Planeten und der Ringebene. Keine Meshes, keine Bilddateien.\r
\r
struct R {\r
  invViewProj: mat4x4f,\r
  camPos: vec4f,\r
  body0: vec4f, body1: vec4f, body2: vec4f,   // Welt -> Körper (Zeilen)\r
  sun: vec4f,       // xyz Richtung (Welt), w Intensität\r
  atmo: vec4f,      // rgb Farbe, w Stärke\r
  p0: vec4f,        // x Abplattung, y Relief, z Randverdunkelung, w Ansicht\r
  p1: vec4f,        // x Kartenmodus, y Ring innen, z Ring außen, w Ring-Deckkraft\r
  p2: vec4f,        // x Seitenverhältnis, y Zeit, z Belichtung, w Farbstoff-Auflösung\r
  ringColor: vec4f, // rgb, w Ringfaden-Kontrast\r
  p3: vec4f,        // x Fluss-Skala für Debug-Ansichten, y Pixelwinkel (rad), z Himmelskarte N, w Milchstraße\r
  p4: vec4f,        // x Sterne, y Mehrstufig: Grobanteil (0 = aus), z Feinanteil, w Pixel-Anpassung\r
  p5: vec4f,        // x Tiefe aus Physik an/aus, y Stärke, z Quelle (0 Druck, 1 Wirbelstärke), w Gitter\r
  p6: vec4f,        // x Parallaxe an/aus, y Höhe, z Eigenschatten, w Größe (Mehrstufig)\r
  p7: vec4f,        // x Dämmerung (0 wie v0.4, 1 aus, 2 weich), y Randschimmer (0 wie v0.4, 1 weich, 2 aus)\r
};\r
\r
@group(0) @binding(0) var<uniform> U: R;\r
@group(0) @binding(1) var samp: sampler;\r
@group(0) @binding(2) var dyeTex: texture_cube<f32>;\r
@group(0) @binding(3) var velTex: texture_cube<f32>;\r
@group(0) @binding(4) var auxTex: texture_cube<f32>;\r
@group(0) @binding(5) var prsTex: texture_cube<f32>;\r
@group(0) @binding(6) var skyTex: texture_2d_array<f32>;   // gemeinsamer Himmel (src/sky)\r
\r
const PI = 3.14159265359;\r
\r
struct VOut { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };\r
\r
@vertex\r
fn vs(@builtin(vertex_index) i: u32) -> VOut {\r
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;\r
  var o: VOut;\r
  o.pos = vec4f(xy, 0.0, 1.0);\r
  o.ndc = xy;\r
  return o;\r
}\r
\r
fn toBody(v: vec3f) -> vec3f { return vec3f(dot(U.body0.xyz, v), dot(U.body1.xyz, v), dot(U.body2.xyz, v)); }\r
\r
fn hash21(p: vec2f) -> f32 {\r
  var q = fract(p * vec2f(123.34, 456.21));\r
  q += dot(q, q + 45.32);\r
  return fract(q.x * q.y);\r
}\r
\r
fn tangentBasis(p: vec3f) -> mat2x3f {\r
  let helper = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(p.y) < 0.9);\r
  let e1 = normalize(cross(helper, p));\r
  return mat2x3f(e1, cross(p, e1));\r
}\r
\r
fn east(p: vec3f) -> vec3f {\r
  let e = cross(vec3f(0.0, 1.0, 0.0), p);\r
  let l = length(e);\r
  return select(vec3f(1.0, 0.0, 0.0), e / l, l > 1e-5);\r
}\r
\r
// Ellipsoid x² + (y/c)² + z² = 1 mit c = 1 − Abplattung. Rückgabe: t oder −1.\r
fn hitPlanet(o: vec3f, d: vec3f) -> f32 {\r
  let c = 1.0 - U.p0.x;\r
  let s = vec3f(1.0, 1.0 / c, 1.0);\r
  let os = o * s; let ds = d * s;\r
  let a = dot(ds, ds);\r
  let b = dot(os, ds);\r
  let k = dot(os, os) - 1.0;\r
  let disc = b * b - a * k;\r
  if (disc < 0.0) { return -1.0; }\r
  let t = (-b - sqrt(disc)) / a;\r
  return select(-1.0, t, t > 0.0);\r
}\r
\r
fn smoothHash(x: f32, salt: f32) -> f32 {\r
  let i = floor(x);\r
  let f = fract(x);\r
  return mix(hash21(vec2f(i, salt)), hash21(vec2f(i + 1.0, salt)), f * f * (3.0 - 2.0 * f));\r
}\r
\r
// footprint: Breite eines Bildschirmpixels auf der Ringebene (in Planetenradien).\r
// Feinstruktur, die schmaler als ein Pixel ist, wird ausgeblendet statt zu flimmern.\r
fn ringDensity(r: f32, footprint: f32) -> f32 {\r
  let inner = U.p1.y; let outer = U.p1.z;\r
  if (r < inner || r > outer || outer <= inner) { return 0.0; }\r
  let x = (r - inner) / (outer - inner);\r
  // Grobe Struktur: dichter Hauptring, Lücke wie die Cassini-Teilung, schwacher Außenring.\r
  var d = smoothstep(0.0, 0.08, x) * (1.0 - smoothstep(0.93, 1.0, x));\r
  d *= mix(0.35, 1.0, smoothstep(0.18, 0.35, x));\r
  d *= 1.0 - 0.9 * (smoothstep(0.60, 0.62, x) - smoothstep(0.66, 0.68, x));\r
  d *= 1.0 - 0.6 * (smoothstep(0.86, 0.865, x) - smoothstep(0.87, 0.875, x));\r
  let span = footprint / (outer - inner);\r
  let fineW = 1.0 - smoothstep(0.5 / 420.0, 2.0 / 420.0, span);\r
  let coarseW = 1.0 - smoothstep(0.5 / 90.0, 2.0 / 90.0, span);\r
  let fine = mix(0.5, smoothHash(x * 420.0, 3.0), fineW) * 0.5 + mix(0.5, smoothHash(x * 90.0, 7.0), coarseW) * 0.5;\r
  d *= mix(1.0, fine * 1.4 + 0.3 * (1.0 - fineW), U.ringColor.w);\r
  return clamp(d, 0.0, 1.0) * U.p1.w;\r
}\r
\r
fn aces(x: vec3f) -> vec3f {\r
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;\r
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));\r
}\r
\r
fn diverging(v: f32) -> vec3f {\r
  let t = clamp(v, -1.0, 1.0);\r
  let neg = vec3f(0.15, 0.45, 0.95);\r
  let pos = vec3f(0.95, 0.35, 0.15);\r
  return mix(vec3f(0.06), select(neg, pos, t > 0.0), abs(t));\r
}\r
\r
// Farbe einer Stelle auf der Kugel je nach Ansicht.\r
fn surface(q: vec3f, mode: i32) -> vec3f {\r
  let fs = U.p3.x;\r
  if (mode == 1) {\r
    let v = textureSampleLevel(velTex, samp, q, 0.0).xyz;\r
    let tb = mat2x3f(east(q), cross(q, east(q)));\r
    let e = dot(v, tb[0]) * fs;\r
    let n = dot(v, tb[1]) * fs;\r
    return vec3f(0.5 + 0.5 * clamp(e, -1.0, 1.0), 0.5 + 0.5 * clamp(n, -1.0, 1.0), 0.6) * min(1.0, length(vec2f(e, n)) * 1.5 + 0.15);\r
  }\r
  if (mode == 2) { return diverging(textureSampleLevel(auxTex, samp, q, 0.0).x * fs * 0.015); }\r
  // Gespeichert ist die Druckkorrektur pro Schritt (Δt·P); P ≈ f·U·L, daher Skala 60·fs²/4.\r
  if (mode == 3) { return diverging(textureSampleLevel(prsTex, samp, q, 0.0).x * 60.0 * fs * fs * 0.25); }\r
  return textureSampleLevel(dyeTex, samp, q, 0.0).rgb;\r
}\r
\r
fn luminance(c: vec3f) -> f32 { return dot(c, vec3f(0.3, 0.59, 0.11)); }\r
\r
// ---------- Relief-Module (alle aus = Verhalten wie v0.4) ----------\r
fn lumAt(q: vec3f) -> f32 { return luminance(textureSampleLevel(dyeTex, samp, q, 0.0).rgb); }\r
// Helligkeit, über ein Kreuz der Breite s gemittelt (grobe Stufe ohne Mipmaps)\r
fn lumBlur(q: vec3f, tb: mat2x3f, s: f32) -> f32 {\r
  return 0.25 * (lumAt(normalize(q + tb[0] * s)) + lumAt(normalize(q - tb[0] * s)) + lumAt(normalize(q + tb[1] * s)) + lumAt(normalize(q - tb[1] * s)));\r
}\r
// Wirbelstärke ζ aus dem Wind (geht in beiden Rechenmodellen)\r
fn zetaAt(q: vec3f, e: f32) -> f32 {\r
  let tb = tangentBasis(q);\r
  let a = dot(textureSampleLevel(velTex, samp, normalize(q + tb[0] * e), 0.0).xyz, tb[1]);\r
  let b = dot(textureSampleLevel(velTex, samp, normalize(q - tb[0] * e), 0.0).xyz, tb[1]);\r
  let c = dot(textureSampleLevel(velTex, samp, normalize(q + tb[1] * e), 0.0).xyz, tb[0]);\r
  let d = dot(textureSampleLevel(velTex, samp, normalize(q - tb[1] * e), 0.0).xyz, tb[0]);\r
  return (a - b - c + d) / (2.0 * e);\r
}\r
// Tiefe aus der Physik: Hochdruck-Wirbel wölben sich, Tiefdruck-Wirbel sind Senken.\r
// Druck (nur Stable Fluids) oder Wirbelstärke geteilt durch Coriolis (geostrophisch, beide Modelle).\r
fn depthAt(q: vec3f) -> f32 {\r
  let fs = U.p3.x;\r
  if (U.p5.z < 0.5) { return textureSampleLevel(prsTex, samp, q, 0.0).x * 60.0 * fs * fs * 0.25; }\r
  let f = select(-1.0, 1.0, q.y >= 0.0) * max(abs(q.y), 0.15);\r
  return -zetaAt(q, 1.5 / U.p5.w) * fs * 0.015 / f * 0.3;\r
}\r
// Höhe 0..1 für die Parallaxe: Helligkeit (wie Relief) plus Tiefe aus der Physik, falls an\r
fn pomHeight(q: vec3f) -> f32 {\r
  var h = (lumAt(q) - 0.55) * 3.0 * min(U.p0.y, 1.0);\r
  if (U.p5.x > 0.5) { h += depthAt(q) * U.p5.y; }\r
  return clamp(0.5 + 0.5 * h, 0.0, 1.0);\r
}\r
\r
@fragment\r
fn fs(vin: VOut) -> @location(0) vec4f {\r
  let mode = i32(U.p0.w);\r
\r
  // Kartenansicht: flache Weltkarte (equirektangulär) des ganzen Planeten.\r
  if (U.p1.x > 0.5) {\r
    let uv = vin.ndc * 0.5 + 0.5;\r
    let lon = (uv.x - 0.5) * 2.0 * PI;\r
    let lat = (uv.y - 0.5) * PI;\r
    let q = vec3f(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));\r
    var c = surface(q, mode);\r
    if (mode == 0) { c = aces(c * U.p2.z * 0.9); }\r
    return vec4f(pow(c, vec3f(1.0 / 2.2)), 1.0);\r
  }\r
\r
  let wp = U.invViewProj * vec4f(vin.ndc, 1.0, 1.0);\r
  let dir = normalize(wp.xyz / wp.w - U.camPos.xyz);\r
  let o = toBody(U.camPos.xyz);\r
  let d = toBody(dir);\r
  let sun = normalize(toBody(U.sun.xyz));\r
  let c = 1.0 - U.p0.x;\r
\r
  var col = skyColor(skyTex, samp, dir, U.p3.y, U.p3.z, U.p3.w, U.p4.x);\r
  var tPlanet = hitPlanet(o, d);\r
\r
  // Atmosphärensaum außerhalb der Planetenscheibe.\r
  if (tPlanet < 0.0) {\r
    let tc = max(-dot(o, d), 0.0);\r
    let cp = o + d * tc;\r
    let ce = cp * vec3f(1.0, 1.0 / c, 1.0);\r
    let h = length(ce) - 1.0;\r
    let lit = smoothstep(-0.3, 0.4, dot(normalize(cp), sun));\r
    col += U.atmo.rgb * exp(-max(h, 0.0) / 0.025) * U.atmo.w * lit * U.sun.w;\r
  } else {\r
    let hp = o + d * tPlanet;\r
    let hs = hp * vec3f(1.0, 1.0 / c, 1.0);\r
    let q0 = normalize(hs);\r
    var n = normalize(hp * vec3f(1.0, 1.0 / (c * c), 1.0));\r
\r
    // Modul Parallaxe: Sichtstrahl in die Höhenkarte hinein verfolgen (Parallax Occlusion Mapping, Tatarchuk 2006)\r
    var q = q0;\r
    var pomShadow = 1.0;\r
    if (mode == 0 && U.p6.x > 0.5) {\r
      let v0 = -d;\r
      let nv = max(dot(v0, n), 0.15);\r
      let H = U.p6.y * 0.003;\r
      let dirT = -(v0 - n * dot(v0, n)) / nv;\r
      for (var i = 1; i <= 24; i++) {\r
        let rd = H * f32(i) / 24.0;\r
        let qi = normalize(q0 + dirT * rd);\r
        if (rd >= H * (1.0 - pomHeight(qi))) { q = qi; break; }\r
      }\r
      // Eigenschatten: vom Treffer Richtung Sonne laufen. Der Strahl steigt mit der Sonnenhöhe (tan) UND die Kugel\r
      // krümmt sich unter ihm weg (t²/2 bei Radius 1). Ohne Krümmung würde nahe der Tag-Nacht-Grenze alles\r
      // abgeschattet (flache Scheibe statt Kugel) – das war die harte Linie. Schattenlänge höchstens H/tan.\r
      let nl = dot(sun, n);\r
      if (U.p6.z > 0.0 && nl > 0.0) {\r
        let sd = sun - n * nl;\r
        let sl = length(sd);\r
        if (sl > 1e-4) {\r
          let sT = sd / sl;\r
          let tanE = nl / max(sl, 1e-3);\r
          let maxT = min(H / max(tanE, 0.02), 0.03);\r
          let h0 = pomHeight(q) * H;\r
          var occ = 0.0;\r
          for (var j = 1; j <= 12; j++) {\r
            let t = maxT * f32(j) / 12.0;\r
            let ray = h0 + t * tanE + 0.5 * t * t;\r
            let hs = pomHeight(normalize(q + sT * t)) * H;\r
            // weicher Halbschatten: je tiefer der Strahl unter dem Gelände, desto dunkler\r
            occ = max(occ, clamp((hs - ray) / (0.25 * H), 0.0, 1.0));\r
          }\r
          pomShadow = 1.0 - 0.7 * clamp(occ * U.p6.z, 0.0, 1.0);\r
        }\r
      }\r
    }\r
    var albedo = surface(q, mode);\r
    if (mode == 0) {\r
      // Modul Tiefe aus der Physik: Normale nach dem Gefälle von Druck bzw. ζ/f\r
      if (U.p5.x > 0.5) {\r
        let tb = tangentBasis(q);\r
        let e = 2.0 / U.p5.w;\r
        let gx = depthAt(normalize(q + tb[0] * e)) - depthAt(normalize(q - tb[0] * e));\r
        let gy = depthAt(normalize(q + tb[1] * e)) - depthAt(normalize(q - tb[1] * e));\r
        n = normalize(n - (tb[0] * gx + tb[1] * gy) * U.p5.y * 0.5);\r
      }\r
      // Modul Mehrstufiges Relief: große Strukturen tief, feine Krümel schwach, Schrittweite nach Pixelgröße\r
      if (U.p0.y > 0.0 && U.p4.y > 0.0) {\r
        let tb = tangentBasis(q);\r
        let foot = tPlanet * U.p3.y / max(dot(-d, n), 0.2);\r
        let e0 = max(3.0 / U.p2.w, foot * 1.5 * U.p4.w);\r
        let fx = lumAt(normalize(q + tb[0] * e0)) - lumAt(normalize(q - tb[0] * e0));\r
        let fy = lumAt(normalize(q + tb[1] * e0)) - lumAt(normalize(q - tb[1] * e0));\r
        var gx = fx * U.p4.z;\r
        var gy = fy * U.p4.z;\r
        for (var k = 0; k < 2; k++) {\r
          let s = e0 * U.p6.w * select(16.0, 4.0, k == 0);\r
          // Unterschied über die breitere Strecke auf die Steigung der feinen Stufe umrechnen (×e₀/s), mit √ statt linear,\r
          // damit große Strukturen etwas mehr Tiefe behalten als ihre reine Steigung\r
          let w = U.p4.y * 0.5 * sqrt(e0 / s);\r
          gx += (lumBlur(normalize(q + tb[0] * s), tb, s * 0.5) - lumBlur(normalize(q - tb[0] * s), tb, s * 0.5)) * w;\r
          gy += (lumBlur(normalize(q + tb[1] * s), tb, s * 0.5) - lumBlur(normalize(q - tb[1] * s), tb, s * 0.5)) * w;\r
        }\r
        n = normalize(n - (tb[0] * gx + tb[1] * gy) * U.p0.y * 3.0);\r
      }\r
      // Relief aus der Helligkeit: helle Wolken liegen höher (Ammoniak-Eis), dunkle tiefer.\r
      else if (U.p0.y > 0.0) {\r
        let tb = tangentBasis(q);\r
        let e = 3.0 / U.p2.w;\r
        let lx = luminance(surface(normalize(q + tb[0] * e), 0)) - luminance(surface(normalize(q - tb[0] * e), 0));\r
        let ly = luminance(surface(normalize(q + tb[1] * e), 0)) - luminance(surface(normalize(q - tb[1] * e), 0));\r
        n = normalize(n - (tb[0] * lx + tb[1] * ly) * U.p0.y * 3.0);\r
      }\r
      let v = -d;\r
      let ndl = dot(n, sun);\r
      let ndv = max(dot(n, v), 1e-3);\r
      let k = U.p0.z;\r
      // Minnaert-Randverdunkelung, k = 1 ist Lambert.\r
      var light = pow(max(ndl, 0.0), k) * pow(ndv, k - 1.0);\r
      light *= pomShadow;\r
      // Dämmerungssaum (Modul „Dämmerung“; 0 = wie v0.4)\r
      if (U.p7.x < 0.5) { light += smoothstep(0.12, -0.05, ndl) * smoothstep(-0.25, 0.0, ndl) * 0.05; }\r
      // weich: fällt nur ab, ohne Buckel (Maximum zweier steigender Kurven), Stärke nach Atmosphäre\r
      else if (U.p7.x > 1.5) { light = max(light, smoothstep(-0.25, 0.12, ndl) * 0.05 * U.atmo.w / 0.35); }\r
      // Schatten der Ringe auf dem Planeten\r
      if (U.p1.w > 0.0 && abs(sun.y) > 1e-4) {\r
        let tr = -hp.y / sun.y;\r
        if (tr > 0.0) {\r
          let rp = hp + sun * tr;\r
          light *= 1.0 - 0.85 * ringDensity(length(rp.xz), 0.02);\r
        }\r
      }\r
      var rim = pow(1.0 - ndv, 3.0) * U.atmo.w * smoothstep(-0.2, 0.3, ndl);\r
      // Modul „Randschimmer“: weich = schmaler, folgt dem Sonnenlicht stetig; aus = kein Schimmer\r
      if (U.p7.y > 1.5) { rim = 0.0; }\r
      else if (U.p7.y > 0.5) { rim = pow(1.0 - ndv, 5.0) * U.atmo.w * sqrt(clamp(ndl + 0.1, 0.0, 1.0)); }\r
      col = albedo * light * U.sun.w + U.atmo.rgb * rim * U.sun.w;\r
    } else {\r
      col = albedo;\r
    }\r
  }\r
\r
  // Ringe: vor dem Planeten drübermischen, dahinter verdeckt.\r
  if (U.p1.w > 0.0 && abs(d.y) > 1e-5 && mode == 0) {\r
    let tr = -o.y / d.y;\r
    if (tr > 0.0 && (tPlanet < 0.0 || tr < tPlanet)) {\r
      let rp = o + d * tr;\r
      let footprint = tr * U.p3.y / max(abs(d.y), 0.02);\r
      let dens = ringDensity(length(rp.xz), footprint);\r
      if (dens > 0.0) {\r
        var lit = 0.35 + 0.65 * abs(sun.y);\r
        if (hitPlanet(rp + sun * 1e-3, sun) > 0.0) { lit *= 0.08; }\r
        let rc = U.ringColor.rgb * lit * U.sun.w;\r
        col = mix(col, rc, dens);\r
      }\r
    }\r
  }\r
\r
  var outc = col;\r
  if (mode == 0) { outc = aces(col * U.p2.z); }\r
  return vec4f(pow(outc, vec3f(1.0 / 2.2)), 1.0);\r
}\r
`, V = [
  {
    name: "Jupiter",
    wind: [
      [-90, 0],
      [-72, 15],
      [-66, -10],
      [-62, 25],
      [-57, -15],
      [-53, 30],
      [-47, -10],
      [-43, 35],
      [-39, -25],
      [-33, 45],
      [-29, -30],
      [-26, 55],
      [-20, -60],
      [-17, 10],
      [-7, 140],
      [0, 90],
      [7, 125],
      [15, -10],
      [17, -30],
      [21, 60],
      [23.5, 160],
      [27, 0],
      [31, 40],
      [35, -20],
      [39, 30],
      [43, -10],
      [48, 25],
      [52, -15],
      [56, 30],
      [60, -10],
      [66, 20],
      [72, 5],
      [90, 0]
    ],
    bands: [
      [-90, "#586572"],
      [-70, "#6f7784"],
      [-58, "#8a8176"],
      [-48, "#a4917b"],
      [-40, "#c8b69c"],
      [-33, "#9e7b5c"],
      [-28, "#d9ccb4"],
      [-22, "#ece2cf"],
      [-18, "#a87651"],
      [-12, "#8e5c3d"],
      [-7, "#c9a37f"],
      [-3, "#efe5d1"],
      [3, "#e8d9bd"],
      [8, "#b98c62"],
      [12, "#8a5535"],
      [17, "#a06a45"],
      [20, "#eadfc9"],
      [24, "#b98d68"],
      [28, "#dccdb1"],
      [33, "#a8896a"],
      [40, "#c7b89f"],
      [50, "#998c7c"],
      [62, "#7c7b80"],
      [75, "#646d7a"],
      [90, "#56616e"]
    ],
    storms: [
      { name: "Großer Roter Fleck", lat: -22.5, lon: 0, radius: 9, kind: "anticyclone", color: "#b8472a", strength: 0.9 },
      { name: "Oval BA", lat: -33, lon: 70, radius: 4, kind: "anticyclone", color: "#d8a58a", strength: 0.6 },
      { name: "Weißes Oval", lat: -41, lon: 150, radius: 2.5, kind: "anticyclone", color: "#f2ede2", strength: 0.5 },
      { name: "Weißes Oval", lat: -41, lon: 200, radius: 2.5, kind: "anticyclone", color: "#f2ede2", strength: 0.5 },
      { name: "Braune Barke", lat: 15, lon: 250, radius: 3, kind: "cyclone", color: "#6e4128", strength: 0.4 },
      { name: "Nordpol-Zyklon", lat: 84, lon: 0, radius: 5, kind: "cyclone", color: "#5f6d7d", strength: 0.5 },
      { name: "Südpol-Zyklon", lat: -85, lon: 0, radius: 5, kind: "cyclone", color: "#5f6d7d", strength: 0.5 }
    ],
    oblateness: 0.0649,
    tilt: 3.1,
    rotationHours: 9.93,
    cloud: "#efe8da",
    atmosphere: "#8fb2e0",
    atmosphereStrength: 0.35,
    rings: null,
    facts: { diameterKm: 142984, distanceAU: 5.2, yearDays: 4333, tempC: -108, gravity: 24.8, moons: 95, windMs: 150, clouds: ["Ammoniak-Eis, Ammoniumhydrogensulfid, Wasser", "ammonia ice, ammonium hydrosulfide, water"] },
    tune: { turbulence: 0.4, convection: 0.8, bandWobble: 0.6, stormTint: 1.6, relief: 0.35 }
  },
  {
    name: "Saturn",
    wind: [
      [-90, 0],
      [-78, 100],
      [-70, 0],
      [-62, 50],
      [-55, -20],
      [-45, 80],
      [-38, 0],
      [-30, 120],
      [-20, 300],
      [-10, 420],
      [0, 450],
      [10, 420],
      [20, 300],
      [30, 120],
      [38, 0],
      [45, 80],
      [55, -20],
      [62, 50],
      [70, 0],
      [78, 120],
      [90, 0]
    ],
    bands: [
      [-90, "#6f7a86"],
      [-70, "#a59a82"],
      [-50, "#cdb994"],
      [-35, "#dcc9a3"],
      [-20, "#e6d4ad"],
      [-8, "#ecdcb6"],
      [0, "#f0e2bf"],
      [8, "#e8d5ac"],
      [20, "#dcc59c"],
      [32, "#cfb58c"],
      [45, "#c8b393"],
      [60, "#b6a88f"],
      [74, "#8f9296"],
      [90, "#6c7886"]
    ],
    storms: [
      { name: "Nordpolar-Wirbel", lat: 88, lon: 0, radius: 4, kind: "cyclone", color: "#7d8a8f", strength: 0.3 },
      { name: "Weißer Fleck", lat: 42, lon: 90, radius: 3, kind: "anticyclone", color: "#f3ead6", strength: 0.3 }
    ],
    oblateness: 0.098,
    tilt: 26.7,
    rotationHours: 10.66,
    cloud: "#f4ecd8",
    atmosphere: "#d9c8a0",
    atmosphereStrength: 0.25,
    rings: { inner: 1.24, outer: 2.27, color: "#d8c7a4", opacity: 0.9 },
    facts: { diameterKm: 120536, distanceAU: 9.58, yearDays: 10759, tempC: -139, gravity: 10.4, moons: 274, windMs: 500, clouds: ["Ammoniak-Eis", "ammonia ice"] },
    tune: { turbulence: 0.35, convection: 0.25, bandWobble: 0.6, stormTint: 0.4, relief: 0.1 }
  },
  {
    name: "Neptun",
    wind: [
      [-90, 0],
      [-70, 250],
      [-50, 150],
      [-30, -100],
      [-15, -300],
      [0, -400],
      [15, -300],
      [30, -100],
      [50, 150],
      [70, 250],
      [90, 0]
    ],
    bands: [
      [-90, "#2b4f9e"],
      [-65, "#3c68c4"],
      [-45, "#3563be"],
      [-25, "#4a7bd6"],
      [-10, "#3a6bc8"],
      [0, "#4677d2"],
      [15, "#3e6fcc"],
      [35, "#4a7ad4"],
      [55, "#3563c0"],
      [75, "#2f58ad"],
      [90, "#284c98"]
    ],
    storms: [
      { name: "Großer Dunkler Fleck", lat: -20, lon: 0, radius: 7, kind: "anticyclone", color: "#1a2f70", strength: 0.7 },
      { name: "Begleitwolke", lat: -26, lon: 8, radius: 2.5, kind: "anticyclone", color: "#e6eefc", strength: 0.3 },
      { name: "Scooter", lat: -42, lon: 120, radius: 2.5, kind: "anticyclone", color: "#d9e4f8", strength: 0.4 },
      { name: "Dunkler Fleck 2", lat: -55, lon: 220, radius: 3.5, kind: "anticyclone", color: "#213a80", strength: 0.5 }
    ],
    oblateness: 0.0171,
    tilt: 28.3,
    rotationHours: 16.11,
    cloud: "#f2f6ff",
    atmosphere: "#7fb0ff",
    atmosphereStrength: 0.5,
    rings: null,
    facts: { diameterKm: 49528, distanceAU: 30.07, yearDays: 60190, tempC: -201, gravity: 11.2, moons: 16, windMs: 580, clouds: ["Methan-Eis", "methane ice"] },
    tune: { turbulence: 0.5, convection: 1.6, bandWobble: 0.7, stormTint: 0.8, relief: 0.6 }
  },
  {
    name: "Uranus",
    wind: [
      [-90, 0],
      [-60, 200],
      [-30, 60],
      [-15, -50],
      [0, -80],
      [15, -50],
      [30, 60],
      [60, 240],
      [90, 0]
    ],
    bands: [
      [-90, "#b9e4ea"],
      [-60, "#a9dbe3"],
      [-30, "#9fd3dd"],
      [0, "#9ccfda"],
      [30, "#a2d5de"],
      [55, "#b3dee6"],
      [75, "#c8e9ee"],
      [90, "#d2edf1"]
    ],
    storms: [
      { name: "Heller Fleck", lat: 30, lon: 60, radius: 3, kind: "anticyclone", color: "#e4f5f7", strength: 0.3 }
    ],
    oblateness: 0.0229,
    tilt: 97.8,
    rotationHours: 17.24,
    cloud: "#f0fbfc",
    atmosphere: "#bff0ff",
    atmosphereStrength: 0.45,
    rings: { inner: 1.64, outer: 2, color: "#6d7478", opacity: 0.25 },
    facts: { diameterKm: 51118, distanceAU: 19.19, yearDays: 30687, tempC: -195, gravity: 8.7, moons: 29, windMs: 250, clouds: ["Methan-Eis", "methane ice"], note: ["liegt auf der Seite (98° Neigung), dreht rückläufig", "lies on its side (98° tilt), spins retrograde"] },
    tune: { turbulence: 0.2, convection: 0.6, bandWobble: 0.4, stormTint: 0.4, relief: 0.4 }
  },
  {
    name: "Heißer Jupiter",
    wind: [
      [-90, 0],
      [-60, -200],
      [-30, 300],
      [-10, 1500],
      [0, 2e3],
      [10, 1500],
      [30, 300],
      [60, -200],
      [90, 0]
    ],
    bands: [
      [-90, "#2a1410"],
      [-60, "#4a1d12"],
      [-35, "#7a2e14"],
      [-15, "#b0481a"],
      [0, "#d8732a"],
      [15, "#a8431a"],
      [35, "#6e2912"],
      [60, "#43190f"],
      [90, "#26120e"]
    ],
    storms: [
      { name: "Heißer Fleck", lat: 0, lon: 30, radius: 14, kind: "anticyclone", color: "#ffb45a", strength: 0.3 }
    ],
    oblateness: 0.01,
    tilt: 0,
    rotationHours: 72,
    cloud: "#ffcf8a",
    atmosphere: "#ff9a5a",
    atmosphereStrength: 0.4,
    rings: null,
    facts: { diameterKm: 163e3, distanceAU: 0.031, yearDays: 2.2, tempC: 1200, gravity: 21, moons: 0, windMs: 2400, clouds: ["Silikate (Glasregen)", "silicates (glass rain)"], locked: !0, note: ["Werte wie HD 189733 b", "values like HD 189733 b"] },
    tune: { turbulence: 0.8, convection: 0.2, bandWobble: 1.2, stormTint: 0.5, relief: 0.15 }
  }
];
function N(t) {
  const e = parseInt(t.slice(1), 16), n = [e >> 16 & 255, e >> 8 & 255, e & 255].map((r) => Math.pow(r / 255, 2.2));
  return [n[0], n[1], n[2]];
}
function Se(t, e, n) {
  if (e <= t[0][0]) return t[0][1];
  for (let r = 1; r < t.length; r++)
    if (e <= t[r][0]) {
      const [s, a] = t[r - 1], [l, c] = t[r], h = (e - s) / (l - s);
      return n(a, c, h * h * (3 - 2 * h));
    }
  return t[t.length - 1][1];
}
const x = 64;
function Oe(t) {
  const e = Math.max(...t.wind.map(([, r]) => Math.abs(r))), n = new Float32Array(x);
  for (let r = 0; r < x; r++) {
    const s = -90 + 180 * r / (x - 1);
    n[r] = Se(t.wind, s, (a, l, c) => a + (l - a) * c) / e;
  }
  return n;
}
function le(t, e) {
  const n = t.bands.map(([l, c]) => [l, N(c)]), r = [], s = [0, 0, 0];
  for (let l = 0; l < x; l++) {
    const c = -90 + 180 * l / (x - 1), h = Se(n, c, (u, d, p) => [u[0] + (d[0] - u[0]) * p, u[1] + (d[1] - u[1]) * p, u[2] + (d[2] - u[2]) * p]);
    r.push(h);
    for (let u = 0; u < 3; u++) s[u] += h[u] / x;
  }
  const a = new Float32Array(x * 4);
  return r.forEach((l, c) => {
    for (let h = 0; h < 3; h++) a[c * 4 + h] = Math.max(0, s[h] + (l[h] - s[h]) * e);
    a[c * 4 + 3] = 1;
  }), a;
}
async function je(t) {
  const e = await createImageBitmap(t), n = 256, r = Math.max(64, Math.round(256 * e.height / e.width)), s = document.createElement("canvas");
  s.width = n, s.height = r;
  const a = s.getContext("2d", { willReadFrequently: !0 });
  a.drawImage(e, 0, 0, n, r);
  const l = a.getImageData(0, 0, n, r).data, c = (m) => 0.3 * l[m] + 0.59 * l[m + 1] + 0.11 * l[m + 2], h = (m) => {
    let g = 0;
    for (let v = 0; v < n; v++) c((m * n + v) * 4) > 18 && g++;
    return g > n * 0.02;
  };
  let u = 0, d = r - 1;
  for (; u < r - 1 && !h(u); ) u++;
  for (; d > u && !h(d); ) d--;
  const p = [];
  for (let m = 0; m < x; m++) {
    const g = 90 - 180 * m / (x - 1), v = Math.round(u + (d - u) * m / (x - 1));
    let w = 0, y = n - 1;
    for (; w < n - 1 && c((v * n + w) * 4) <= 18; ) w++;
    for (; y > w && c((v * n + y) * 4) <= 18; ) y--;
    const S = (w + y) / 2, M = Math.max(1, (y - w) * 0.2);
    let P = 0, B = 0, R = 0, L = 0;
    for (let A = Math.floor(S - M); A <= Math.ceil(S + M); A++) {
      const k = (v * n + Math.min(n - 1, Math.max(0, A))) * 4;
      P += l[k], B += l[k + 1], R += l[k + 2], L++;
    }
    const F = (A) => Math.round(A / L).toString(16).padStart(2, "0");
    p.push([g, `#${F(P)}${F(B)}${F(R)}`]);
  }
  return p.reverse();
}
function ce() {
  const t = new Uint32Array(1);
  return crypto.getRandomValues(t), t[0] || 1;
}
function $e(t, e = {}) {
  let n = t >>> 0;
  const r = () => {
    n = n + 1831565813 >>> 0;
    let f = n;
    return f = Math.imul(f ^ f >>> 15, f | 1), f ^= f + Math.imul(f ^ f >>> 7, f | 61), ((f ^ f >>> 14) >>> 0) / 4294967296;
  }, s = (f, z) => f + (z - f) * r(), a = (f) => f[Math.floor(r() * f.length)], l = (f, z, E) => {
    f = (f % 360 + 360) % 360;
    const I = z * Math.min(E, 1 - E), G = (O) => {
      const oe = (O + f / 30) % 12;
      return E - I * Math.max(-1, Math.min(oe - 3, 9 - oe, 1));
    }, q = (O) => Math.round(Math.min(1, Math.max(0, O)) * 255).toString(16).padStart(2, "0");
    return `#${q(G(0))}${q(G(8))}${q(G(4))}`;
  }, c = [
    { name: "jovian", hue: [20, 45], sat: [0.25, 0.55], zoneL: [0.78, 0.9], beltL: [0.35, 0.55], bands: [10, 18], eq: 1, jet: [40, 160], contrast: 1, atmoSat: 0.4 },
    { name: "saturnian", hue: [35, 55], sat: [0.2, 0.4], zoneL: [0.75, 0.88], beltL: [0.6, 0.72], bands: [8, 14], eq: 3, jet: [30, 120], contrast: 0.5, atmoSat: 0.3 },
    { name: "ice", hue: [185, 230], sat: [0.35, 0.65], zoneL: [0.55, 0.75], beltL: [0.4, 0.6], bands: [4, 9], eq: -2, jet: [60, 250], contrast: 0.6, atmoSat: 0.6 },
    { name: "hot", hue: [0, 30], sat: [0.55, 0.85], zoneL: [0.45, 0.65], beltL: [0.15, 0.3], bands: [5, 10], eq: 6, jet: [100, 400], contrast: 1.2, atmoSat: 0.8 },
    { name: "exotic", hue: [0, 360], sat: [0.3, 0.7], zoneL: [0.6, 0.85], beltL: [0.25, 0.5], bands: [6, 20], eq: 0, jet: [30, 200], contrast: 1, atmoSat: 0.6 }
  ], h = a(c), u = c.find((f) => f.name === e.family) ?? h, d = s(u.hue[0], u.hue[1]), p = d + a([30, 60, 150, 180, 210, -40]), m = Math.round(s(u.bands[0], u.bands[1])), g = e.bands && e.bands >= 2 ? Math.round(e.bands) : m, v = Array.from({ length: g }, () => s(0.4, 1.6)), w = v.reduce((f, z) => f + z, 0), y = [-90];
  for (const f of v) y.push(y[y.length - 1] + 180 * f / w);
  y[y.length - 1] = 90;
  const S = [];
  for (let f = 0; f < g; f++) {
    const z = (y[f] + y[f + 1]) / 2, E = Math.pow(Math.abs(z) / 90, 2), I = f % 2 === 0;
    let G = d + s(-12, 12);
    r() < 0.12 && (G = p);
    const q = I ? s(u.zoneL[0], u.zoneL[1]) : s(u.beltL[0], u.beltL[1]), O = l(G + E * s(-40, 60), s(u.sat[0], u.sat[1]) * (1 - 0.5 * E), q * (1 - 0.25 * E));
    S.push([z, O]);
  }
  S.unshift([-90, l(d + 180 * s(0, 0.4), 0.2, s(0.3, 0.5))]), S.push([90, l(d + 180 * s(0, 0.4), 0.2, s(0.3, 0.5))]);
  const M = [[-90, 0]];
  for (let f = 1; f < g; f++) {
    const z = y[f], E = f % 2 === 0 ? 1 : -1, I = Math.cos(z * Math.PI / 180), G = u.eq * 60 * Math.exp(-Math.pow(z / s(12, 30), 2));
    M.push([z, E * s(u.jet[0], u.jet[1]) * (0.4 + 0.6 * I) + G]);
  }
  M.push([90, 0]);
  const P = [], B = e.storms ?? "auto";
  if (B !== "none" && (r() < 0.6 || B === "many")) {
    const f = s(-35, 35);
    P.push({
      name: "Großer Fleck",
      lat: f,
      lon: s(0, 360),
      radius: s(5, 11),
      kind: "anticyclone",
      color: a([l(p, 0.6, 0.45), l(d - 20, 0.7, 0.4), l(d, 0.15, 0.9), l(d + 200, 0.5, 0.25)]),
      strength: s(0.6, 1)
    });
  }
  const R = Math.floor(s(0, 9)), L = B === "none" ? 0 : B === "few" ? Math.min(R, 3) : B === "many" ? R + 8 : R;
  for (let f = 0; f < L; f++) {
    const z = r() < 0.7;
    P.push({
      name: z ? "Oval" : "Barke",
      lat: s(-70, 70),
      lon: s(0, 360),
      radius: s(1.5, 4.5),
      kind: z ? "anticyclone" : "cyclone",
      color: z ? l(d, 0.15, s(0.85, 0.95)) : l(d, 0.5, s(0.2, 0.35)),
      strength: s(0.3, 0.7)
    });
  }
  const F = r() < 0.08 ? s(60, 100) : s(0, 35), A = r(), U = e.rings === "yes" || e.rings !== "no" && A < 0.4 ? (() => {
    const f = s(1.2, 1.7);
    return { inner: f, outer: f + s(0.25, 1.3), color: l(d + s(-30, 30), s(0.05, 0.3), s(0.4, 0.8)), opacity: s(0.15, 0.9) };
  })() : null, T = s(5e-3, 0.12), _ = s(7, 30), Le = l(d + s(-20, 20), 0.2, s(0.88, 0.97)), Ue = l(u.name === "hot" ? s(10, 30) : d + s(150, 210), u.atmoSat, 0.7), Ce = s(0.2, 0.6), Ne = { turbulence: s(0.2, 0.8), convection: s(0, 1.5), bandWobble: s(0.3, 1.2), stormTint: s(0.6, 2), relief: s(0.1, 0.5) }, ie = { jovian: [11e4, 16e4], saturnian: [95e3, 13e4], ice: [4e4, 6e4], hot: [12e4, 22e4], exotic: [3e4, 22e4] }, $ = u.name === "hot" ? s(0.02, 0.08) : u.name === "ice" ? s(12, 45) : s(2, 15), se = Math.round(s(ie[u.name][0], ie[u.name][1]) / 100) * 100, H = Math.round(255 / Math.sqrt($) - 273 + s(-20, 20) + (u.name === "hot" ? 300 : 0)), We = H > 700 ? ["Silikate, Eisen", "silicates, iron"] : H > 0 ? ["Wasser, Salze", "water, salts"] : H > -150 ? ["Ammoniak-Eis", "ammonia ice"] : ["Methan-Eis", "methane ice"], ae = {
    diameterKm: se,
    distanceAU: +$.toFixed($ < 1 ? 3 : 2),
    yearDays: +(365.25 * Math.pow($, 1.5)).toFixed(1),
    tempC: H,
    gravity: +(24.8 * (se / 142984) * s(0.6, 1.4)).toFixed(1),
    moons: u.name === "hot" ? 0 : Math.floor(s(0, 120)),
    windMs: Math.round(s(u.jet[0], u.jet[1]) * 2),
    clouds: We,
    locked: u.name === "hot"
  };
  return {
    name: `Zufall #${t.toString(16).padStart(8, "0")}`,
    wind: M,
    bands: S,
    storms: P,
    oblateness: T,
    tilt: F,
    rotationHours: u.name === "hot" ? ae.yearDays * 24 : _,
    facts: ae,
    cloud: Le,
    atmosphere: Ue,
    atmosphereStrength: Ce,
    rings: U,
    tune: Ne
  };
}
function He(t, e, n, r) {
  const s = 1 / Math.tan(t / 2), a = new Float32Array(16);
  return a[0] = s / e, a[5] = s, a[10] = r / (n - r), a[11] = -1, a[14] = n * r / (n - r), a;
}
function Ke(t, e, n) {
  const r = Z(Ze(t, e)), s = Z(ue(n, r)), a = ue(r, s);
  return new Float32Array([
    s[0],
    a[0],
    r[0],
    0,
    s[1],
    a[1],
    r[1],
    0,
    s[2],
    a[2],
    r[2],
    0,
    -Q(s, t),
    -Q(a, t),
    -Q(r, t),
    1
  ]);
}
function Ve(t, e) {
  const n = new Float32Array(16);
  for (let r = 0; r < 4; r++)
    for (let s = 0; s < 4; s++) {
      let a = 0;
      for (let l = 0; l < 4; l++) a += t[l * 4 + s] * e[r * 4 + l];
      n[r * 4 + s] = a;
    }
  return n;
}
function Je(t) {
  const e = new Float32Array(16);
  e[0] = t[5] * t[10] * t[15] - t[5] * t[11] * t[14] - t[9] * t[6] * t[15] + t[9] * t[7] * t[14] + t[13] * t[6] * t[11] - t[13] * t[7] * t[10], e[4] = -t[4] * t[10] * t[15] + t[4] * t[11] * t[14] + t[8] * t[6] * t[15] - t[8] * t[7] * t[14] - t[12] * t[6] * t[11] + t[12] * t[7] * t[10], e[8] = t[4] * t[9] * t[15] - t[4] * t[11] * t[13] - t[8] * t[5] * t[15] + t[8] * t[7] * t[13] + t[12] * t[5] * t[11] - t[12] * t[7] * t[9], e[12] = -t[4] * t[9] * t[14] + t[4] * t[10] * t[13] + t[8] * t[5] * t[14] - t[8] * t[6] * t[13] - t[12] * t[5] * t[10] + t[12] * t[6] * t[9], e[1] = -t[1] * t[10] * t[15] + t[1] * t[11] * t[14] + t[9] * t[2] * t[15] - t[9] * t[3] * t[14] - t[13] * t[2] * t[11] + t[13] * t[3] * t[10], e[5] = t[0] * t[10] * t[15] - t[0] * t[11] * t[14] - t[8] * t[2] * t[15] + t[8] * t[3] * t[14] + t[12] * t[2] * t[11] - t[12] * t[3] * t[10], e[9] = -t[0] * t[9] * t[15] + t[0] * t[11] * t[13] + t[8] * t[1] * t[15] - t[8] * t[3] * t[13] - t[12] * t[1] * t[11] + t[12] * t[3] * t[9], e[13] = t[0] * t[9] * t[14] - t[0] * t[10] * t[13] - t[8] * t[1] * t[14] + t[8] * t[2] * t[13] + t[12] * t[1] * t[10] - t[12] * t[2] * t[9], e[2] = t[1] * t[6] * t[15] - t[1] * t[7] * t[14] - t[5] * t[2] * t[15] + t[5] * t[3] * t[14] + t[13] * t[2] * t[7] - t[13] * t[3] * t[6], e[6] = -t[0] * t[6] * t[15] + t[0] * t[7] * t[14] + t[4] * t[2] * t[15] - t[4] * t[3] * t[14] - t[12] * t[2] * t[7] + t[12] * t[3] * t[6], e[10] = t[0] * t[5] * t[15] - t[0] * t[7] * t[13] - t[4] * t[1] * t[15] + t[4] * t[3] * t[13] + t[12] * t[1] * t[7] - t[12] * t[3] * t[5], e[14] = -t[0] * t[5] * t[14] + t[0] * t[6] * t[13] + t[4] * t[1] * t[14] - t[4] * t[2] * t[13] - t[12] * t[1] * t[6] + t[12] * t[2] * t[5], e[3] = -t[1] * t[6] * t[11] + t[1] * t[7] * t[10] + t[5] * t[2] * t[11] - t[5] * t[3] * t[10] - t[9] * t[2] * t[7] + t[9] * t[3] * t[6], e[7] = t[0] * t[6] * t[11] - t[0] * t[7] * t[10] - t[4] * t[2] * t[11] + t[4] * t[3] * t[10] + t[8] * t[2] * t[7] - t[8] * t[3] * t[6], e[11] = -t[0] * t[5] * t[11] + t[0] * t[7] * t[9] + t[4] * t[1] * t[11] - t[4] * t[3] * t[9] - t[8] * t[1] * t[7] + t[8] * t[3] * t[5], e[15] = t[0] * t[5] * t[10] - t[0] * t[6] * t[9] - t[4] * t[1] * t[10] + t[4] * t[2] * t[9] + t[8] * t[1] * t[6] - t[8] * t[2] * t[5];
  const n = t[0] * e[0] + t[1] * e[4] + t[2] * e[8] + t[3] * e[12];
  for (let r = 0; r < 16; r++) e[r] /= n;
  return e;
}
function de(t, e) {
  const n = Math.cos(t), r = Math.sin(t), s = Math.cos(e), a = Math.sin(e), l = [[s, 0, a], [0, 1, 0], [-a, 0, s]], c = [[n, -r, 0], [r, n, 0], [0, 0, 1]], h = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let u = 0; u < 3; u++)
    for (let d = 0; d < 3; d++) h[u][d] = c[u][0] * l[0][d] + c[u][1] * l[1][d] + c[u][2] * l[2][d];
  return h;
}
const Ze = (t, e) => [t[0] - e[0], t[1] - e[1], t[2] - e[2]], Q = (t, e) => t[0] * e[0] + t[1] * e[1] + t[2] * e[2], ue = (t, e) => [t[1] * e[2] - t[2] * e[1], t[2] * e[0] - t[0] * e[2], t[0] * e[1] - t[1] * e[0]], Z = (t) => {
  const e = Math.hypot(t[0], t[1], t[2]) || 1;
  return [t[0] / e, t[1] / e, t[2] / e];
};
function Ye() {
  try {
    const t = localStorage.getItem("fgp-lang");
    if (t === "en" || t === "de") return t;
  } catch {
  }
  return (navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en";
}
let Y = Ye();
function Qe(t) {
  Y = t;
  try {
    localStorage.setItem("fgp-lang", t);
  } catch {
  }
  document.documentElement.lang = t;
}
const i = (t, e) => Y === "de" ? t : e;
class re {
  constructor(e, n, r, s) {
    this.s = n, this.onChange = r, this.defaults = s, document.getElementById("tip")?.remove(), document.getElementById("detail")?.remove(), this.tip = document.createElement("div"), this.tip.id = "tip", this.tip.className = "tip", this.tip.hidden = !0, this.detail = document.createElement("section"), this.detail.id = "detail", this.detail.className = "detail", this.detail.hidden = !0, this.detail.setAttribute("aria-live", "polite"), document.body.append(this.tip, this.detail), this.body = document.createElement("div"), this.body.className = "controls", e.append(this.body), queueMicrotask(() => {
      this.sortRows(), this.addSearch();
    });
  }
  s;
  onChange;
  defaults;
  static heavy = /* @__PURE__ */ new Set(["velRes", "dyeRes", "curlRes", "particles"]);
  bindings = [];
  body;
  tip;
  // kleine Blase beim Drüberfahren
  detail;
  // Erklärfenster in der Ecke (über ⓘ)
  current = null;
  labelOf(e) {
    return (e.querySelector("label")?.textContent ?? "").trim().toLocaleLowerCase();
  }
  /** Regler in jedem Abschnitt alphabetisch; Hinweistexte bleiben oben, Knopfzeilen unten. */
  sortRows() {
    for (const e of this.body.querySelectorAll("details")) {
      const n = [...e.children].filter((a) => a.classList.contains("row") && !a.classList.contains("row-buttons") && a.querySelector("label"));
      n.sort((a, l) => this.labelOf(a).localeCompare(this.labelOf(l), void 0, { sensitivity: "base" }));
      const r = [...e.children].find((a) => a.tagName !== "SUMMARY" && !a.classList.contains("note")), s = document.createComment("");
      e.insertBefore(s, r ?? null);
      for (const a of n) e.insertBefore(a, s);
      s.remove();
    }
  }
  /** Suchfeld: zeigt nur Regler, deren Name mit dem Getippten beginnt („s“ → alle mit s, „sb“ → sba, sbc …). */
  addSearch() {
    const e = document.createElement("input");
    e.type = "search", e.className = "panel-search", e.placeholder = i("Regler suchen …", "Search controls …"), e.setAttribute("aria-label", i("Regler suchen", "Search controls")), this.body.prepend(e);
    const n = /* @__PURE__ */ new Map();
    e.addEventListener("input", () => {
      const r = e.value.trim().toLocaleLowerCase();
      for (const s of this.body.querySelectorAll("details")) {
        n.has(s) || n.set(s, s.open);
        let a = !1;
        for (const l of s.querySelectorAll(":scope > .row")) {
          const c = !r || !!l.querySelector("label") && this.labelOf(l).startsWith(r);
          l.classList.toggle("search-hide", !c), a ||= c;
        }
        for (const l of s.querySelectorAll(":scope > .note")) l.classList.toggle("search-hide", !!r);
        s.classList.toggle("search-hide", !!r && !a), s.open = r ? a : n.get(s) ?? s.open;
      }
      r || n.clear();
    });
  }
  /** Kurzfassung: erster Satz, ohne Formel. */
  short(e) {
    const n = e.replace(/<code[\s\S]*?<\/code>/g, "").replace(/<[^>]+>/g, ""), r = n.match(/^.*?[.!?](\s|$)/);
    return (r ? r[0] : n).trim();
  }
  showTip(e, n) {
    const r = e.getBoundingClientRect();
    this.tip.textContent = n, this.tip.hidden = !1;
    const s = this.tip.offsetWidth;
    let a = r.left - s - 10, l = r.top;
    a < 8 && (a = Math.max(8, r.left), l = r.top - this.tip.offsetHeight - 6), this.tip.style.left = `${a}px`, this.tip.style.top = `${Math.max(8, l)}px`;
  }
  hideTip() {
    this.tip.hidden = !0;
  }
  openDetail(e, n) {
    this.detail.innerHTML = `<button type="button" class="detail-close" aria-label="${i("Schließen", "Close")}">✕</button><h3>${e}</h3><div>${n}</div>`, this.detail.hidden = !1, this.detail.querySelector(".detail-close").addEventListener("click", () => {
      this.detail.hidden = !0;
    });
  }
  section(e, n, r = !0) {
    const s = document.createElement("details");
    s.open = r;
    const a = document.createElement("summary");
    if (a.textContent = e, s.append(a), n) {
      const l = document.createElement("p");
      l.className = "note", l.textContent = n, s.append(l);
    }
    return this.body.append(s), this.current = s, this;
  }
  row(e, n, r) {
    const s = document.createElement("div");
    s.className = "row";
    const a = document.createElement("label");
    a.htmlFor = `ctl-${e}`, a.textContent = n;
    const l = document.createElement("output");
    l.htmlFor = `ctl-${e}`, s.append(a, l);
    const c = this.defaults && e in this.defaults ? i(" Doppelklick auf den Namen setzt nur diesen Regler zurück.", " Double-click the name to reset just this control.") : "", h = document.createElement("button");
    h.type = "button", h.className = "info", h.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="4.8" r="1" fill="currentColor"/><path d="M8 7.2v4.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>', h.setAttribute("aria-label", `${i("Erklärung", "Explanation")}: ${n}`), h.addEventListener("click", (p) => {
      p.preventDefault(), this.openDetail(n, `${r}<p class="reset-hint">${c}</p>`);
    }), a.after(h);
    const u = this.short(r), d = () => this.showTip(s, u);
    return a.addEventListener("dblclick", (p) => {
      !this.defaults || !(e in this.defaults) || (p.preventDefault(), this.s[e] = this.defaults[e], this.refresh(), this.onChange(e));
    }), s.addEventListener("pointerenter", (p) => {
      p.pointerType === "mouse" && d();
    }), s.addEventListener("pointerleave", () => this.hideTip()), s.addEventListener("focusin", d), s.addEventListener("focusout", () => this.hideTip()), (this.current ?? this.body).append(s), { row: s, lab: a, out: l };
  }
  range(e, n, r, s, a, l, c = (h) => String(h)) {
    const { row: h, out: u } = this.row(e, n, l), d = document.createElement("input");
    d.type = "range", d.id = `ctl-${e}`, d.min = String(r), d.max = String(s), d.step = String(a), h.append(d);
    const p = () => {
      d.value = String(this.s[e]), u.textContent = c(Number(this.s[e]));
    }, m = re.heavy.has(e);
    return d.addEventListener("input", () => {
      u.textContent = c(Number(d.value)), !m && (this.s[e] = Number(d.value), this.onChange(e));
    }), m && d.addEventListener("change", () => {
      this.s[e] = Number(d.value), this.onChange(e);
    }), this.bindings.push({ key: e, update: p, row: h }), p(), this;
  }
  select(e, n, r, s) {
    const { row: a, out: l } = this.row(e, n, s);
    l.remove();
    const c = document.createElement("select");
    c.id = `ctl-${e}`;
    for (const [u, d] of r) {
      const p = document.createElement("option");
      p.value = u, p.textContent = d, c.append(p);
    }
    a.classList.add("row-select"), a.append(c);
    const h = () => {
      c.value = String(this.s[e]);
    };
    return c.addEventListener("change", () => {
      const u = Number(c.value);
      this.s[e] = typeof this.s[e] == "number" && !Number.isNaN(u) ? u : c.value, this.onChange(e);
    }), this.bindings.push({ key: e, update: h, row: a }), h(), this;
  }
  toggle(e, n, r) {
    const { row: s, lab: a, out: l } = this.row(e, n, r);
    l.remove();
    const c = document.createElement("input");
    c.type = "checkbox", c.id = `ctl-${e}`, s.classList.add("row-toggle"), a.prepend(c);
    const h = () => {
      c.checked = !!this.s[e];
    };
    return c.addEventListener("change", () => {
      this.s[e] = c.checked, this.onChange(e);
    }), this.bindings.push({ key: e, update: h, row: s }), h(), this;
  }
  buttons(e, n = {}) {
    const r = document.createElement("div");
    r.className = "row row-buttons";
    for (const [s, a, l] of e) {
      const c = document.createElement("button");
      c.type = "button", c.id = s, c.textContent = a, c.addEventListener("click", l), n[s] && (c.addEventListener("pointerenter", (h) => {
        h.pointerType === "mouse" && this.showTip(c, this.short(n[s]));
      }), c.addEventListener("pointerleave", () => this.hideTip()), c.addEventListener("focus", () => this.showTip(c, this.short(n[s]))), c.addEventListener("blur", () => this.hideTip())), r.append(c);
    }
    return (this.current ?? this.body).append(r), this;
  }
  file(e, n, r, s) {
    const { row: a, lab: l, out: c } = this.row(e, n, r);
    c.remove();
    const h = document.createElement("input");
    return h.type = "file", h.accept = "image/*", h.id = `ctl-${e}`, h.className = "file", l.htmlFor = h.id, a.classList.add("row-file"), a.append(h), h.addEventListener("change", () => {
      h.files?.[0] && s(h.files[0]), h.value = "";
    }), this;
  }
  /** Beliebiges eigenes Element in den aktuellen Abschnitt setzen. */
  custom(e) {
    return (this.current ?? this.body).append(e), this;
  }
  /** Blendet Regler ein/aus, z. B. Partikel-Regler nur im Partikel-Modus. */
  visible(e, n) {
    for (const r of this.bindings) r.key === e && (r.row.hidden = !n);
  }
  /** Regler, die im aktuellen Modus nichts bewirken: ausgegraut und nicht bedienbar. */
  disable(e, n) {
    for (const r of this.bindings) if (r.key === e) {
      r.row.classList.toggle("off", n);
      for (const s of r.row.querySelectorAll("input, select")) s.disabled = n;
    }
  }
  refresh() {
    for (const e of this.bindings) e.update();
  }
}
const Xe = [
  { kind: "gas", file: "index.html", de: "Gasriese", en: "Gas giant" },
  { kind: "rocky", file: "index.html?body=rocky", de: "Gesteinsplanet", en: "Rocky planet" },
  { kind: "moon", file: "", de: "Mond", en: "Moon", soon: [
    "Kommt später. Module: Gelände + Krater + Seed aus dem Gesteinsplaneten, ohne Meer, Wolken, Flüsse. Kreist um einen Gasriesen (z. B. Jupiters 92 Monde, bei jedem Laden gleich).",
    "Coming later. Modules: terrain + craters + seed from the rocky planet, no sea, clouds or rivers. Orbits a gas giant (e.g. Jupiter’s 92 moons, identical on every load)."
  ] },
  { kind: "asteroid", file: "", de: "Asteroid", en: "Asteroid", soon: [
    "Kommt später. Module: unregelmäßige Form + Krater + Seed + Gesteinsfarbe. Keine Atmosphäre.",
    "Coming later. Modules: irregular shape + craters + seed + rock colour. No atmosphere."
  ] },
  { kind: "lava", file: "", de: "Lavaplanet", en: "Lava planet", soon: [
    "Kommt später. Module: Gelände + Vulkane aus dem Gesteinsplaneten, Lava statt Meer, glühende Risse, dünne Atmosphäre.",
    "Coming later. Modules: terrain + volcanoes from the rocky planet, lava instead of sea, glowing cracks, thin atmosphere."
  ] }
], et = [
  ["", "aktuell", "current"],
  ["gas-v0.1.html", "Gasriese v0.1 (eingefroren)", "Gas giant v0.1 (frozen)"],
  ["gas-v0.4.html", "Gasriese v0.4 (eingefroren)", "Gas giant v0.4 (frozen)"],
  ["planets-v21.html", "Gesteinsplanet v21: Wolken an Bergen (eingefroren)", "Rocky planet v21: clouds at mountains (frozen)"],
  ["planets-v22.html", "Gesteinsplanet v22: Kantenfix/Quadtree (eingefroren)", "Rocky planet v22: edge fix/quadtree (frozen)"],
  ["planets-v23.html", "Gesteinsplanet v23: erste Flüsse + Vulkane (eingefroren)", "Rocky planet v23: first rivers + volcanoes (frozen)"],
  ["planets-v24.html", "Gesteinsplanet v24 (eingefroren)", "Rocky planet v24 (frozen)"],
  ["planets-v25.html", "Gesteinsplanet v25 (eingefroren)", "Rocky planet v25 (frozen)"]
], tt = "./";
function he(t) {
  return location.protocol === "file:" && !/Fluid-Gas-Planet\//.test(location.pathname) ? tt + t : t;
}
function nt(t) {
  const e = document.getElementById("ptype");
  if (e) {
    e.setAttribute("aria-label", i("Planetentyp", "Planet type")), e.innerHTML = "";
    for (const a of Xe) {
      if (a.soon) {
        const c = document.createElement("span");
        c.textContent = i(a.de, a.en), c.className = "soon", c.title = i(...a.soon), c.setAttribute("aria-disabled", "true"), e.append(c);
        continue;
      }
      const l = document.createElement("a");
      l.textContent = i(a.de, a.en), l.href = he(a.file), a.kind === t && l.setAttribute("aria-current", "page"), e.append(l);
    }
  }
  const n = e?.parentElement;
  if (n && !document.getElementById("ver-switch")) {
    const a = document.createElement("select");
    a.id = "ver-switch", a.setAttribute("aria-label", i("Version", "Version")), a.style.cssText = "width: auto; flex: 0 1 7.5em; min-width: 0;", n.insertBefore(a, document.getElementById("lang")), a.addEventListener("change", () => {
      a.value && (location.href = he(a.value));
    });
  }
  const r = document.getElementById("ver-switch");
  if (r) {
    r.innerHTML = "";
    for (const [a, l, c] of et) {
      const h = document.createElement("option");
      h.value = a, h.textContent = i(l, c), r.append(h);
    }
    r.value = "";
  }
  const s = document.getElementById("lang");
  s && (s.textContent = i("EN", "DE"));
}
const ke = `// Gemeinsamer Sternenhimmel aller Planeten-Seiten (Milchstraße als Würfelkarte + Sterne).\r
// Eigene Präfixe (sky_…), damit das Modul in jeden Shader passt, ohne Namen zu kollidieren.\r
// Simplexrauschen: Ashima Arts / Stefan Gustavson (MIT), Hash without Sine: David Hoskins (MIT).\r
const SKY_QPI = 0.785398163397;\r
struct SkyBasis { ex: vec3f, ey: vec3f, em: vec3f }\r
fn sky_basis(f: i32) -> SkyBasis {\r
  switch f {\r
    case 0: { return SkyBasis(vec3f(0.0, 0.0, -1.0), vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0)); }\r
    case 1: { return SkyBasis(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 1.0, 0.0), vec3f(-1.0, 0.0, 0.0)); }\r
    case 2: { return SkyBasis(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, -1.0), vec3f(0.0, 1.0, 0.0)); }\r
    case 3: { return SkyBasis(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), vec3f(0.0, -1.0, 0.0)); }\r
    case 4: { return SkyBasis(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0)); }\r
    default: { return SkyBasis(vec3f(-1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, -1.0)); }\r
  }\r
}\r
fn sky_face(d: vec3f) -> i32 {\r
  let a = abs(d);\r
  if (a.x >= a.y && a.x >= a.z) { return select(1, 0, d.x > 0.0); }\r
  if (a.y >= a.z) { return select(3, 2, d.y > 0.0); }\r
  return select(5, 4, d.z > 0.0);\r
}\r
fn sky_dir(f: i32, uv: vec2f) -> vec3f {\r
  let B = sky_basis(f);\r
  let st = tan((uv * 2.0 - 1.0) * SKY_QPI);\r
  return normalize(B.em + st.x * B.ex + st.y * B.ey);\r
}\r
// Richtung -> (Seite, uv in 0..1)\r
fn sky_uv(d: vec3f, f: i32) -> vec2f {\r
  let B = sky_basis(f);\r
  let m = dot(d, B.em);\r
  return atan(vec2f(dot(d, B.ex), dot(d, B.ey)) / m) / SKY_QPI * 0.5 + 0.5;\r
}\r
fn sky_hash33(q: vec3f) -> vec3f { var p3 = fract(q * vec3f(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }\r
fn sky_hash13(q: vec3f) -> f32 { var p3 = fract(q * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }\r
`, rt = `// Milchstraße erzeugen: Scheibe, Kern (Bulge), Staubbahnen, rote H-alpha-Wolken; Alpha = Sterndichte.\r
struct SkyJob { a: vec4f, b: vec4f, c: vec4f, d: vec4f, e: vec4f, f: vec4f, g: vec4f, h: vec4f }\r
@group(0) @binding(0) var<uniform> J: SkyJob;\r
@group(0) @binding(1) var dst: texture_storage_2d_array<rgba16float, write>;\r
fn sky_m289v3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }\r
fn sky_m289v4(x: vec4f) -> vec4f { return x - floor(x * (1.0 / 289.0)) * 289.0; }\r
fn sky_perm(x: vec4f) -> vec4f { return sky_m289v4(((x * 34.0) + 10.0) * x); }\r
fn sky_snoise(v: vec3f) -> f32 {\r
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);\r
  let D = vec4f(0.0, 0.5, 1.0, 2.0);\r
  var i = floor(v + dot(v, C.yyy));\r
  let x0 = v - i + dot(i, C.xxx);\r
  let g = step(x0.yzx, x0.xyz);\r
  let l = 1.0 - g;\r
  let i1 = min(g.xyz, l.zxy);\r
  let i2 = max(g.xyz, l.zxy);\r
  let x1 = x0 - i1 + C.xxx;\r
  let x2 = x0 - i2 + C.yyy;\r
  let x3 = x0 - D.yyy;\r
  i = sky_m289v3(i);\r
  let p = sky_perm(sky_perm(sky_perm(i.z + vec4f(0.0, i1.z, i2.z, 1.0)) + i.y + vec4f(0.0, i1.y, i2.y, 1.0)) + i.x + vec4f(0.0, i1.x, i2.x, 1.0));\r
  let ns = 0.142857142857 * D.wyz - D.xzx;\r
  let j = p - 49.0 * floor(p * ns.z * ns.z);\r
  let x_ = floor(j * ns.z);\r
  let y_ = floor(j - 7.0 * x_);\r
  let x = x_ * ns.x + ns.yyyy;\r
  let y = y_ * ns.x + ns.yyyy;\r
  let h = 1.0 - abs(x) - abs(y);\r
  let b0 = vec4f(x.xy, y.xy);\r
  let b1 = vec4f(x.zw, y.zw);\r
  let s0 = floor(b0) * 2.0 + 1.0;\r
  let s1 = floor(b1) * 2.0 + 1.0;\r
  let sh = -step(h, vec4f(0.0));\r
  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;\r
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;\r
  let p0 = normalize(vec3f(a0.xy, h.x));\r
  let p1 = normalize(vec3f(a0.zw, h.y));\r
  let p2 = normalize(vec3f(a1.xy, h.z));\r
  let p3 = normalize(vec3f(a1.zw, h.w));\r
  let m = max(0.5 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));\r
  let m4 = m * m * m * m;\r
  return 105.0 * dot(m4, vec4f(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));\r
}\r
fn sky_fbm(p0: vec3f, oct: i32) -> f32 {\r
  var n = 0.0;\r
  var a = 0.5;\r
  var p = p0;\r
  for (var i = 0; i < 12; i++) { if (i >= oct) { break; } n += a * sky_snoise(p); p = p * 2.02 + vec3f(1.7, 9.2, 3.1); a *= 0.5; }\r
  return n;\r
}\r
fn sky_sq(x: f32) -> f32 { return x * x; }\r
// a = (Seed, Helligkeit, Bandbreite, Kern), b = Pol, c = Kernrichtung, d = (Tönung, Staub, H-alpha)\r
// h = (Kachel-Anfang x, y, Seite, N), g = Kachel-Ende\r
@compute @workgroup_size(8, 8)\r
fn skyGen(@builtin(global_invocation_id) gid: vec3u) {\r
  let px = vec2f(gid.xy) + J.h.xy;\r
  if (px.x >= J.g.x || px.y >= J.g.y) { return; }\r
  let seed = J.a.x;\r
  let face = i32(J.h.z);\r
  let d = sky_dir(face, px / (J.h.w - 1.0));\r
  let pole = J.b.xyz;\r
  let core = J.c.xyz;\r
  // galaktische Breite, leicht verbogen, damit das Band nicht wie mit dem Lineal gezogen aussieht\r
  let warp = sky_fbm(d * 2.2 + seed, 4) * 0.07;\r
  let b = asin(clamp(dot(d, pole), -1.0, 1.0)) + warp;\r
  let toCore = acos(clamp(dot(d, core), -1.0, 1.0));\r
  let wd = J.a.z;\r
  let disk = exp(-sky_sq(b / (0.16 * wd)));\r
  let thin = exp(-sky_sq(b / (0.045 * wd)));\r
  let bulge = exp(-sky_sq(toCore / 0.42)) * exp(-sky_sq(b / (0.3 * wd))) * J.a.w;\r
  let glowN = sky_fbm(d * 5.0 + seed + 3.0, 6) * 0.5 + 0.5;\r
  let grain = sky_fbm(d * 28.0 + seed + 9.0, 4) * 0.5 + 0.5;\r
  var lum = disk * (0.25 + 0.75 * glowN) * (0.7 + 0.6 * grain) * (0.55 + 0.45 * exp(-sky_sq(toCore / 1.4)));\r
  lum += bulge * 1.6 * (0.8 + 0.4 * glowN);\r
  lum += 0.02;\r
  // Staubbahnen: verzweigte dunkle Adern in der Mittelebene\r
  let q = d * 7.0 + vec3f(sky_fbm(d * 3.0 + seed + 21.0, 4), sky_fbm(d * 3.0 + seed + 37.0, 4), 0.0) * 1.2;\r
  let lanes = smoothstep(-0.1, 0.45, sky_fbm(q + seed, 6));\r
  let dust = clamp(lanes * (thin * 1.2 + disk * 0.35) * J.d.y, 0.0, 0.8);\r
  lum *= 1.0 - dust;\r
  let tint = J.d.x;\r
  var col = mix(vec3f(0.78, 0.84, 1.0), vec3f(1.0, 0.82, 0.6), clamp(bulge * 1.4 + tint, 0.0, 1.0)) * lum;\r
  let hii = pow(max(sky_fbm(d * 9.0 + seed + 51.0, 5) - 0.18, 0.0) * 3.0, 3.0) * disk * (1.0 - dust);\r
  col += vec3f(1.0, 0.22, 0.28) * hii * 0.35 * J.d.z;\r
  col *= J.a.y;\r
  let dens = clamp(0.15 + disk * (1.0 - 0.7 * dust) + bulge, 0.0, 2.0);\r
  textureStore(dst, vec2u(px), face, vec4f(col, dens));\r
}\r
`, it = `// Himmel im Bild: Milchstraßen-Karte + punktförmige Sterne (Gauß-Scheibchen, pixelgenau, ohne Flimmern).\r
// n = Kartengröße (0 = Karte noch nicht fertig), neb/stars = Helligkeiten, pix = Pixelwinkel.\r
fn sky_stars(d: vec3f, pix: f32, dens: f32) -> vec3f {\r
  var acc = vec3f(0.0);\r
  let f = sky_face(d);\r
  let uv = sky_uv(d, f);\r
  var keeps = array<f32, 3>(0.3, 0.2, 0.12);\r
  var gains = array<f32, 3>(1.0, 0.55, 0.3);\r
  for (var L = 0; L < 3; L++) {\r
    let cells = 70.0 * exp2(f32(L));\r
    let g = uv * cells;\r
    let id = floor(g);\r
    let h = sky_hash33(vec3f(id, f32(f) * 17.0 + f32(L) * 131.0));\r
    if (h.z > keeps[L] * mix(0.6, 1.6, clamp(dens * 0.6, 0.0, 1.0))) { continue; }\r
    let pos = id + 0.25 + 0.5 * h.xy;\r
    let r = length(g - pos) / cells * 1.5708;\r
    let b = sky_hash13(vec3f(id * 1.37, f32(f) + f32(L) * 7.0));\r
    let flux = (pow(b, 16.0) * 5.0 + 0.018 * b * b) * gains[L];\r
    let sig = pix * 0.55;\r
    let I = flux * exp(-r * r / (2.0 * sig * sig));\r
    let tc = sky_hash13(vec3f(id, 5.0 + f32(L)));\r
    acc += I * mix(vec3f(1.0, 0.78, 0.6), vec3f(0.72, 0.82, 1.0), tc);\r
  }\r
  return acc;\r
}\r
fn skyColor(tx: texture_2d_array<f32>, sm: sampler, d: vec3f, pix: f32, n: f32, neb: f32, stars: f32) -> vec3f {\r
  var col = vec3f(0.0);\r
  var dens = 0.4;\r
  if (n > 0.5) {\r
    let f = sky_face(d);\r
    let uv = sky_uv(d, f) * ((n - 1.0) / n) + 0.5 / n;\r
    let nb = textureSampleLevel(tx, sm, uv, f, 0.0);\r
    col = nb.rgb * neb;\r
    dens = nb.a;\r
  }\r
  return col + sky_stars(d, pix, dens) * stars;\r
}\r
`, st = `// Mipmap-Stufe als 2×2-Mittel (WebGPU hat kein generateMipmap)\r
@group(0) @binding(0) var src: texture_2d_array<f32>;\r
@group(0) @binding(1) var dst: texture_storage_2d_array<rgba16float, write>;\r
@compute @workgroup_size(8, 8)\r
fn skyMip(@builtin(global_invocation_id) gid: vec3u) {\r
  let sz = textureDimensions(dst);\r
  if (gid.x >= sz.x || gid.y >= sz.y) { return; }\r
  let p = vec2i(gid.xy) * 2;\r
  let l = i32(gid.z);\r
  let c = textureLoad(src, p, l, 0) + textureLoad(src, p + vec2i(1, 0), l, 0) + textureLoad(src, p + vec2i(0, 1), l, 0) + textureLoad(src, p + vec2i(1, 1), l, 0);\r
  textureStore(dst, gid.xy, l, c * 0.25);\r
}\r
`, at = ke + rt, ot = ke + it, ze = { width: 1, core: 1, dust: 1, hii: 1, bright: 0.85, hue: 0.5 };
function lt(t) {
  let e = 1779033703 ^ t.length;
  for (let n = 0; n < t.length; n++)
    e = Math.imul(e ^ t.charCodeAt(n), 3432918353), e = e << 13 | e >>> 19;
  return () => (e = Math.imul(e ^ e >>> 16, 2246822507), e = Math.imul(e ^ e >>> 13, 3266489909), ((e ^= e >>> 16) >>> 0) / 4294967296);
}
const X = (t) => {
  const e = Math.hypot(t[0], t[1], t[2]) || 1;
  return [t[0] / e, t[1] / e, t[2] / e];
}, ct = (t, e) => [t[1] * e[2] - t[2] * e[1], t[2] * e[0] - t[0] * e[2], t[0] * e[1] - t[1] * e[0]];
function dt(t, e = ze) {
  const n = lt(t + "|galaxy"), r = X([n() * 2 - 1, n() * 2 - 1, n() * 2 - 1]), s = X(ct(r, X([n() * 2 - 1, n() * 2 - 1, n() * 2 - 1]))), a = new Float32Array(32);
  return a.set([n() * 400, 0.1 * e.bright, e.width, e.core, ...r, 0, ...s, 0, (e.hue - 0.5) * 0.3, e.dust, e.hii, 0]), a;
}
class ut {
  constructor(e, n) {
    this.device = e, this.n = n, this.levels = Math.floor(Math.log2(n)) + 1, this.tex = e.createTexture({
      size: [n, n, 6],
      format: "rgba16float",
      mipLevelCount: this.levels,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
    }), this.view = this.tex.createView({ dimension: "2d-array" }), this.genPipe = e.createComputePipeline({ layout: "auto", compute: { module: e.createShaderModule({ code: at }), entryPoint: "skyGen" } }), this.mipPipe = e.createComputePipeline({ layout: "auto", compute: { module: e.createShaderModule({ code: st }), entryPoint: "skyMip" } }), this.jobBuf = e.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }
  device;
  n;
  tex;
  view;
  ready = !1;
  face = 6;
  params = new Float32Array(32);
  genPipe;
  mipPipe;
  jobBuf;
  levels;
  /** Neuen Himmel anfordern; er entsteht in den nächsten Bildern. */
  generate(e, n = ze) {
    this.params = dt(e, n), this.face = 0;
  }
  /** Pro Bild aufrufen (vor dem Zeichnen): rechnet höchstens eine Würfelseite, zuletzt die Mipmaps. */
  tick(e) {
    if (this.face > 6) return;
    const n = this.device, r = this.n;
    if (this.face < 6) {
      const a = this.params.slice();
      a.set([r, r, 0, 0], 24), a.set([0, 0, this.face, r], 28), n.queue.writeBuffer(this.jobBuf, 0, a);
      const l = e.beginComputePass();
      l.setPipeline(this.genPipe), l.setBindGroup(0, n.createBindGroup({ layout: this.genPipe.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: this.jobBuf } },
        { binding: 1, resource: this.tex.createView({ dimension: "2d-array", baseMipLevel: 0, mipLevelCount: 1 }) }
      ] })), l.dispatchWorkgroups(Math.ceil(r / 8), Math.ceil(r / 8)), l.end(), this.face++;
      return;
    }
    const s = e.beginComputePass();
    s.setPipeline(this.mipPipe);
    for (let a = 1; a < this.levels; a++) {
      const l = Math.max(1, r >> a);
      s.setBindGroup(0, n.createBindGroup({ layout: this.mipPipe.getBindGroupLayout(0), entries: [
        { binding: 0, resource: this.tex.createView({ dimension: "2d-array", baseMipLevel: a - 1, mipLevelCount: 1 }) },
        { binding: 1, resource: this.tex.createView({ dimension: "2d-array", baseMipLevel: a, mipLevelCount: 1 }) }
      ] })), s.dispatchWorkgroups(Math.ceil(l / 8), Math.ceil(l / 8), 6);
    }
    s.end(), this.face = 7, this.ready = !0;
  }
}
const W = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820, o = {
  preset: "Jupiter",
  seed: 1,
  quality: W ? "phone" : "high",
  // Rechenmodell und Darstellung, frei kombinierbar:
  flow: "fluid",
  // 'fluid' = Stable Fluids (mofu), 'curl' = Curl-Noise (jasper-r / Gaseous Giganticus)
  look: "dye",
  // 'dye' = Farbstoff, 'particles' = Partikel mit Bandfarben, 'pure' = reine Partikel (jasper-r)
  timeScale: 1,
  // Tempo: Simulationszeit pro Sekunde Echtzeit (ändert nur die Geschwindigkeit, nicht die Form)
  retro: !1,
  // Drehrichtung rückläufig: spiegelt Rotation, Jets und Sturm-Drehsinn
  seamless: !1,
  // nahtlos exakte Abtastung an Würfelkanten (für GPUs ohne nahtlose Cubemaps)
  paused: !1,
  autoQuality: !0,
  // hält ≥ 60 fps: misst beim Laden, passt Auflösung an
  pixelDensity: W ? 1 : 1.25,
  // Render-Pixel pro CSS-Pixel (über 1 = Supersampling)
  // Fluid
  velRes: 128,
  iterations: 24,
  bfecc: !0,
  jetStrength: 0.06,
  jetRelax: 0.25,
  omega: 0.4,
  turbulence: 0.6,
  turbScale: 4,
  confinement: 6,
  // Look von v0.1 (vom Urheber auf Hardware bestätigt)
  drag: 0.02,
  // Curl-Noise
  curlStrength: 0.5,
  curlFreq: 4,
  curlSpeed: 0.04,
  curlOctaves: 4,
  curlRes: W ? 256 : 384,
  vortexCount: 32,
  vortexStrength: 1,
  // Partikel
  particles: W ? 262144 : 1048576,
  lifetime: 6,
  opacity: 0.35,
  blur: 0.12,
  fade: 0.05,
  // Partikel-Schiene: Verblassen zur Mittelfarbe (1/s)
  viewFocus: 0,
  // Anteil der Partikel, die im Sichtfeld geboren werden
  // Zufallsplanet
  rndFamily: "",
  rndBands: 0,
  rndStorms: "auto",
  rndRings: "auto",
  // Farbe und Stürme
  dyeRes: W ? 384 : 768,
  bandRelax: 0.06,
  fineStripes: 0,
  bandWobble: 1,
  contrast: 1,
  convection: 0.8,
  storms: !0,
  remember: !1,
  // Modul „Zustand merken“: eingeschwungenen Zustand im Browser speichern, beim nächsten Laden sofort da
  focusStorm: !0,
  // beim Start den Hauptsturm (z. B. Großer Roter Fleck) auf die Tagseite vor die Kamera drehen
  stormStrength: 1,
  stormSize: 1,
  eddyStrength: 1.5,
  // Flüssigkeit 1,5 (Vorgabe des Urhebers), Partikel 1 – siehe EDDY_BY_LOOK
  // Strudel-Stärke: Antrieb von Turbulenz, Stürmen und Wirbeln, getrennt von der Jet-Geschwindigkeit           // Größe der Stürme (Radius-Faktor), unabhängig vom Drehtempo
  stormTint: 0.6,
  stormHold: 1,
  stormSpawn: 2,
  // Vorgabe des Urhebers (war 0,3)
  kickLife: 30,
  // Vorgabe des Urhebers (war 2,5)
  // Sekunden, die ein neuer Sturm angetrieben wird, danach lebt er frei
  // Licht und Ansicht
  sunAngle: 35,
  // Relief-Module (alle aus = wie v0.4)
  reliefMulti: !1,
  // mehrstufiges Relief
  reliefCoarse: 1,
  // Anteil der groben Stufen (große Wirbel, Bänder)
  reliefFine: 0.3,
  // Anteil der feinen Stufe (Krümel, Partikel)
  reliefSize: 1,
  // Größe der groben Stufen
  reliefAdapt: !0,
  // Schrittweite an die Pixelgröße anpassen (gegen Krabbeln/Flimmern)
  depthOn: !1,
  // Tiefe aus der Physik
  depthStrength: 1,
  depthSource: "pressure",
  // 'pressure' (nur Stable Fluids) | 'vorticity' (beide Modelle)
  twilight: "off",
  // Vorgabe des Urhebers (v0.4-Streifen sah wie eine Kraterlinie aus)
  // Dämmerung: 'v04' | 'off' | 'soft'
  rimGlow: "v04",
  // Randschimmer: 'v04' | 'soft' | 'off'
  pomOn: !1,
  // Parallaxe mit Eigenschatten
  pomHeight: 1,
  pomShadow: 1,
  relief: 1,
  // Flüssigkeit 1,0 (Vorgabe des Urhebers), Partikel 0,35 – siehe RELIEF_BY_LOOK
  limb: 1.15,
  atmosphere: 1,
  exposure: 0.95,
  nebula: 1,
  // Milchstraße (gemeinsamer Himmel aller Planeten-Seiten)
  stars: 1,
  spinSpeed: 0.5,
  view: 0,
  map: !1
};
try {
  o.remember = localStorage.getItem("fgp-remember") === "1";
} catch {
}
const fe = { dye: 1, particles: 0.35, pure: 0.35 }, pe = { dye: 1.5, particles: 1, pure: 1 }, ee = { ...o }, me = {
  // Startwerte vom Urheber (2026-09-28, auf Hardware ausgesucht)
  phone: { velRes: 128, dyeRes: 1024, curlRes: 256, particles: 983040, dpr: 1, iterations: 12 },
  standard: { velRes: 128, dyeRes: 768, curlRes: 384, particles: 1048576, dpr: 1.25 },
  high: { velRes: 256, dyeRes: 2048, curlRes: 768, particles: 983040, dpr: 1.75, iterations: 24, fluid: { velRes: 352, dpr: 2 } },
  ultra: { velRes: 256, dyeRes: 2560, curlRes: 1024, particles: 4489216, dpr: 4, iterations: 24 },
  // alte Startwerte (v0.4), weiter wählbar
  phone04: { velRes: 96, dyeRes: 384, curlRes: 256, particles: 262144, dpr: 1 },
  high04: { velRes: 192, dyeRes: 1024, curlRes: 768, particles: 4194304, dpr: 1.75 },
  ultra04: { velRes: 256, dyeRes: 1536, curlRes: 1024, particles: 8388608, dpr: 2 }
}, b = document.getElementById("view"), ge = document.getElementById("status"), be = document.getElementById("fps"), ht = document.getElementById("loading"), Me = document.getElementById("load-bar"), te = document.getElementById("load-note");
function J(t) {
  ht.classList.toggle("done", !t), t && (Me.style.width = "0%");
}
function C(t) {
  ge.hidden = !1, ge.innerHTML = t;
}
async function ft() {
  if (!("gpu" in navigator)) {
    C(i("<b>WebGPU fehlt in diesem Browser.</b> Nimm Chrome oder Edge ab Version 113, Safari ab 26 oder Firefox ab 141. Auf Android geht Chrome ab Version 121.", "<b>This browser has no WebGPU.</b> Use Chrome or Edge 113+, Safari 26+ or Firefox 141+. On Android, Chrome 121+."));
    return;
  }
  const t = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!t) {
    C(i("<b>Keine WebGPU-Grafikkarte gefunden.</b> Prüfe, ob die Hardwarebeschleunigung im Browser eingeschaltet ist.", "<b>No WebGPU graphics adapter found.</b> Check that hardware acceleration is enabled in the browser."));
    return;
  }
  const e = await t.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: t.limits.maxStorageBufferBindingSize,
      maxBufferSize: t.limits.maxBufferSize,
      maxTextureDimension2D: t.limits.maxTextureDimension2D
    }
  });
  e.lost.then((r) => C(`${i("<b>Die Grafikkarte wurde getrennt.</b>", "<b>The GPU was disconnected.</b>")} ${r.message} ${i("Lade die Seite neu.", "Reload the page.")}`)), e.addEventListener("uncapturederror", (r) => {
    console.error(r.error.message), C(`<b>GPU-Fehler:</b> ${r.error.message}`);
  });
  const n = new D(e);
  window.gasPlanet = {
    settings: o,
    capture: () => n.capture(),
    readRow: (r, s, a) => n.readRow(r, s, a),
    filmstrip: (r) => n.filmstrip(r),
    selftest: () => n.selftest(),
    frame: () => n.frameCount()
  }, document.getElementById("lang")?.addEventListener("click", () => n.toggleLang()), window.addEventListener("keydown", (r) => {
    if (r.target?.tagName === "INPUT" && r.target.type === "text" || !(r.ctrlKey || r.metaKey)) return;
    const a = r.key.toLowerCase();
    a === "z" && !r.shiftKey ? (r.preventDefault(), n.undo()) : (a === "y" || a === "z" && r.shiftKey) && (r.preventDefault(), n.redo());
  }), n.run();
}
const j = 16, Pe = 32, Be = Pe + 4, Re = Be + 4, Ae = Re + 4, Te = Ae + 4, De = Te + x, Fe = De + x * 4, Ee = Fe + j * 4, Ge = Ee + j * 4, ve = Ge + j, ye = 76, ne = 1 / 60, xe = 1200, we = [[256, 1536], [192, 1024], [128, 768], [128, 512], [96, 384], [64, 256]], pt = 8, mt = 5e3;
class D {
  constructor(e) {
    this.device = e, this.offscreen || this.ctx.configure({ device: e, format: this.format, alphaMode: "opaque" }), this.sampler = e.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" }), this.simBuf = e.createBuffer({ size: ve * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }), this.renderBuf = e.createBuffer({ size: ye * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const n = GPUShaderStage.COMPUTE;
    this.computeLayout = e.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: n, buffer: { type: "uniform" } },
        { binding: 1, visibility: n, sampler: { type: "filtering" } },
        { binding: 2, visibility: n, texture: { sampleType: "float", viewDimension: "cube" } },
        { binding: 3, visibility: n, texture: { sampleType: "float", viewDimension: "cube" } },
        { binding: 4, visibility: n, storageTexture: { access: "write-only", format: "rgba16float", viewDimension: "2d-array" } },
        { binding: 5, visibility: n, buffer: { type: "storage" } },
        { binding: 6, visibility: n, texture: { sampleType: "float", viewDimension: "2d-array" } },
        { binding: 7, visibility: n, texture: { sampleType: "float", viewDimension: "2d-array" } }
      ]
    }), this.fluidModule = this.module("fluid", K + _e), this.tracerModule = this.module("tracers", K + Ie), this.buildPipes(!1);
    const r = this.module("render", qe + ot);
    this.sky = new ut(e, W ? 512 : 1024), this.sky.generate(String(o.seed) + o.preset), this.renderPipe = e.createRenderPipeline({
      layout: "auto",
      vertex: { module: r, entryPoint: "vs" },
      fragment: { module: r, entryPoint: "fs", targets: [{ format: this.format }] },
      primitive: { topology: "triangle-list" }
    }), this.dummy = this.cubeField(8), this.zonal = e.createBuffer({ size: 256 * 4, usage: GPUBufferUsage.STORAGE }), this.applyQuality(!0), this.applyPreset(), this.buildUI(), this.bindInput(), this.remember();
  }
  device;
  // Testmodus #offscreen: rendert in eine Textur statt auf den Canvas (für Headless-Browser).
  offscreen = location.hash.startsWith("#offscreen");
  // Testmodus: #offscreen&warm=300 verkürzt das Vorrechnen (Software-Renderer sind langsam).
  warmSteps = Number(new URLSearchParams(location.hash.slice(1)).get("warm")) || xe;
  format = this.offscreen ? "rgba8unorm" : navigator.gpu.getPreferredCanvasFormat();
  target = null;
  ctx = b.getContext("webgpu");
  sampler;
  simBuf;
  renderBuf;
  simData = new Float32Array(ve);
  renderData = new Float32Array(ye);
  computeLayout;
  fluidModule;
  tracerModule;
  pipes = {};
  pipesBuilt = null;
  renderPipe;
  sky;
  vel = [];
  prs = [];
  aux;
  div;
  dye = [];
  flow;
  dummy;
  parts;
  zonal;
  partCapacity = 0;
  vc = 0;
  pc = 0;
  dc = 0;
  preset = V[0];
  storms = [];
  stepAcc = 0;
  needsDye = !1;
  time = 0;
  frame = 0;
  spin = 0;
  runSeed = 0;
  // "Neu starten": neuer Lauf, gleicher Planet
  achieved = 1;
  // tatsächlich erreichter Zeitraffer
  needsInit = !0;
  warm = 0;
  // Vorrechnen: Schritte pro Auftrag, so bemessen, dass ein Auftrag ~40 ms GPU-Zeit braucht.
  warmRate = 4;
  warmTotal = xe;
  stepMs = 0;
  // gemessene GPU-Zeit pro Simulationsschritt
  warmStart = 0;
  manualSkip = !1;
  // Vorspulen per Knopf: volle Länge, keine Begrenzung der Ladezeit
  calibrated = !1;
  downgrades = 0;
  renderScale = 1;
  // dynamische Render-Auflösung für ≥ 60 fps
  scaleAcc = 0;
  scaleFrames = 0;
  goodSeconds = 0;
  cam = { yaw: -0.35, pitch: 0.12, dist: 4.3 };
  dpr = 1.75;
  panel;
  /** Compute-Pipelines, wahlweise mit nahtlos exakter Abtastung an Würfelkanten (SEAMLESS). */
  buildPipes(e) {
    if (this.pipesBuilt === e) return;
    const n = this.device.createPipelineLayout({ bindGroupLayouts: [this.computeLayout] }), r = { SEAMLESS: e ? 1 : 0 };
    for (const s of ["initVel", "clear", "advect", "curl", "zonalClear", "zonalSum", "forces", "divergence", "jacobi", "project"])
      this.pipes[s] = this.device.createComputePipeline({ layout: n, compute: { module: this.fluidModule, entryPoint: s, constants: r } });
    for (const s of ["initDye", "advectDye", "flowField", "moveParticles", "blurRelax", "blurFade"])
      this.pipes[s] = this.device.createComputePipeline({ layout: n, compute: { module: this.tracerModule, entryPoint: s, constants: r } });
    this.pipesBuilt = e;
  }
  module(e, n) {
    const r = this.device.createShaderModule({ label: e, code: n });
    return r.getCompilationInfo().then((s) => {
      const a = s.messages.filter((l) => l.type === "error");
      a.length && C(`<b>Shader ${e}:</b> ` + a.map((l) => `Zeile ${l.lineNum}: ${l.message}`).join("<br>"));
    }), r;
  }
  cubeField(e) {
    const n = this.device.createTexture({
      size: [e, e, 6],
      format: "rgba16float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
    });
    return {
      tex: n,
      n: e,
      cube: n.createView({ dimension: "cube" }),
      store: n.createView({ dimension: "2d-array" })
    };
  }
  // ---------- Ressourcen passend zu den Reglern ----------
  applyQuality(e) {
    const n = me[o.quality];
    if (e && n) {
      const r = o.look === "dye" && n.fluid ? n.fluid : null;
      o.velRes = r ? r.velRes : n.velRes, o.dyeRes = n.dyeRes, o.curlRes = n.curlRes, o.particles = n.particles, o.pixelDensity = r ? r.dpr : n.dpr, n.iterations && (o.iterations = n.iterations);
    }
    this.dpr = o.pixelDensity, this.allocVel(), this.allocDye(), this.allocParticles();
  }
  allocVel() {
    for (const n of [...this.vel, ...this.prs]) n.tex.destroy();
    this.aux?.tex.destroy(), this.div?.tex.destroy(), this.flow?.tex.destroy();
    const e = o.velRes;
    this.device.pushErrorScope("out-of-memory"), this.vel = [this.cubeField(e), this.cubeField(e)], this.prs = [this.cubeField(e), this.cubeField(e)], this.aux = this.cubeField(e), this.div = this.cubeField(e), this.flow = this.cubeField(o.curlRes), this.needsInit = !0, this.device.popErrorScope().then((n) => {
      n && (o.curlRes > 256 ? o.curlRes = Math.max(256, o.curlRes / 2 | 0) : o.velRes = Math.max(32, o.velRes / 2 | 0), this.memoryNote(), this.allocVel());
    });
  }
  memoryNote() {
    this.panel?.refresh();
    const e = document.getElementById("diag-msg") ?? te;
    e.textContent = i("Nicht genug Grafikspeicher: Auflösung automatisch halbiert.", "Not enough GPU memory: resolution halved automatically.");
  }
  allocDye() {
    for (const e of this.dye) e.tex.destroy();
    this.device.pushErrorScope("out-of-memory"), this.dye = [this.cubeField(o.dyeRes), this.cubeField(o.dyeRes)], this.device.popErrorScope().then((e) => {
      !e || o.dyeRes <= 128 || (o.dyeRes = Math.max(128, o.dyeRes / 2 | 0), this.memoryNote(), this.allocDye());
    }), this.needsDye = !0;
  }
  allocParticles() {
    const e = Math.min(o.particles, Math.floor(this.device.limits.maxStorageBufferBindingSize / 32));
    o.particles = e, !(e <= this.partCapacity) && (this.parts?.destroy(), this.device.pushErrorScope("out-of-memory"), this.parts = this.device.createBuffer({ size: e * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }), this.partCapacity = e, this.device.popErrorScope().then((n) => {
      !n || e <= 16384 || (this.partCapacity = 0, o.particles = Math.max(16384, Math.floor(e / 2 / 16384) * 16384), this.allocParticles(), this.panel?.refresh(), te.textContent = i(`Nicht genug Grafikspeicher: ${o.particles} Partikel`, `Not enough GPU memory: ${o.particles} particles`));
    }));
  }
  /** Strömung und Darstellung, die die gewählte Schiene tatsächlich benutzt. */
  flowMode() {
    return o.flow;
  }
  lookMode() {
    return o.look;
  }
  dir() {
    return o.retro ? -1 : 1;
  }
  randomOptions() {
    return { family: o.rndFamily, bands: o.rndBands, storms: o.rndStorms, rings: o.rndRings };
  }
  applyPreset() {
    const e = o.preset === "Zufall" ? $e(o.seed, this.randomOptions()) : V.find((r) => r.name === o.preset) ?? V[0], n = e.tune;
    o.turbulence = n.turbulence, o.convection = n.convection, o.bandWobble = n.bandWobble, o.stormTint = n.stormTint, o.relief = n.relief, this.usePreset(e), this.needsInit = !0;
  }
  /** Planetendaten übernehmen, ohne die Regler zu verändern (für Laden und Rückgängig). */
  usePreset(e) {
    this.preset = e, this.storms = this.preset.storms.map((n) => ({
      lat: n.lat,
      lon: n.lon,
      radius: n.radius,
      strength: n.strength,
      kick: 0,
      life: 0,
      sign: (n.kind === "cyclone" ? 1 : -1) * (n.lat >= 0 ? 1 : -1) * this.dir(),
      color: N(n.color)
    })), this.jets = Oe(this.preset).map((n) => n * this.dir()), this.writeTables(), this.panel?.refresh(), this.updateInfo();
  }
  // ---------- Verlauf, Speichern, Planeten-Code ----------
  history = [];
  hIndex = -1;
  hTimer = 0;
  snapshot() {
    const { paused: e, ...n } = o;
    return JSON.stringify({ v: 1, s: n, preset: this.preset });
  }
  /** Nach jeder Änderung (kurz verzögert) einen Stand merken. */
  remember() {
    clearTimeout(this.hTimer), this.hTimer = window.setTimeout(() => {
      const e = this.snapshot();
      this.history[this.hIndex] !== e && (this.history = this.history.slice(0, this.hIndex + 1), this.history.push(e), this.history.length > 100 && this.history.shift(), this.hIndex = this.history.length - 1, this.updateUndoButtons());
    }, 400);
  }
  undo() {
    this.hIndex > 0 && (this.hIndex--, this.restore(this.history[this.hIndex]), this.updateUndoButtons());
  }
  redo() {
    this.hIndex < this.history.length - 1 && (this.hIndex++, this.restore(this.history[this.hIndex]), this.updateUndoButtons());
  }
  updateUndoButtons() {
    const e = document.getElementById("btn-undo"), n = document.getElementById("btn-redo");
    e && (e.disabled = this.hIndex <= 0), n && (n.disabled = this.hIndex >= this.history.length - 1);
  }
  /** Einen gespeicherten Stand anwenden; nur neu starten, wenn sich der Planet geändert hat. */
  restore(e) {
    const n = JSON.parse(e), r = { ...o }, s = JSON.stringify(this.preset), a = n.s, l = a.track === "fluid" ? { flow: "fluid", look: "dye" } : a.track === "particles" ? { flow: "curl", look: "pure" } : {};
    if (delete a.track, Object.assign(o, a, l, { paused: r.paused }), this.buildPipes(o.seamless), this.dpr = o.pixelDensity, r.retro !== o.retro && (this.spin = -this.spin), this.usePreset(n.preset), (r.velRes !== o.velRes || r.curlRes !== o.curlRes) && this.allocVel(), r.dyeRes !== o.dyeRes && this.allocDye(), r.particles !== o.particles && this.allocParticles(), (s !== JSON.stringify(n.preset) || r.retro !== o.retro) && (this.needsInit = !0), (r.flow !== o.flow || r.look !== o.look) && (this.needsDye = !0), r.quality !== o.quality) {
      this.buildUI();
      return;
    }
    b.classList.toggle("map", o.map), this.updateVisibility(), this.panel.refresh();
  }
  encode(e) {
    const n = new TextEncoder().encode(e);
    let r = "";
    return n.forEach((s) => {
      r += String.fromCharCode(s);
    }), "FGP1:" + btoa(r);
  }
  decode(e) {
    const n = e.trim().replace(/^FGP1:/, ""), r = atob(n);
    return new TextDecoder().decode(Uint8Array.from(r, (s) => s.charCodeAt(0)));
  }
  loadSaves() {
    try {
      return JSON.parse(localStorage.getItem("fgp-saves") || "[]");
    } catch {
      return [];
    }
  }
  storeSaves(e) {
    try {
      localStorage.setItem("fgp-saves", JSON.stringify(e));
    } catch {
    }
  }
  /** Abschnitt "Speichern": Verlauf, benannte Speicherplätze, Code zum Weitergeben. */
  buildSaveSection() {
    const e = document.createElement("div");
    e.className = "save-box", e.innerHTML = `
      <div class="row row-buttons">
        <button id="btn-undo" type="button">${i("↶ Rückgängig", "↶ Undo")}</button>
        <button id="btn-redo" type="button">${i("↷ Wiederholen", "↷ Redo")}</button>
      </div>
      <div class="row row-save">
        <input id="save-name" type="text" maxlength="40" placeholder="${i("Name, z. B. Mein Jupiter", "Name, e.g. My Jupiter")}">
        <button id="btn-save" type="button">${i("Speichern", "Save")}</button>
      </div>
      <div class="row row-save">
        <select id="save-list"></select>
        <button id="btn-load" type="button">${i("Laden", "Load")}</button>
        <button id="btn-delete" type="button" aria-label="${i("Gespeicherten Stand löschen", "Delete saved state")}">✕</button>
      </div>
      <div class="row row-save">
        <input id="code-in" type="text" placeholder="${i("Planeten-Code einfügen", "Paste planet code")}">
        <button id="btn-code-load" type="button">${i("Laden", "Load")}</button>
      </div>
      <div class="row row-buttons">
        <button id="btn-code-copy" type="button">${i("Planeten-Code kopieren", "Copy planet code")}</button>
      </div>
      <p class="note" id="save-msg" aria-live="polite"></p>`, this.panel.custom(e);
    const n = (a) => e.querySelector("#" + a), r = (a) => {
      n("save-msg").textContent = a;
    }, s = () => {
      const a = n("save-list"), l = this.loadSaves();
      a.innerHTML = l.length ? "" : `<option value="">${i("noch nichts gespeichert", "nothing saved yet")}</option>`, l.forEach((c, h) => {
        const u = document.createElement("option");
        u.value = String(h), u.textContent = c.name, a.append(u);
      });
    };
    s(), n("btn-undo").addEventListener("click", () => this.undo()), n("btn-redo").addEventListener("click", () => this.redo()), n("btn-save").addEventListener("click", () => {
      const a = n("save-name"), l = a.value.trim() || `${this.preset.name} · ${(/* @__PURE__ */ new Date()).toLocaleString()}`, c = this.loadSaves().filter((h) => h.name !== l);
      c.unshift({ name: l, code: this.encode(this.snapshot()) }), this.storeSaves(c.slice(0, 50)), s(), a.value = "", r(i(`Gespeichert: ${l} (nur in diesem Browser).`, `Saved: ${l} (in this browser only).`));
    }), n("btn-load").addEventListener("click", () => {
      const a = Number(n("save-list").value), l = this.loadSaves()[a];
      l && (this.restore(this.decode(l.code)), this.remember(), r(i(`Geladen: ${l.name}`, `Loaded: ${l.name}`)));
    }), n("btn-delete").addEventListener("click", () => {
      const a = Number(n("save-list").value), l = this.loadSaves();
      if (!l[a]) return;
      const [c] = l.splice(a, 1);
      this.storeSaves(l), s(), r(i(`Gelöscht: ${c.name}`, `Deleted: ${c.name}`));
    }), n("btn-code-copy").addEventListener("click", () => {
      const a = this.encode(this.snapshot()), l = n("code-in");
      navigator.clipboard.writeText(a).then(() => r(i("Code kopiert. Einfügen und „Laden“ stellt genau diesen Planeten wieder her.", "Code copied. Paste it and press “Load” to restore exactly this planet."))).catch(() => {
        l.value = a, l.select(), r(i("Code steht im Feld oben, markiert zum Kopieren.", "The code is in the field above, selected for copying."));
      });
    }), n("btn-code-load").addEventListener("click", () => {
      try {
        this.restore(this.decode(n("code-in").value)), this.remember(), r(i("Planet aus Code geladen.", "Planet loaded from code."));
      } catch {
        r(i("Das ist kein gültiger Planeten-Code. Er beginnt mit FGP1:", "That is not a valid planet code. It starts with FGP1:"));
      }
    }), this.updateUndoButtons();
  }
  jets = new Float32Array(x);
  centre = [0.5, 0.5, 0.5];
  writeTables() {
    const e = this.simData;
    e.set(this.jets, Te);
    const n = le(this.preset, o.contrast);
    e.set(n, De), e.set([...N(this.preset.cloud), 1], Pe);
    const r = [0, 0, 0];
    let s = 0;
    for (let a = 0; a < x; a++) {
      const l = Math.cos((-0.5 + a / (x - 1)) * Math.PI) + 1e-3;
      for (let c = 0; c < 3; c++) r[c] += n[a * 4 + c] * l;
      s += l;
    }
    this.centre = [r[0] / s, r[1] / s, r[2] / s];
  }
  /** Kamerarichtung in Körperkoordinaten (für Partikel im Sichtfeld). */
  camBody() {
    const e = Math.cos(this.cam.pitch), n = [Math.sin(this.cam.yaw) * e, Math.sin(this.cam.pitch), Math.cos(this.cam.yaw) * e], r = de(this.preset.tilt * Math.PI / 180, this.spin);
    return Z([
      r[0][0] * n[0] + r[1][0] * n[1] + r[2][0] * n[2],
      r[0][1] * n[0] + r[1][1] * n[1] + r[2][1] * n[2],
      r[0][2] * n[0] + r[1][2] * n[1] + r[2][2] * n[2]
    ]);
  }
  jetAt(e) {
    const n = Math.min(Math.max((e / Math.PI + 0.5) * (x - 1), 0), x - 1), r = Math.floor(n), s = Math.min(r + 1, x - 1);
    return (this.jets[r] + (this.jets[s] - this.jets[r]) * (n - r)) * o.jetStrength;
  }
  // ---------- Uniforms ----------
  /** init: alle Stürme mit voller Stärke, damit sie beim Start als Wirbel eingesetzt werden. */
  writeSim(e, n = !1) {
    const r = this.simData, s = o.jetStrength, a = 0.06 * o.eddyStrength, l = this.activeStorms();
    r.set([
      e,
      this.time,
      this.frame,
      o.velRes,
      o.dyeRes,
      this.flow.n,
      o.vortexStrength,
      o.omega * this.dir(),
      s,
      o.jetRelax,
      o.turbulence * a * 0.05,
      o.turbScale,
      o.confinement,
      o.drag,
      o.fineStripes,
      o.bfecc ? 1 : 0,
      o.bandRelax,
      o.convection,
      a * o.stormStrength,
      l.length,
      o.curlStrength * a,
      o.curlFreq,
      o.curlSpeed,
      o.curlOctaves,
      o.particles,
      o.lifetime,
      o.opacity,
      o.blur,
      // Shader-Rauschen: Planeten-Seed plus Lauf-Seed ("Neu starten" würfelt nur den Lauf neu).
      (o.seed + this.runSeed) % 1e5,
      o.bandWobble,
      o.stormTint,
      o.vortexCount
    ], 0), r.set([...this.centre, o.fade], Be), r.set([...this.camBody(), this.lookMode() === "dye" ? 0 : o.viewFocus], Re), r.set([this.lookMode() === "pure" ? 1 : 0, a, 0, 0], Ae), l.forEach((c, h) => {
      const u = c.lat * Math.PI / 180, d = c.lon * Math.PI / 180;
      r.set([Math.cos(u) * Math.cos(d), Math.sin(u), Math.cos(u) * Math.sin(d), c.radius * o.stormSize * Math.PI / 180], Fe + h * 4), r.set([c.sign * c.strength, ...c.color], Ee + h * 4);
      let p = c.kick > 0 ? Math.sin(Math.PI * (1 - c.kick / Math.max(c.life, 1e-3))) : this.flowMode() === "curl" ? 1 : o.stormHold;
      n && c.kick === 0 && (p = 1), r[Ge + h] = p;
    }), this.device.queue.writeBuffer(this.simBuf, 0, r);
  }
  activeStorms() {
    return this.storms.filter((e) => e.kick > 0 || o.storms).slice(0, j);
  }
  /** Hauptsturm (größter nicht-polarer Vorlagen-Sturm) auf die Tagseite vor die Kamera drehen, etwas vor der
   *  Bildmitte in Drehrichtung, damit er über die Tagseite wandert. Neigung wird vernachlässigt. */
  faceMainStorm() {
    if (!o.focusStorm) return;
    let e = null;
    if (this.storms.forEach((r, s) => {
      s < this.preset.storms.length && Math.abs(r.lat) < 70 && (!e || r.radius > e.radius) && (e = r);
    }), !e) return;
    const n = Math.PI / 2 - this.cam.yaw;
    this.spin = e.lon * Math.PI / 180 - (n + 0.3 * this.dir());
  }
  /** Stürme bewegen, neue entstehen lassen, abgelaufene entfernen. */
  updateStorms(e) {
    for (const n of this.storms) {
      if (n.kick > 0) {
        n.kick = Math.max(0, n.kick - e);
        continue;
      }
      const r = n.lat * Math.PI / 180;
      n.lon -= this.jetAt(r) * e / Math.max(Math.cos(r), 0.2) * (180 / Math.PI);
    }
    if (this.storms = this.storms.filter((n, r) => r < this.preset.storms.length || n.kick > 0), this.flowMode() === "fluid" && Math.random() < o.stormSpawn * e && this.activeStorms().length < j) {
      const n = (Math.random() * 2 - 1) * 65, r = n * Math.PI / 180, s = -(this.jetAt(r + 0.01) - this.jetAt(r - 0.01)), a = s === 0 ? Math.random() < 0.5 ? 1 : -1 : Math.sign(s), l = a * (n >= 0 ? 1 : -1) * this.dir() < 0, c = le(this.preset, o.contrast), h = Math.round((n + 90) / 180 * (x - 1)) * 4, u = l ? N(this.preset.cloud) : [c[h] * 0.55, c[h + 1] * 0.5, c[h + 2] * 0.45];
      this.storms.push({
        lat: n,
        lon: Math.random() * 360,
        radius: 1.2 + Math.random() * 2.8,
        sign: a,
        strength: 0.5 + Math.random() * 0.6,
        color: u,
        kick: o.kickLife,
        life: o.kickLife
      });
    }
  }
  writeRender() {
    const e = b.width, n = b.height, r = Math.cos(this.cam.pitch), s = Math.sin(this.cam.pitch), a = [Math.sin(this.cam.yaw) * r * this.cam.dist, s * this.cam.dist, Math.cos(this.cam.yaw) * r * this.cam.dist], l = He(32 * Math.PI / 180, e / n, 0.05, 100), c = Ke(a, [0, 0, 0], [0, 1, 0]), h = Je(Ve(l, c)), u = de(this.preset.tilt * Math.PI / 180, this.spin), d = o.sunAngle * Math.PI / 180, p = Z([Math.sin(d), 0.18, Math.cos(d)]), m = N(this.preset.atmosphere), g = this.preset.rings, v = g ? N(g.color) : [0, 0, 0], w = this.renderData;
    w.set(h, 0), w.set([
      ...a,
      1,
      u[0][0],
      u[1][0],
      u[2][0],
      0,
      u[0][1],
      u[1][1],
      u[2][1],
      0,
      u[0][2],
      u[1][2],
      u[2][2],
      0,
      ...p,
      1.7,
      m[0],
      m[1],
      m[2],
      this.preset.atmosphereStrength * o.atmosphere,
      this.preset.oblateness,
      o.relief,
      o.limb,
      o.view,
      o.map ? 1 : 0,
      g ? g.inner : 0,
      g ? g.outer : 0,
      g ? g.opacity : 0,
      e / n,
      this.time,
      o.exposure,
      o.dyeRes,
      v[0],
      v[1],
      v[2],
      0.6,
      1 / Math.max(o.jetStrength, 1e-4),
      2 * Math.tan(16 * Math.PI / 180) / n,
      this.sky.ready ? this.sky.n : 0,
      o.nebula,
      o.stars,
      o.reliefMulti ? o.reliefCoarse : 0,
      o.reliefFine,
      o.reliefAdapt ? 1 : 0,
      o.depthOn ? 1 : 0,
      o.depthStrength,
      o.depthSource === "pressure" && this.flowMode() === "fluid" ? 0 : 1,
      o.velRes,
      o.pomOn ? 1 : 0,
      o.pomHeight,
      o.pomShadow,
      o.reliefSize,
      { v04: 0, off: 1, soft: 2 }[o.twilight] ?? 0,
      { v04: 0, soft: 1, off: 2 }[o.rimGlow] ?? 0,
      0,
      0
    ], 16), this.device.queue.writeBuffer(this.renderBuf, 0, w);
  }
  // ---------- Compute-Helfer ----------
  /** buf: Puffer an Bindung 5 – Partikel für die Tracer-Shader, Breitenkreis-Mittel für den Fluid-Löser. */
  bind(e, n, r, s = this.zonal) {
    return this.device.createBindGroup({
      layout: this.computeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.simBuf } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: (e ?? this.dummy).cube },
        { binding: 3, resource: (n ?? this.dummy).cube },
        { binding: 4, resource: r.store },
        { binding: 5, resource: { buffer: s } },
        { binding: 6, resource: (e ?? this.dummy).store },
        { binding: 7, resource: (n ?? this.dummy).store }
      ]
    });
  }
  run2D(e, n, r, s, a) {
    e.setPipeline(this.pipes[n]), e.setBindGroup(0, this.bind(r, s, a));
    const l = Math.ceil(a.n / 8);
    e.dispatchWorkgroups(l, l, 6);
  }
  /** all = Wind, Druck, Partikel und Farbe; sonst nur die Farbe. */
  initFields(e, n) {
    const r = e.beginComputePass();
    n && (this.run2D(r, "initVel", null, null, this.vel[0]), this.run2D(r, "clear", null, null, this.prs[0]), this.run2D(r, "clear", null, null, this.aux), this.vc = 0, this.pc = 0), this.run2D(r, "initDye", null, null, this.dye[0]), this.dc = 0, r.end(), n && e.clearBuffer(this.parts);
  }
  step(e) {
    const n = e.beginComputePass();
    let r;
    if (this.flowMode() === "fluid") {
      this.run2D(n, "advect", this.vel[this.vc], null, this.vel[1 - this.vc]), this.vc = 1 - this.vc, this.run2D(n, "curl", this.vel[this.vc], null, this.aux), n.setPipeline(this.pipes.zonalClear), n.setBindGroup(0, this.bind(null, null, this.div)), n.dispatchWorkgroups(4), this.run2D(n, "zonalSum", this.vel[this.vc], null, this.div), this.run2D(n, "forces", this.vel[this.vc], this.aux, this.vel[1 - this.vc]), this.vc = 1 - this.vc, this.run2D(n, "divergence", this.vel[this.vc], null, this.div);
      for (let a = 0; a < o.iterations; a++)
        this.run2D(n, "jacobi", this.prs[this.pc], this.div, this.prs[1 - this.pc]), this.pc = 1 - this.pc;
      this.run2D(n, "project", this.vel[this.vc], this.prs[this.pc], this.vel[1 - this.vc]), this.vc = 1 - this.vc, r = this.vel[this.vc];
    } else
      this.run2D(n, "flowField", null, null, this.flow), r = this.flow;
    const s = this.lookMode();
    if (s === "dye")
      this.run2D(n, "advectDye", this.dye[this.dc], r, this.dye[1 - this.dc]), this.dc = 1 - this.dc, n.end();
    else {
      n.end();
      const a = this.dye[this.dc], l = this.dye[1 - this.dc];
      e.copyTextureToTexture({ texture: a.tex }, { texture: l.tex }, [a.n, a.n, 6]);
      const c = e.beginComputePass();
      c.setPipeline(this.pipes.moveParticles), c.setBindGroup(0, this.bind(a, r, l, this.parts));
      const h = Math.ceil(o.particles / 64);
      c.dispatchWorkgroups(Math.min(h, 65535), Math.ceil(h / 65535)), this.run2D(c, s === "pure" ? "blurFade" : "blurRelax", l, null, a), c.end();
    }
    return r;
  }
  // ---------- Hauptschleife ----------
  last = performance.now();
  grab = null;
  fpsNow = 0;
  frameCount() {
    return this.frame;
  }
  /** Das nächste gezeichnete Bild als Canvas (Testmodus: aus der Offscreen-Textur). */
  grabFrame() {
    return new Promise((e) => {
      this.grab = async () => {
        const n = document.createElement("canvas");
        n.width = b.width, n.height = b.height;
        const r = n.getContext("2d");
        if (this.offscreen) {
          const s = await this.capture(), a = new Image();
          a.src = s, await a.decode(), r.drawImage(a, 0, 0);
        } else
          r.drawImage(b, 0, 0);
        e(n);
      };
    });
  }
  /**
   * Filmstreifen: mehrere Bilder im Abstand nebeneinander, dazu einfache Messwerte.
   * detail = mittlere |Laplace| der Helligkeit (Feinstruktur), change = mittlere Änderung zum
   * vorigen Bild (Bewegung). Damit lassen sich Bewegung und Schärfe vergleichen, ohne dass
   * jemand Einzelbilder beschreiben muss.
   */
  async filmstrip(e = {}) {
    const n = e.frames ?? 8, r = e.cols ?? 4, s = e.scale ?? 0.5, a = [], l = [];
    let c = null, h = 0, u = 0;
    for (let y = 0; y < n; y++) {
      if (y > 0)
        if (e.everySteps) {
          const k = this.frame + e.everySteps;
          for (; this.frame < k; ) await new Promise((U) => setTimeout(U, 30));
        } else await new Promise((k) => setTimeout(k, (e.everySeconds ?? 2) * 1e3));
      const S = await this.grabFrame();
      h || (h = Math.max(1, Math.round(S.width * s)), u = Math.max(1, Math.round(S.height * s)));
      const M = document.createElement("canvas");
      M.width = h, M.height = u;
      const P = M.getContext("2d", { willReadFrequently: !0 });
      P.drawImage(S, 0, 0, h, u);
      const B = P.getImageData(0, 0, h, u).data, R = (k) => 0.3 * B[k] + 0.59 * B[k + 1] + 0.11 * B[k + 2];
      let L = 0, F = 0, A = 0;
      for (let k = 1; k < u - 1; k++) for (let U = 1; U < h - 1; U++) {
        const T = (k * h + U) * 4, _ = R(T);
        _ < 8 || (L += Math.abs(4 * _ - R(T - 4) - R(T + 4) - R(T - h * 4) - R(T + h * 4)), c && (A += Math.abs(_ - (0.3 * c[T] + 0.59 * c[T + 1] + 0.11 * c[T + 2]))), F++);
      }
      c = new Uint8ClampedArray(B), l.push({ t: +this.time.toFixed(2), frame: this.frame, fps: this.fpsNow, detail: +(L / Math.max(F, 1)).toFixed(3), change: +(A / Math.max(F, 1)).toFixed(3) }), a.push(M);
    }
    const d = Math.ceil(n / r), p = 54, m = document.createElement("canvas");
    m.width = h * r, m.height = u * d + p;
    const g = m.getContext("2d");
    g.fillStyle = "#000", g.fillRect(0, 0, m.width, m.height), g.font = "13px monospace", a.forEach((y, S) => {
      const M = S % r * h, P = Math.floor(S / r) * u;
      g.drawImage(y, M, P), g.fillStyle = "rgba(0,0,0,0.55)", g.fillRect(M, P, 230, 20), g.fillStyle = "#eee", g.fillText(`t=${l[S].t}s  detail ${l[S].detail}  Δ ${l[S].change}`, M + 5, P + 14);
    }), g.fillStyle = "#ccc";
    const v = `${this.preset.name} · ${o.flow}+${o.look} · ${o.quality} · ${o.velRes}²/${o.dyeRes}² · ${o.particles} ${i("Partikel", "particles")} · ${this.fpsNow} fps · ${i("Zeitraffer", "time lapse")} ${o.timeScale}×`, w = `jet ${o.jetStrength} · Ω ${o.omega}${o.retro ? " retro" : ""} · conf ${o.confinement} · turb ${o.turbulence} · bandRelax ${o.bandRelax} · spawn ${o.stormSpawn}/${o.kickLife}s · relief ${o.relief} · v0.3.0`;
    return g.fillText(v, 8, u * d + 20), g.fillText(w, 8, u * d + 42), { image: m.toDataURL("image/png"), stats: l };
  }
  async recordFilmstrip() {
    const e = (r) => {
      const s = document.getElementById("diag-msg");
      s && (s.textContent = r);
    }, n = document.getElementById("btn-film");
    n && (n.disabled = !0), e(i("Nehme 8 Bilder in 14 s auf …", "Recording 8 frames over 14 s …"));
    try {
      const r = await this.filmstrip({ frames: 8, everySeconds: 2 }), s = document.createElement("a");
      s.href = r.image, s.download = `fluid-gas-planet-${this.preset.name.replace(/[^\w-]+/g, "-")}-${Date.now()}.png`, s.click(), e(i("Gespeichert. Das PNG enthält die wichtigsten Einstellungen in der Fußzeile.", "Saved. The PNG lists the key settings in its footer."));
    } catch (r) {
      e(`${i("Aufnahme fehlgeschlagen:", "Recording failed:")} ${r instanceof Error ? r.message : String(r)}`);
    }
    n && (n.disabled = !1);
  }
  /**
   * Misst, ob die Cubemap-Abtastung der Grafikkarte an Würfelkanten nahtlos ist: ein glattes
   * Testfeld wird geschrieben und zwischen den Texelzentren wieder abgetastet.
   */
  async selftest() {
    const e = this.device, n = 256, r = K.slice(0, K.indexOf("// Richtung -> (st in [0,1]²")), s = "fn fld(p: vec3f) -> f32 { return sin(p.x * 9.0) * 0.5 + p.y * 0.3; }", a = r.replace(/@group\(0\) @binding\(0\) var<uniform> S: Sim;/, ""), l = e.createTexture({ size: [n, n, 6], format: "rgba16float", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING }), c = e.createComputePipeline({ layout: "auto", compute: { entryPoint: "main", module: e.createShaderModule({ code: a + s + `
      @group(0) @binding(0) var dst: texture_storage_2d_array<rgba16float, write>;
      @compute @workgroup_size(8, 8, 1) fn main(@builtin(global_invocation_id) id: vec3u) {
        textureStore(dst, id.xy, id.z, vec4f(fld(faceDir(id.z, (vec2f(id.xy) + 0.5) / ${n}.0)), 0.0, 0.0, 1.0));
      }` }) } }), h = e.createComputePipeline({ layout: "auto", compute: { entryPoint: "main", module: e.createShaderModule({ code: a + s + `
      @group(0) @binding(0) var t: texture_cube<f32>;
      @group(0) @binding(1) var s: sampler;
      @group(0) @binding(2) var<storage, read_write> o: array<atomic<u32>, 4>;
      @compute @workgroup_size(8, 8, 1) fn main(@builtin(global_invocation_id) id: vec3u) {
        let st = (vec2f(id.xy) + vec2f(0.37, 0.61)) / ${n}.0;
        let p = faceDir(id.z, st);
        let e = u32(abs(textureSampleLevel(t, s, p, 0.0).r - fld(p)) * 1e6);
        if (min(min(st.x, 1.0 - st.x), min(st.y, 1.0 - st.y)) * ${n}.0 < 1.5) { atomicMax(&o[0], e); } else { atomicMax(&o[1], e); }
      }` }) } }), u = e.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }), d = e.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), p = e.createCommandEncoder(), m = p.beginComputePass();
    m.setPipeline(c), m.setBindGroup(0, e.createBindGroup({ layout: c.getBindGroupLayout(0), entries: [{ binding: 0, resource: l.createView({ dimension: "2d-array" }) }] })), m.dispatchWorkgroups(n / 8, n / 8, 6), m.setPipeline(h), m.setBindGroup(0, e.createBindGroup({ layout: h.getBindGroupLayout(0), entries: [
      { binding: 0, resource: l.createView({ dimension: "cube" }) },
      { binding: 1, resource: e.createSampler({ magFilter: "linear", minFilter: "linear" }) },
      { binding: 2, resource: { buffer: u } }
    ] })), m.dispatchWorkgroups(n / 8, n / 8, 6), m.end(), p.copyBufferToBuffer(u, 0, d, 0, 16), e.queue.submit([p.finish()]), await d.mapAsync(GPUMapMode.READ);
    const g = new Uint32Array(d.getMappedRange().slice(0));
    d.destroy(), u.destroy(), l.destroy();
    const v = g[0] / 1e6, w = g[1] / 1e6;
    return { edge: v, interior: w, seamless: v < Math.max(0.01, w * 20) };
  }
  async runSelftest() {
    const e = document.getElementById("diag-msg"), n = await this.selftest();
    !n.seamless && !o.seamless && (o.seamless = !0, this.buildPipes(!0), this.panel.refresh(), this.remember()), e && (e.textContent = n.seamless ? i(
      `Nahtlos: Fehler an Kanten ${n.edge.toFixed(4)}, innen ${n.interior.toFixed(4)}. „Exakte Kanten“ ist nicht nötig. Sichtbare Übergänge kommen dann nicht von der Abtastung (siehe docs/STATUS.md).`,
      `Seamless: error at edges ${n.edge.toFixed(4)}, inside ${n.interior.toFixed(4)}. “Exact edges” is not needed. Visible transitions then do not come from sampling (see docs/STATUS.md).`
    ) : i(
      `Naht gefunden: Fehler an Kanten ${n.edge.toFixed(4)}, innen ${n.interior.toFixed(4)}. „Exakte Kanten“ ist jetzt an.`,
      `Seam found: error at edges ${n.edge.toFixed(4)}, inside ${n.interior.toFixed(4)}. “Exact edges” is now on.`
    ));
  }
  fpsAcc = 0;
  fpsFrames = 0;
  run() {
    const e = async (n) => {
      const r = Math.min((n - this.last) / 1e3, 0.1);
      if (this.last = n, this.resize(), this.initIfNeeded(), this.warm > 0 && !o.paused)
        await this.warmBatch();
      else {
        if (this.fpsAcc += r, this.fpsFrames++, this.fpsAcc > 0.5) {
          const s = o.timeScale !== 1 ? ` · ${i("Zeitraffer", "time lapse")} ${this.achieved.toFixed(1)}×` : "";
          this.fpsNow = Math.round(this.fpsFrames / this.fpsAcc), be.textContent = `${this.fpsNow} fps${s}`, this.fpsAcc = 0, this.fpsFrames = 0;
        }
        if (this.frameOnce(r), this.adaptScale(r), this.grab) {
          const s = this.grab;
          this.grab = null, await s();
        }
        this.offscreen && await this.device.queue.onSubmittedWorkDone();
      }
      requestAnimationFrame(e);
    };
    requestAnimationFrame(e);
  }
  initIfNeeded() {
    if (!this.needsInit && !this.needsDye) return;
    const e = this.device.createCommandEncoder();
    this.needsInit && (this.time = 0, this.stepAcc = 0), this.writeSim(0, !0), this.initFields(e, this.needsInit), this.device.queue.submit([e.finish()]), this.warm = this.needsInit ? this.warmSteps : Math.max(this.warm, Math.min(300, this.warmSteps)), this.warmTotal = this.warm, this.warmStart = performance.now(), this.manualSkip = !1;
    const n = this.needsInit;
    this.needsInit = !1, this.needsDye = !1, J(!0), this.restored = !1, n && o.remember && this.loadState();
  }
  // ---------- Modul „Zustand merken“ (IndexedDB, nur in diesem Browser) ----------
  restored = !1;
  static VIEW_ONLY = /* @__PURE__ */ new Set([
    "sunAngle",
    "relief",
    "limb",
    "atmosphere",
    "exposure",
    "nebula",
    "stars",
    "spinSpeed",
    "view",
    "map",
    "paused",
    "timeScale",
    "pixelDensity",
    "autoQuality",
    "quality",
    "reliefMulti",
    "reliefCoarse",
    "reliefFine",
    "reliefSize",
    "reliefAdapt",
    "depthOn",
    "depthStrength",
    "depthSource",
    "pomOn",
    "pomHeight",
    "pomShadow",
    "twilight",
    "rimGlow",
    "remember",
    "focusStorm",
    "seamless"
  ]);
  /** Schlüssel: alle Regler, die die Rechnung beeinflussen, plus Lauf-Nummer. Andere Werte = anderer Zustand. */
  stateKey() {
    const e = { run: this.runSeed, warm: this.warmSteps };
    for (const [n, r] of Object.entries(o)) D.VIEW_ONLY.has(n) || (e[n] = r);
    return JSON.stringify(e);
  }
  db() {
    return new Promise((e, n) => {
      const r = indexedDB.open("fluid-gas-planet", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("state"), r.onsuccess = () => e(r.result), r.onerror = () => n(r.error);
    });
  }
  fieldsToKeep() {
    return [this.vel[this.vc], this.prs[this.pc], this.dye[this.dc], this.flow].filter((e) => !!e);
  }
  async readField(e) {
    const n = Math.ceil(e.n * 8 / 256) * 256, r = this.device.createBuffer({ size: n * e.n * 6, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), s = this.device.createCommandEncoder();
    s.copyTextureToBuffer({ texture: e.tex }, { buffer: r, bytesPerRow: n, rowsPerImage: e.n }, [e.n, e.n, 6]), this.device.queue.submit([s.finish()]), await r.mapAsync(GPUMapMode.READ);
    const a = r.getMappedRange().slice(0);
    return r.destroy(), a;
  }
  async saveState() {
    if (!(!o.remember || this.offscreen))
      try {
        const e = this.stateKey(), n = await Promise.all(this.fieldsToKeep().map((l) => this.readField(l))), a = (await this.db()).transaction("state", "readwrite").objectStore("state");
        a.clear(), a.put({ fields: n, time: this.time, storms: this.storms, vc: this.vc, pc: this.pc, dc: this.dc }, e);
      } catch (e) {
        console.warn("Zustand merken:", e);
      }
  }
  async loadState() {
    try {
      const e = this.stateKey(), n = await this.db(), r = await new Promise((a, l) => {
        const c = n.transaction("state").objectStore("state").get(e);
        c.onsuccess = () => a(c.result), c.onerror = () => l(c.error);
      });
      if (!r || e !== this.stateKey()) return;
      const s = this.fieldsToKeep();
      if (r.fields.length !== s.length) return;
      s.forEach((a, l) => {
        const c = Math.ceil(a.n * 8 / 256) * 256;
        if (r.fields[l].byteLength !== c * a.n * 6) throw new Error("size");
        this.device.queue.writeTexture({ texture: a.tex }, r.fields[l], { bytesPerRow: c, rowsPerImage: a.n }, [a.n, a.n, 6]);
      }), this.time = r.time, this.storms = r.storms, this.restored = !0, this.warm = 0, this.warmTotal = 0, J(!1), this.faceMainStorm();
    } catch (e) {
      console.warn("Zustand laden:", e);
    }
  }
  /** Vorrechnen: viele Schritte ohne Rendern, GPU-Zeit messen, Qualität kalibrieren. */
  async warmBatch() {
    const e = this.warmRate, n = performance.now();
    for (let a = 0; a < e && this.warm > 0; a++, this.warm--) this.submitStep();
    await this.device.queue.onSubmittedWorkDone();
    const r = (performance.now() - n) / Math.max(e, 1);
    this.stepMs = this.stepMs > 0 ? this.stepMs * 0.7 + r * 0.3 : r, this.warmRate = Math.min(1024, Math.max(1, Math.round(40 / this.stepMs)));
    const s = this.warmTotal - this.warm;
    if (o.autoQuality && !this.calibrated && s >= 90 && this.calibrate(), s >= 90 && !this.offscreen && !this.manualSkip) {
      const a = Math.max(0, Math.floor((mt - (performance.now() - this.warmStart)) / this.stepMs));
      this.warm > a && (this.warm = a, this.warmTotal = s + a);
    }
    Me.style.width = `${Math.round(100 * (this.warmTotal - this.warm) / Math.max(this.warmTotal, 1))}%`, be.textContent = "– fps", this.warm === 0 && (J(!1), this.manualSkip = !1, this.restored || this.saveState(), this.faceMainStorm());
  }
  /** Einmal pro Start: passt ein Simulationsschritt nicht ins Budget, eine Stufe herunter. */
  calibrate() {
    if (this.calibrated = !0, this.stepMs <= pt || this.downgrades >= 3) return;
    const e = we.findIndex(([, n]) => n < o.dyeRes);
    e < 0 || ([o.velRes, o.dyeRes] = we[e], this.downgrades++, this.allocVel(), this.allocDye(), this.panel.refresh(), this.warmStart = performance.now(), te.textContent = i(`Qualität für 60 fps angepasst (${o.velRes}² / ${o.dyeRes}²)`, `Quality adjusted for 60 fps (${o.velRes}² / ${o.dyeRes}²)`));
  }
  /** Dynamische Render-Auflösung: unter 56 fps kleiner, bei stabilen 60 fps langsam wieder größer. */
  adaptScale(e) {
    if (!o.autoQuality) {
      this.renderScale = 1;
      return;
    }
    if (this.scaleAcc += e, this.scaleFrames++, this.scaleAcc < 1) return;
    const n = this.scaleFrames / this.scaleAcc;
    this.scaleAcc = 0, this.scaleFrames = 0, n < 56 ? (this.renderScale = Math.max(0.5, this.renderScale - 0.1), this.goodSeconds = 0) : ++this.goodSeconds >= 3 && this.renderScale < 1 && (this.renderScale = Math.min(1, this.renderScale + 0.05), this.goodSeconds = 0);
  }
  /** Schrittweite: bei Tempo < 1 kleinere Schritte (flüssig, gleiche Physik), sonst fest 1/60 s. */
  dtStep() {
    return this.warm > 0 ? ne : ne * Math.min(1, o.timeScale);
  }
  simStep(e) {
    const n = this.dtStep();
    return this.time += n, this.frame++, this.updateStorms(n), this.writeSim(n), this.step(e);
  }
  /** Ein einzelner Schritt als eigener Auftrag, damit jeder Schritt seine eigenen Uniforms sieht. */
  submitStep() {
    const e = this.device.createCommandEncoder(), n = this.simStep(e);
    return this.device.queue.submit([e.finish()]), n;
  }
  /** Ein Bild: Simulationsschritt(e) und Darstellung. */
  frameOnce(e) {
    this.initIfNeeded();
    let n = this.flowMode() === "fluid" ? this.vel[this.vc] : this.flow, r = 0;
    if (!o.paused) {
      this.stepAcc += this.offscreen ? Math.max(1, o.timeScale) : e * 60 * Math.max(1, o.timeScale);
      const c = Math.max(1, Math.min(64, Math.floor(12 / Math.max(this.stepMs, 0.1))));
      r = Math.min(Math.floor(this.stepAcc), c), this.stepAcc = Math.min(this.stepAcc - r, 2);
      for (let h = 0; h < r; h++) n = this.submitStep();
    }
    this.achieved = this.achieved * 0.97 + (e > 0 ? r * this.dtStep() / e : 0) * 0.03, this.spin += r * this.dtStep() * 0.08 * o.spinSpeed * (9.93 / this.preset.rotationHours) * this.dir();
    const s = this.device.createCommandEncoder();
    this.sky.tick(s), this.writeRender();
    const a = this.device.createBindGroup({
      layout: this.renderPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.renderBuf } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.dye[this.dc].cube },
        { binding: 3, resource: n.cube },
        { binding: 4, resource: this.aux.cube },
        { binding: 5, resource: this.prs[this.pc].cube },
        { binding: 6, resource: this.sky.view }
      ]
    }), l = s.beginRenderPass({
      colorAttachments: [{ view: this.targetView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }]
    });
    l.setPipeline(this.renderPipe), l.setBindGroup(0, a), l.draw(3), l.end(), this.device.queue.submit([s.finish()]);
  }
  targetView() {
    return this.offscreen ? ((!this.target || this.target.width !== b.width || this.target.height !== b.height) && (this.target?.destroy(), this.target = this.device.createTexture({
      size: [b.width, b.height],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    })), this.target.createView()) : this.ctx.getCurrentTexture().createView();
  }
  /** Nur für Tests: eine Texelzeile eines Felds auslesen (rgba als Zahlen). */
  async readRow(e, n, r) {
    const s = e === "dye" ? this.dye[this.dc] : e === "flow" ? this.flow : this.vel[this.vc], a = Math.ceil(s.n * 8 / 256) * 256, l = this.device.createBuffer({ size: a, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), c = this.device.createCommandEncoder();
    c.copyTextureToBuffer({ texture: s.tex, origin: [0, r, n] }, { buffer: l, bytesPerRow: a }, [s.n, 1, 1]), this.device.queue.submit([c.finish()]), await l.mapAsync(GPUMapMode.READ);
    const h = new Uint16Array(l.getMappedRange().slice(0));
    l.destroy();
    const u = (p) => {
      const m = p >> 15 ? -1 : 1, g = p >> 10 & 31, v = p & 1023;
      return g === 0 ? m * v * 2 ** -24 : g === 31 ? NaN : m * (1 + v / 1024) * 2 ** (g - 15);
    }, d = [];
    for (let p = 0; p < s.n; p++) d.push([0, 1, 2, 3].map((m) => u(h[p * 4 + m])));
    return d;
  }
  /** Nur im Testmodus: letztes Bild als PNG-Data-URL. */
  async capture() {
    if (!this.target) return "";
    const e = this.target.width, n = this.target.height, r = Math.ceil(e * 4 / 256) * 256, s = this.device.createBuffer({ size: r * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), a = this.device.createCommandEncoder();
    a.copyTextureToBuffer({ texture: this.target }, { buffer: s, bytesPerRow: r }, [e, n]), this.device.queue.submit([a.finish()]), await s.mapAsync(GPUMapMode.READ);
    const l = new Uint8Array(s.getMappedRange()), c = new ImageData(e, n);
    for (let u = 0; u < n; u++) c.data.set(l.subarray(u * r, u * r + e * 4), u * e * 4);
    s.unmap(), s.destroy();
    const h = document.createElement("canvas");
    return h.width = e, h.height = n, h.getContext("2d").putImageData(c, 0, 0), h.toDataURL("image/png");
  }
  resize() {
    const e = this.dpr * (o.autoQuality ? this.renderScale : 1), n = Math.max(1, Math.round(b.clientWidth * e)), r = Math.max(1, Math.round(b.clientHeight * e));
    (b.width !== n || b.height !== r) && (b.width = n, b.height = r);
  }
  // ---------- Bedienung ----------
  bindInput() {
    const e = /* @__PURE__ */ new Map();
    let n = 0;
    b.addEventListener("pointerdown", (s) => {
      b.setPointerCapture(s.pointerId), e.set(s.pointerId, { x: s.clientX, y: s.clientY });
    });
    const r = (s) => {
      e.delete(s.pointerId), n = 0;
    };
    b.addEventListener("pointerup", r), b.addEventListener("pointercancel", r), b.addEventListener("pointermove", (s) => {
      const a = e.get(s.pointerId);
      if (a) {
        if (e.set(s.pointerId, { x: s.clientX, y: s.clientY }), e.size === 2) {
          const [l, c] = [...e.values()], h = Math.hypot(l.x - c.x, l.y - c.y);
          n && this.zoom(n / h), n = h;
          return;
        }
        o.map || (this.cam.yaw -= (s.clientX - a.x) * 6e-3, this.cam.pitch = Math.max(-1.45, Math.min(1.45, this.cam.pitch + (s.clientY - a.y) * 6e-3)));
      }
    }), b.addEventListener("wheel", (s) => {
      s.preventDefault(), this.zoom(Math.exp(s.deltaY * 1e-3));
    }, { passive: !1 });
  }
  zoom(e) {
    this.cam.dist = Math.max(1.25, Math.min(8, this.cam.dist * e));
  }
  buildUI() {
    const e = document.getElementById("panel-body");
    e.innerHTML = "";
    const n = (d) => this.onChange(d), r = (d) => `${Math.round(d * 100)} %`, s = (d) => d.toFixed(2), a = (d) => d.toFixed(3), l = (d) => d >= 1e6 ? `${(d / 1048576).toFixed(d % 1048576 ? 2 : 0)} ${i("Mio.", "M")}` : d >= 1e3 ? `${Math.round(d / 1024)} k` : String(d), c = (d) => `<code class="fx">${d}</code>`, h = (d) => ({ Neptun: i("Neptun", "Neptune"), "Heißer Jupiter": i("Heißer Jupiter", "Hot Jupiter") })[d] ?? d, u = { velRes: 1024, dyeRes: 8192, curlRes: 4096, particles: 67108864 };
    this.panel = new re(e, o, n, ee), this.panel.section("Planet").select(
      "preset",
      i("Vorlage", "Preset"),
      [...V.map((d) => [d.name, h(d.name)]), ["Zufall", i("Zufallsplanet", "Random planet")]],
      i(
        "Lädt Windprofil, Farbbänder, Stürme, Abplattung und Ringe eines Planeten. Alles sind Zahlen, keine Bilder.",
        "Loads a planet’s wind profile, colour bands, storms, oblateness and rings. All numbers, no images."
      )
    ).file(
      "image",
      i("Farben aus Bild", "Colours from image"),
      i(
        "Lade ein Planetenfoto oder eine flache Karte. Für jeden Breitengrad wird die mittlere Farbe gemessen und als Bandfarbe übernommen. Das Bild wird nicht als Textur benutzt, die Wolken entstehen weiter aus der Simulation.",
        "Load a planet photo or a flat map. The average colour of each latitude becomes that band’s colour. The image is not used as a texture; the clouds still come from the simulation."
      ),
      (d) => je(d).then((p) => {
        this.preset = { ...this.preset, name: `${this.preset.name} (${i("Farben aus Bild", "colours from image")})`, bands: p }, this.writeTables(), this.needsDye = !0, this.remember(), this.updateInfo();
      }).catch(() => C(i("<b>Das Bild ließ sich nicht lesen.</b> Nimm ein JPG, PNG oder WebP.", "<b>Could not read the image.</b> Use a JPG, PNG or WebP.")))
    ).buttons([
      ["btn-defaults", i("Regler zurücksetzen", "Reset controls"), () => this.resetSettings()]
    ], {
      "btn-defaults": i("Alle Regler auf die Standardwerte, Planet und Gerät bleiben.", "All controls back to defaults; planet and device stay.")
    }).section(i("Zufallsplanet", "Random planet"), i(
      "Würfelt einen neuen Planeten. Mit den Vorgaben lenkst du den Zufall; „egal“ lässt ihn frei. Gleicher Seed und gleiche Vorgaben ergeben immer denselben Planeten.",
      "Rolls a new planet. The options steer the dice; “any” leaves them free. Same seed and same options always give the same planet."
    ), o.preset === "Zufall").select(
      "rndFamily",
      i("Familie", "Family"),
      [["", i("egal", "any")], ["jovian", i("jupiterartig", "Jupiter-like")], ["saturnian", i("saturnartig", "Saturn-like")], ["ice", i("Eisriese", "ice giant")], ["hot", i("heißer Jupiter", "hot Jupiter")], ["exotic", i("exotisch", "exotic")]],
      i("Bestimmt Farbraum, Bandzahl, Stärke des Äquatorjets und Stimmung.", "Sets colour range, band count, equatorial jet strength and mood.")
    ).range(
      "rndBands",
      i("Bänder", "Bands"),
      0,
      30,
      1,
      i(
        "Anzahl der Farbbänder und Jets. 0 = würfeln. Physikalisch hängt sie von Rotation, Größe und Windstärke ab (Rhines-Skala).",
        "Number of colour bands and jets. 0 = roll. Physically it depends on rotation, size and wind speed (Rhines scale)."
      ) + c("L<sub>β</sub> = π·√(2U/β),  β = 2Ω·cos φ / R"),
      (d) => d === 0 ? i("Zufall", "roll") : String(d)
    ).select(
      "rndStorms",
      i("Stürme", "Storms"),
      [["auto", i("egal", "any")], ["none", i("keine", "none")], ["few", i("wenige", "few")], ["many", i("viele", "many")]],
      i("Wie viele Stürme die Vorlage mitbringt. Neue entstehen zusätzlich über „Neue Stürme“.", "How many storms the preset brings. More can form via “New storms”.")
    ).select("rndRings", i("Ringe", "Rings"), [["auto", i("egal", "any")], ["yes", i("ja", "yes")], ["no", i("nein", "no")]], i("Ringe erzwingen oder verbieten.", "Force or forbid rings.")).buttons([
      ["btn-seed", i("🎲 Neuer Zufallsplanet", "🎲 New random planet"), () => {
        o.preset = "Zufall", o.seed = ce(), this.applyPreset(), this.panel.refresh(), this.remember();
      }]
    ]).section(i("Verfahren", "Method"), i("Rechenmodell und Darstellung sind frei kombinierbar.", "Maths model and look can be combined freely."), !0).select(
      "flow",
      i("Rechenmodell", "Maths model"),
      [["fluid", i("Stable Fluids – Strömungsphysik (mofu)", "Stable Fluids – flow physics (mofu)")], ["curl", i("Curl-Noise – Rezept (jasper-r / Gaseous Giganticus)", "Curl noise – recipe (jasper-r / Gaseous Giganticus)")]],
      i(
        "Woher der Wind kommt. Stable Fluids löst die Strömungsgleichung mit Druck, Coriolis und Wirbeln. Curl-Noise ist ein verwirbeltes Rauschfeld plus Jets und Wirbel, schnell und ohne Physik.",
        "Where the wind comes from. Stable Fluids solves the flow equation with pressure, Coriolis and vortices. Curl noise is a swirling noise field plus jets and vortices, fast and without physics."
      )
    ).select(
      "look",
      i("Darstellung", "Look"),
      [["dye", i("Flüssigkeit (Farbstoff)", "Liquid (dye)")], ["particles", i("Partikel", "Particles")], ["pure", i("Partikel rein (wie jasper-r)", "Pure particles (as jasper-r)")]],
      i(
        "Wie die Wolken dem Wind folgen. Flüssigkeit: die Farbe wird mitgeführt und kehrt zur Bandfarbe zurück. Partikel: Millionen Punkte fliegen mit dem Wind und malen die Farbe, die ebenfalls zur Bandfarbe zurückkehrt. Partikel rein: wie jasper-r, die Textur verblasst zu einer Mittelfarbe, alle Struktur kommt von den Partikeln. Jede Darstellung geht mit jedem Rechenmodell.",
        "How clouds follow the wind. Liquid: colour is carried and returns to the band colour. Particles: millions of points ride the wind and paint colour, which also returns to the band colour. Pure particles: as in jasper-r, the texture fades to one mean colour and all structure comes from the particles. Every look works with every maths model."
      )
    ).section(i("Zeit und Drehung", "Time and spin"), void 0, !0).range(
      "timeScale",
      i("Tempo", "Tempo"),
      0.05,
      32,
      0.05,
      i(
        "Wie schnell die Zeit läuft. Ändert nur die Geschwindigkeit, nie die Form: Unter 1 werden die Schritte kleiner (flüssig, gleiche Physik), über 1 werden mehr Schritte gerechnet. Tipp: Jet-Stärke hoch (große, richtige Wirbel) und Tempo runter (planetar langsam).",
        "How fast time runs. Changes only speed, never shape: below 1 the steps get smaller (smooth, same physics), above 1 more steps are computed. Tip: raise jet strength (big, correct vortices) and lower tempo (slow like a planet)."
      ) + c(i("Δt = 1/60 s · min(Tempo, 1),  Schritte/s = 60 · max(Tempo, 1)", "Δt = 1/60 s · min(tempo, 1),  steps/s = 60 · max(tempo, 1)")),
      (d) => `${d.toFixed(2)}×`
    ).range(
      "spinSpeed",
      i("Drehgeschwindigkeit", "Spin speed"),
      0,
      10,
      0.05,
      i(
        "Sichtbare Eigendrehung, läuft in Simulationszeit (Zeitraffer beschleunigt sie mit). 1 = Tempo passend zur Tageslänge der Vorlage. Ändert nur die Ansicht, nicht die Physik.",
        "Visible spin, runs in simulation time (time lapse speeds it up too). 1 = matches the preset’s day length. Affects the view only, not the physics."
      ),
      (d) => `${d.toFixed(2)}×`
    ).toggle(
      "retro",
      i("Rückläufige Drehung", "Retrograde spin"),
      i(
        "Dreht Planet und Physik andersherum (wie Venus). Dann drehen Zyklone auf der Nordhalbkugel im Uhrzeigersinn, alle Jets und Stürme spiegeln sich. Normal (aus): von Norden gesehen gegen den Uhrzeigersinn, Nord-Zyklone gegen den Uhrzeigersinn, Süd-Zyklone im Uhrzeigersinn. (Bei Toiletten ist Coriolis dagegen viel zu schwach: Ro ≈ 1000.)",
        "Spins planet and physics the other way (like Venus). Then northern cyclones turn clockwise, and all jets and storms are mirrored. Normal (off): counter-clockwise seen from the north, northern cyclones counter-clockwise, southern ones clockwise. (For toilets Coriolis is far too weak: Ro ≈ 1000.)"
      ) + c(i("Ω → −Ω,  U(φ) → −U(φ),  Drehsinn → −Drehsinn", "Ω → −Ω,  U(φ) → −U(φ),  spin → −spin"))
    ).section(i("Wind", "Wind"), i("Jet-Stärke wirkt in beiden Rechenmodellen, die übrigen Regler bei Stable Fluids. Die Gleichung (2D, inkompressibel, auf der Kugel):", "Jet strength applies to both maths models, the other controls to Stable Fluids. The equation (2D, incompressible, on the sphere):"), !0).custom(this.formulaNote(i("∂u/∂t + (u·∇)u = −∇p − f k̂×u + F<sub>Jet</sub> + F<sub>Sturm</sub> + ε·F<sub>Wirbel</sub> − r·u,   ∇·u = 0", "∂u/∂t + (u·∇)u = −∇p − f k̂×u + F<sub>jet</sub> + F<sub>storm</sub> + ε·F<sub>vortex</sub> − r·u,   ∇·u = 0"))).range(
      "jetStrength",
      i("Jet-Geschwindigkeit", "Jet speed"),
      0,
      0.5,
      2e-3,
      i(
        "Wie schnell die Ost-West-Bänder strömen (Planetenradien pro Sekunde). Nur die Bänder: wie kräftig die Strudel angetrieben werden, stellst du getrennt unter „Strudel-Stärke“ ein, wie schnell alles abläuft unter „Tempo“.",
        "How fast the east–west bands flow (planet radii per second). Bands only: how strongly eddies are driven is set separately under “Eddy strength”, how fast everything runs under “Tempo”."
      ) + c(i("U(φ) = U<sub>max</sub> · Profil(φ)", "U(φ) = U<sub>max</sub> · profile(φ)")),
      a
    ).range(
      "eddyStrength",
      i("Strudel-Stärke", "Eddy strength"),
      0,
      10,
      0.05,
      i(
        "Antrieb aller Strudel: Turbulenz, Stürme, Curl-Noise und Wirbel. Unabhängig von der Jet-Geschwindigkeit, so kannst du ruhige Bänder mit kräftigen Strudeln kombinieren oder umgekehrt. 1 = wie bisher bei Jet-Geschwindigkeit 0,06.",
        "Drive of all eddies: turbulence, storms, curl noise and vortices. Independent of jet speed, so calm bands can go with strong eddies or the other way round. 1 = as before at jet speed 0.06."
      ) + c(i("Antrieb = 0,06 · Strudel-Stärke", "drive = 0.06 · eddy strength")),
      (d) => `${d.toFixed(2)}×`
    ).range(
      "jetRelax",
      i("Jet-Rückstellung", "Jet restoring"),
      0,
      5,
      0.01,
      i(
        "Zieht nur das Breitenkreis-Mittel des Ostwinds zum Windprofil zurück; Wirbel bleiben frei. 0 = die Bänder zerfallen mit der Zeit.",
        "Pulls only the latitude-circle mean of the east wind back to the profile; vortices stay free. 0 = bands decay over time."
      ) + c("u += ê<sub>E</sub> · (U(φ) − ⟨u·ê<sub>E</sub>⟩<sub>φ</sub>) · k·Δt"),
      s
    ).range(
      "omega",
      i("Coriolis (Rotation)", "Coriolis (rotation)"),
      0,
      30,
      0.05,
      i(
        "Planetenrotation Ω in der Strömungsgleichung. Wirksam ist vor allem ihr Nord-Süd-Gefälle β: es erzeugt Rossby-Wellen und ordnet Turbulenz zu Bändern. Das Verhältnis Wind zu Rotation (Rossby-Zahl) entscheidet, ob es wie eine Teetasse (groß) oder wie ein Planet (klein) aussieht: Jupiter hat Ro ≈ 0,01 bis 0,1, Standard 0,4 ergibt Ro ≈ 0,15 im großen Maßstab.",
        "Planet rotation Ω in the flow equation. What matters most is its north–south gradient β: it creates Rossby waves and organises turbulence into bands. The ratio of wind to rotation (Rossby number) decides whether it looks like a teacup (large) or a planet (small): Jupiter has Ro ≈ 0.01 to 0.1; the default 0.4 gives Ro ≈ 0.15 at planet scale."
      ) + c("u′ = u·cos a + (p×u)·sin a,  a = −2Ω·sin φ·Δt;  Ro = U / (2Ω·L)"),
      s
    ).range(
      "turbulence",
      i("Turbulenz", "Turbulence"),
      0,
      10,
      0.01,
      i(
        "Kleine, langsam wandernde Anstöße (divergenzfreies Rauschen). Sie lösen die Scherinstabilitäten an den Jet-Rändern aus.",
        "Small, slowly drifting kicks (divergence-free noise). They trigger shear instabilities at jet edges."
      ) + c(i("u += (p × ∇ψ<sub>Rauschen</sub>) · Stärke · Δt", "u += (p × ∇ψ<sub>noise</sub>) · strength · Δt")),
      s
    ).range(
      "turbScale",
      i("Turbulenz-Größe", "Turbulence scale"),
      0.2,
      40,
      0.1,
      i("Frequenz des Anstoß-Rauschens: klein = wenige große Wirbel, groß = viele feine.", "Frequency of the kick noise: low = a few big eddies, high = many fine ones."),
      (d) => d.toFixed(1)
    ).range(
      "confinement",
      i("Wirbelverstärkung", "Vorticity confinement"),
      0,
      20,
      0.05,
      i(
        "Gibt Wirbeln die Energie zurück, die das grobe Gitter wegschmiert, vor allem den kleinsten. Standard 6 = lebendiger Look von v0.1; physikalisch sauberer ist etwa 0,5.",
        "Gives vortices back the energy the coarse grid smears away, mostly the smallest. Default 6 = lively v0.1 look; physically cleaner is about 0.5."
      ) + c("F = ε·Δx·(N × ζp̂),  N = ∇|ζ| / |∇|ζ||"),
      s
    ).range("drag", i("Reibung", "Drag"), 0, 2, 5e-3, i("Bremst den ganzen Wind gleichmäßig ab.", "Slows the whole wind field uniformly.") + c("u ← u / (1 + r·Δt)"), a).section(i("Stürme", "Storms"), void 0, !0).toggle(
      "storms",
      i("Vorlagen-Stürme", "Preset storms"),
      i(
        "Setzt die bekannten Stürme der Vorlage (z. B. Großer Roter Fleck) beim Start als Wirbel ein.",
        "Seeds the preset’s known storms (e.g. the Great Red Spot) as vortices at start."
      ) + c(i("v(d) = 2,33 · x·e<sup>−x²</sup>,  x = d / r", "v(d) = 2.33 · x·e<sup>−x²</sup>,  x = d / r"))
    ).toggle(
      "remember",
      i("Zustand merken", "Remember state"),
      i(
        "Modul. Speichert den fertig eingeschwungenen Planeten in diesem Browser. Beim nächsten Laden mit denselben Einstellungen ist er sofort da, ohne Einschwingen. Nur der letzte Zustand wird behalten; je nach Farbauflösung braucht er 10 bis 200 MB Speicher im Browser.",
        "Module. Saves the fully spun-up planet in this browser. Next time with the same settings it appears instantly, without spin-up. Only the latest state is kept; depending on colour resolution it needs 10 to 200 MB of browser storage."
      )
    ).toggle(
      "focusStorm",
      i("Start mit Hauptsturm im Blick", "Start with main storm in view"),
      i(
        "Dreht den Planeten nach dem Laden so, dass der größte Sturm der Vorlage (bei Jupiter der Große Rote Fleck) am Anfang der Tagseite vor der Kamera steht.",
        "After loading, turns the planet so the preset’s largest storm (Jupiter: the Great Red Spot) sits at the start of the day side in front of the camera."
      )
    ).range(
      "stormSize",
      i("Sturm-Größe", "Storm size"),
      0.2,
      5,
      0.05,
      i(
        "Radius aller Stürme als Faktor, unabhängig vom Drehtempo. Groß und langsam ist so möglich: große Sturm-Größe, kleines Drehtempo.",
        "Radius of all storms as a factor, independent of spin speed. Big and slow is possible: large storm size, low spin speed."
      ) + c("r′ = r · Faktor"),
      (d) => `${d.toFixed(2)}×`
    ).range("stormStrength", i("Sturm-Drehtempo", "Storm spin speed"), 0, 10, 0.05, i("Wie schnell sich die Stürme drehen, relativ zur Jet-Stärke. Die Größe stellst du getrennt unter „Sturm-Größe“ ein.", "How fast storms spin, relative to jet strength. Size is set separately under “Storm size”."), s).range(
      "stormHold",
      i("Stürme festhalten", "Hold storms"),
      0,
      1,
      0.01,
      i(
        "Treibt die Vorlagen-Stürme dauerhaft an. 0 = reine Physik (sie dürfen treiben, verschmelzen, vergehen), 1 = wie ein Beobachtungsdatum festgehalten.",
        "Keeps driving the preset storms. 0 = pure physics (they may drift, merge, fade), 1 = enforced like observation data."
      ) + c(i("u += (v<sub>Sturm</sub> − u) · 2·w·Maske·Δt", "u += (v<sub>storm</sub> − u) · 2·w·mask·Δt")),
      r
    ).range(
      "stormSpawn",
      i("Neue Stürme", "New storms"),
      0,
      5,
      0.01,
      i(
        "Wie oft Konvektion einen neuen Wirbel anstößt (pro Sekunde Simulationszeit). Der Drehsinn folgt der Scherung an der Stelle, denn nur ein mitdrehender Wirbel überlebt sie. In antizyklonalen Zonen entstehen so weiße Ovale, in zyklonalen Gürteln dunkle Barken.",
        "How often convection kicks off a new vortex (per second of simulated time). Its spin follows the local shear, because only a co-rotating vortex survives it. Anticyclonic zones grow white ovals, cyclonic belts dark barges."
      ) + c(i("Drehsinn = sign(ζ<sub>Hintergrund</sub>),  ζ ≈ −∂U/∂φ", "spin = sign(ζ<sub>background</sub>),  ζ ≈ −∂U/∂φ")),
      s
    ).range(
      "kickLife",
      i("Anstoß-Dauer", "Kick duration"),
      0.5,
      120,
      0.5,
      i(
        "Wie lange ein neuer Sturm angetrieben wird, bevor er frei ist. Kurz = kurzes Aufflackern. Lang = er wächst zu einem großen Wirbel heran und lebt dann von der Physik: er treibt mit dem Jet, verschmilzt oder zerfällt.",
        "How long a new storm is driven before it is free. Short = a brief flicker. Long = it grows into a big vortex and then lives on physics: drifts with the jet, merges or decays."
      ) + c(i("w(t) = sin(π · t / Dauer)", "w(t) = sin(π · t / duration)")),
      (d) => `${d.toFixed(1)} s`
    ).range("stormTint", i("Sturm-Farbe", "Storm colour"), 0, 10, 0.05, i("Wie stark ein angetriebener Sturm seine Farbe in die Wolken gibt.", "How strongly a driven storm tints the clouds."), s).section(i("Wolkenfarbe", "Cloud colour"), i("Darstellung Flüssigkeit und Partikel. Die Farbe folgt dem Wind und kehrt langsam zur Bandfarbe zurück:", "Looks liquid and particles. Colour follows the wind and slowly returns to the band colour:"), !0).custom(this.formulaNote(i("c(p) ← mix(c(p − u·Δt), c<sub>Band</sub>(φ + Mäander), 1 − e<sup>−k·Δt</sup>)", "c(p) ← mix(c(p − u·Δt), c<sub>band</sub>(φ + meander), 1 − e<sup>−k·Δt</sup>)"))).range(
      "bandRelax",
      i("Band-Rückstellung", "Band restoring"),
      0,
      2,
      5e-3,
      i(
        "k: wie schnell die Farbe zum Band ihrer Breite zurückkehrt. 0 = alles vermischt sich zu Brei, hoch = starre Streifen. Zeitkonstante 1/k: bei 0,06 etwa 17 s, so lange dauert es auch, bis eine Änderung eingeschwungen ist.",
        "k: how fast colour returns to its latitude’s band. 0 = everything mixes into mush, high = rigid stripes. Time constant 1/k: about 17 s at 0.06, which is also how long a change takes to settle."
      ),
      a
    ).range(
      "fineStripes",
      i("Feinstreifen", "Fine stripes"),
      0,
      5,
      0.05,
      i(
        "Feine Farbstreifen innerhalb der Bänder. Erst sie machen sichtbar, wie die Strömung Farbe zu Filamenten zieht.",
        "Fine colour stripes inside the bands. They make it visible how the flow pulls colour into filaments."
      ),
      s
    ).range("bandWobble", i("Band-Mäander", "Band meander"), 0, 6, 0.05, i("Verbiegt die Bandgrenzen mit Rauschen.", "Bends band edges with noise.") + c(i("φ′ = φ + Rauschen(4p) · m · 0,04", "φ′ = φ + noise(4p) · m · 0.04")), s).range("contrast", i("Band-Kontrast", "Band contrast"), 0, 4, 0.05, i("Farbunterschied zwischen hellen Zonen und dunklen Gürteln.", "Colour difference between bright zones and dark belts.") + c(i("c = c̄ + (c − c̄) · Kontrast", "c = c̄ + (c − c̄) · contrast")), s).range("convection", i("Konvektion", "Convection"), 0, 10, 0.05, i("Helle Wolkentürme, die aus der Tiefe aufsteigen (Ammoniak-Eis).", "Bright cloud towers rising from below (ammonia ice)."), s).section(i("Curl noise", "Curl noise"), i("Rechenmodell Curl-Noise: Wind = Jets + Curl-Noise + Wirbel.", "Maths model curl noise: wind = jets + curl noise + vortices."), !0).custom(this.formulaNote(i("v = ê<sub>Ost</sub>·U(φ) + p × ∇ψ + Σ Wirbel,   ψ = Σ<sub>k</sub> ½<sup>k</sup> · Rauschen(2<sup>k</sup> f · p, t)", "v = ê<sub>E</sub>·U(φ) + p × ∇ψ + Σ vortices,   ψ = Σ<sub>k</sub> ½<sup>k</sup> · noise(2<sup>k</sup> f · p, t)"))).range("curlStrength", i("Stärke", "Strength"), 0, 10, 0.01, i("Wie stark das Rauschfeld gegenüber den Jets ist.", "Strength of the noise field relative to the jets."), s).range("curlFreq", i("Frequenz", "Frequency"), 0.2, 32, 0.1, i("Grundfrequenz f des Rauschens: hoch = viele kleine Wirbel.", "Base frequency f of the noise: high = many small swirls."), (d) => d.toFixed(1)).range("curlSpeed", i("Veränderung", "Evolution"), 0, 0.5, 5e-3, i("Wie schnell sich das Rauschfeld mit der Zeit umbaut.", "How fast the noise field changes over time."), a).range("curlOctaves", i("Oktaven", "Octaves"), 1, 6, 1, i("Anzahl überlagerter Rausch-Ebenen k. Mehr = feinere Details.", "Number of stacked noise layers k. More = finer detail.")).range(
      "vortexCount",
      i("Wirbel", "Vortices"),
      0,
      256,
      1,
      i(
        "Eingestreute Wirbel (Gaseous Giganticus). Nur wo die Jets schwach sind, und nur mit dem Drehsinn der lokalen Scherung, sonst würden sie zerrissen.",
        "Seeded vortices (Gaseous Giganticus). Only where jets are weak, and only with the spin of the local shear, otherwise they would be torn apart."
      ) + c(i("ω(d) = ω₀·sin(π·d/r),  Drehsinn = sign(−∂U/∂φ)", "ω(d) = ω₀·sin(π·d/r),  spin = sign(−∂U/∂φ)"))
    ).range("vortexStrength", i("Wirbel-Stärke", "Vortex strength"), 0, 10, 0.05, i("Drehgeschwindigkeit ω₀ der eingestreuten Wirbel relativ zur Jet-Stärke.", "Spin ω₀ of the seeded vortices relative to jet strength."), s).section(i("Partikel", "Particles"), i("Darstellung Partikel. Jeder Partikel bewegt sich mit dem Wind und mischt seine Farbe in die Textur:", "Particle looks. Each particle moves with the wind and blends its colour into the texture:"), !0).custom(this.formulaNote(i("p ← normalize(p + v(p + v·Δt/2)·Δt),   c<sub>Texel</sub> ← mix(c<sub>Texel</sub>, c<sub>Partikel</sub>, α·sin(π·Alter/Lebensdauer))", "p ← normalize(p + v(p + v·Δt/2)·Δt),   c<sub>texel</sub> ← mix(c<sub>texel</sub>, c<sub>particle</sub>, α·sin(π·age/lifetime))"))).range(
      "lifetime",
      i("Lebensdauer", "Lifetime"),
      0.5,
      60,
      0.5,
      i(
        "Sekunden bis zur Neugeburt. Lang = lange Schlieren. Bei 60 leben Partikel ewig (Gaseous Giganticus).",
        "Seconds until rebirth. Long = long streaks. At 60 particles live forever (Gaseous Giganticus)."
      ),
      (d) => d >= 60 ? i("ewig", "forever") : `${d.toFixed(1)} s`
    ).range("opacity", i("Deckkraft", "Opacity"), 0.01, 1, 0.01, i("α: wie stark ein Partikel seine Farbe in die Textur schreibt.", "α: how strongly a particle writes its colour into the texture."), r).range("blur", i("Weichzeichnen", "Blur"), 0, 1, 0.01, i("Verwischt die Textur jedes Bild ein wenig, damit aus Punkten Wolken werden.", "Blurs the texture slightly every frame so points become clouds.") + c(i("c ← mix(c, Mittel der 4 Nachbarn, b)", "c ← mix(c, mean of 4 neighbours, b)")), r).range(
      "fade",
      i("Verblassen", "Fade"),
      0,
      1,
      5e-3,
      i(
        "Nur Darstellung „Partikel rein“: wie schnell die Textur zu einer einzigen Mittelfarbe verblasst (jasper-r). Die Bänder entstehen dann allein aus den Partikeln.",
        "“Pure particles” look only: how fast the texture fades to one mean colour (jasper-r). Bands then come from the particles alone."
      ) + c(i("c ← mix(c, c<sub>Mittel</sub>, 1 − e<sup>−k·Δt</sup>)", "c ← mix(c, c<sub>mean</sub>, 1 − e<sup>−k·Δt</sup>)")),
      a
    ).range(
      "viewFocus",
      i("Sichtfeld-Anteil", "View focus"),
      0,
      0.95,
      0.05,
      i(
        "Anteil der Partikel, die auf der sichtbaren Seite geboren werden. Bei 0,8 landen 80 % der Rechenarbeit dort, wo du hinschaust: schärfer beim Heranzoomen, gleiche Kosten. Die Rückseite verblasst dann langsamer als sie bemalt wird; zu hoch gewählt wirkt sie beim Drehen blasser.",
        "Share of particles born on the visible side. At 0.8, 80 % of the work lands where you look: sharper when zooming in, same cost. The far side then gets painted less; set too high it looks paler when it turns into view."
      ),
      r
    ).section("Relief", i("Relief und die Relief-Module. Alle Module sind einzeln schaltbar, aus = wie v0.4.", "Relief and the relief modules. Each module is a switch; off = as v0.4."), !0).range(
      "relief",
      "Relief",
      0,
      5,
      0.01,
      i(
        "Neigt die Flächennormale nach der Helligkeit: helle Wolken wirken höher und werfen weiche Schatten. Das ist eine Beleuchtungs-Täuschung, keine echte Höhe (keine Parallaxe, keine Silhouette).",
        "Tilts the surface normal by brightness: bright clouds look higher and cast soft shading. This is a lighting trick, not real height (no parallax, no silhouette)."
      ) + c(i("n′ = normalize(n − ∇Helligkeit · Relief · 3)", "n′ = normalize(n − ∇brightness · relief · 3)")),
      s
    ).toggle(
      "reliefMulti",
      i("Mehrstufiges Relief", "Multi-scale relief"),
      i(
        "Modul, aus = wie bisher. Nimmt die Höhe aus der Helligkeit in drei Größen: große Wirbel und Bänder bekommen viel Tiefe, feine Krümel und Partikel wenig. Die Stärke insgesamt bleibt der Regler „Relief“.",
        "Module, off = as before. Takes height from brightness at three sizes: big vortices and bands get a lot of depth, fine crumbs and particles little. Overall strength stays the “Relief” control."
      ) + c("∇h = f·∇L(e₀) + g·½(∇L̄(4e₀) + ∇L̄(16e₀))")
    ).range("reliefCoarse", i("Grobe Stufen", "Coarse levels"), 0, 5, 0.05, i("Tiefe der großen Strukturen (Wirbel, Bänder).", "Depth of large structures (vortices, bands)."), s).range("reliefFine", i("Feine Stufe", "Fine level"), 0, 1, 0.01, i("Anteil der feinsten Stufe. 1 = so stark wie das bisherige Relief, 0 = keine Krümel.", "Share of the finest level. 1 = as strong as the old relief, 0 = no crumbs."), s).range("reliefSize", i("Größe der groben Stufen", "Coarse level size"), 0.25, 4, 0.05, i("Wie groß die groben Stufen greifen.", "How wide the coarse levels reach."), s).toggle(
      "reliefAdapt",
      i("An Pixelgröße anpassen", "Adapt to pixel size"),
      i("Die feinste Stufe ist nie kleiner als ein Bildschirmpixel. Nimmt das Krabbeln und Flimmern aus der Ferne.", "The finest level is never smaller than a screen pixel. Removes crawling and flicker from afar.")
    ).toggle(
      "depthOn",
      i("Tiefe aus der Physik", "Depth from physics"),
      i(
        "Modul, zusätzlich zum Relief. Hochdruck-Wirbel wie der Große Rote Fleck wölben sich, Tiefdruck-Wirbel sind Senken (Juno: der Fleck ist ein flacher Pfannkuchen, 300–500 km tief). Die Partikel gehen nicht ein, darum kein Krabbeln.",
        "Module, on top of the relief. High-pressure vortices like the Great Red Spot bulge, low-pressure ones are dips (Juno: the spot is a flat pancake, 300–500 km deep). Particles do not enter, so no crawling."
      ) + c("h = p  oder  h = −ζ / f,  f ∝ sin φ")
    ).select(
      "depthSource",
      i("Quelle der Tiefe", "Depth source"),
      [["pressure", i("Druck (nur Stable Fluids, sonst Wirbelstärke)", "Pressure (Stable Fluids only, else vorticity)")], ["vorticity", i("Wirbelstärke aus dem Wind (beide Modelle)", "Vorticity from the wind (both models)")]],
      i("Druck gibt es nur im Rechenmodell Stable Fluids. Bei Curl-Noise wird automatisch die Wirbelstärke genommen, die aus dem Wind beider Modelle berechnet wird.", "Pressure exists only in the Stable Fluids model. With curl noise the vorticity is used automatically; it is computed from the wind of both models.")
    ).range("depthStrength", i("Tiefe", "Depth"), 0, 10, 0.05, i("Wie stark die Wirbel sich wölben oder einsinken.", "How strongly vortices bulge or sink."), s).toggle(
      "pomOn",
      i("Parallaxe mit Eigenschatten", "Parallax with self-shadow"),
      i(
        "Modul, zusätzlich. Verfolgt den Sichtstrahl in die Höhenkarte (Helligkeit plus Tiefe aus der Physik, falls an): hohe Stellen verdecken tiefe, Wirbelränder werfen Schatten in den Trichter. Kostet mehr Rechenleistung.",
        "Module, on top. Traces the view ray into the height map (brightness plus depth from physics, if on): high parts hide low ones, vortex rims cast shadows into the funnel. Costs more GPU."
      ) + c("Parallax Occlusion Mapping (Tatarchuk 2006)")
    ).range("pomHeight", i("Parallaxe-Höhe", "Parallax height"), 0, 10, 0.05, i("Wie hoch die Höhenkarte für die Parallaxe ist.", "How tall the height map is for parallax."), s).range("pomShadow", i("Eigenschatten", "Self-shadow"), 0, 2, 0.05, i("Wie dunkel die Schatten in den Senken werden.", "How dark shadows in the dips get."), s).section(i("Licht und Ansicht", "Light and view"), void 0, !0).range(
      "sunAngle",
      i("Sonnenstand", "Sun angle"),
      -180,
      180,
      1,
      i("Richtung der Sonne. 0° = Sonne hinter der Kamera (voller Planet), 90° = Halbphase.", "Sun direction. 0° = sun behind the camera (full disc), 90° = half phase."),
      (d) => `${d}°`
    ).select(
      "twilight",
      i("Dämmerung", "Twilight"),
      [["v04", i("wie v0.4 (Streifen)", "as v0.4 (stripe)")], ["soft", i("weich, nach Atmosphäre", "soft, by atmosphere")], ["off", i("aus", "off")]],
      i(
        "Aufhellung hinter der Tag-Nacht-Grenze. v0.4: fester Buckel, sieht wie eine Kraterlinie aus. Weich: fällt nur ab, ohne Stufe, so stark wie die Atmosphäre. Aus: nur Sonnenlicht.",
        "Brightening past the day–night line. v0.4: fixed bump that looks like a crater line. Soft: only falls off, no step, as strong as the atmosphere. Off: sunlight only."
      )
    ).select(
      "rimGlow",
      i("Randschimmer", "Rim glow"),
      [["v04", i("wie v0.4", "as v0.4")], ["soft", i("weich", "soft")], ["off", i("aus", "off")]],
      i("Atmosphären-Schimmer am Planetenrand auf der Sonnenseite.", "Atmosphere glow at the planet edge on the sun side.")
    ).range(
      "limb",
      i("Randverdunkelung", "Limb darkening"),
      0.8,
      2,
      0.01,
      i("Minnaert-Exponent k. 1 = matte Kugel; höher = dunkler Rand wie bei echten Gasplaneten.", "Minnaert exponent k. 1 = matte sphere; higher = darker limb, as on real gas giants.") + c("I = (n·l)<sup>k</sup> · (n·v)<sup>k−1</sup>"),
      s
    ).range("atmosphere", i("Dunstsaum", "Haze rim"), 0, 6, 0.05, i("Helligkeit des Atmosphärensaums am Planetenrand.", "Brightness of the atmospheric rim at the planet’s edge.") + c(i("Saum = e<sup>−h/0,025</sup>", "rim = e<sup>−h/0.025</sup>")), s).range("exposure", i("Belichtung", "Exposure"), 0.1, 5, 0.05, i("Gesamthelligkeit vor der ACES-Tonwertkurve.", "Overall brightness before the ACES tone curve."), s).range(
      "nebula",
      i("Milchstraße", "Milky Way"),
      0,
      3,
      0.01,
      i(
        "Derselbe Himmel wie beim Gesteinsplaneten: helles Band mit Kern, Staubbahnen, rote Gaswolken. Steht fest, nur der Planet dreht sich.",
        "The same sky as on the rocky planet: bright band with a core, dust lanes, red gas clouds. It stays fixed, only the planet turns."
      ),
      s
    ).range("stars", i("Sterne", "Stars"), 0, 3, 0.01, i("Helligkeit der Sterne; im Milchstraßenband stehen mehr.", "Brightness of the stars; more of them sit in the Milky Way band."), s).toggle(
      "map",
      i("Kartenansicht", "Map view"),
      i("Zeigt die ganze Kugel als flache Weltkarte (Längen- und Breitengrade).", "Shows the whole sphere as a flat map (longitude/latitude).")
    ).select(
      "view",
      i("Feld anzeigen", "Show field"),
      [["0", i("Wolken", "Clouds")], ["1", i("Wind (Richtung)", "Wind (direction)")], ["2", i("Wirbelstärke", "Vorticity")], ["3", i("Druck", "Pressure")]],
      i(
        "Debug-Ansichten. Wind: Rot = Ost, Grün = Nord. Wirbelstärke: Rot = gegen den Uhrzeigersinn, Blau = im Uhrzeigersinn. Druck nur bei Stable Fluids.",
        "Debug views. Wind: red = east, green = north. Vorticity: red = counter-clockwise, blue = clockwise. Pressure only with Stable Fluids."
      )
    ).section(i("Grafikkarte und Feinheit", "GPU and detail"), i("Diese Regler kosten Rechenleistung. Sie machen das Bild feiner, ändern aber nicht, was physikalisch passiert.", "These controls cost GPU time. They make the image finer but do not change what happens physically."), !0).select(
      "quality",
      i("Gerät (Startwerte)", "Device (start values)"),
      [
        ["phone", i("Smartphone", "Smartphone")],
        ["standard", i("Laptop / integrierte GPU", "Laptop / integrated GPU")],
        ["high", i("Desktop-GPU", "Desktop GPU")],
        ["ultra", i("High-End-GPU (z. B. RTX 4080/5080)", "High-end GPU (e.g. RTX 4080/5080)")],
        ["phone04", i("Smartphone (alte Werte v0.4)", "Smartphone (old v0.4 values)")],
        ["high04", i("Desktop-GPU (alte Werte v0.4)", "Desktop GPU (old v0.4 values)")],
        ["ultra04", i("High-End-GPU (alte Werte v0.4)", "High-end GPU (old v0.4 values)")]
      ],
      i(
        "Setzt Startwerte für Gitter, Farbauflösung, Partikelzahl und Render-Auflösung. Die Regler selbst gehen immer bis zum Maximum (32 Mio. Partikel, 2048² Farbe, 384² Gitter), egal welches Gerät gewählt ist.",
        "Sets starting values for grid, colour resolution, particle count and render resolution. The controls always go to the maximum (32 M particles, 2048² colour, 384² grid), whatever device is chosen."
      )
    ).range(
      "pixelDensity",
      i("Render-Auflösung", "Render resolution"),
      0.5,
      4,
      0.05,
      i(
        "Pixel pro Bildschirmpunkt. 1 = Bildschirmauflösung, 2–3 = Supersampling: deutlich schärfere Kanten und Filamente, kostet quadratisch mehr GPU. Für eine RTX 4080/5080 ruhig 2 bis 3.",
        "Pixels per screen point. 1 = screen resolution, 2–3 = supersampling: much sharper edges and filaments, costs quadratically more GPU. On an RTX 4080/5080 use 2 to 3."
      ),
      (d) => `${d.toFixed(2)}×`
    ).toggle(
      "autoQuality",
      i("60 fps halten", "Hold 60 fps"),
      i(
        "Misst beim Laden, wie schnell deine Grafikkarte einen Simulationsschritt rechnet, und senkt bei Bedarf die Auflösung. Danach passt sich die Render-Auflösung laufend an, damit die Bildrate über 58 fps bleibt.",
        "Measures during loading how fast your GPU computes a simulation step and lowers the resolution if needed. Afterwards the render resolution adapts continuously to keep the frame rate above 58 fps."
      )
    ).range(
      "dyeRes",
      i("Farbauflösung", "Colour resolution"),
      128,
      u.dyeRes,
      64,
      i("Auflösung der Wolkentextur je Würfelfläche. Bestimmt die Schärfe beim Heranzoomen. Kosten wachsen mit N².", "Cloud texture resolution per cube face. Sets sharpness when zooming in. Cost grows with N²."),
      (d) => `${d}²`
    ).range(
      "velRes",
      i("Gitter je Würfelfläche", "Grid per cube face"),
      32,
      u.velRes,
      16,
      i("Auflösung des Windgitters: 6 × N × N Zellen auf der Kugel. Kosten wachsen mit N².", "Wind grid resolution: 6 × N × N cells on the sphere. Cost grows with N²."),
      (d) => `${d}²`
    ).range(
      "curlRes",
      i("Feinheit Strömungsfeld", "Flow field resolution"),
      64,
      u.curlRes,
      64,
      i(
        "Auflösung des Strömungsfelds je Würfelfläche. Gaseous Giganticus nutzt 2048. Feiner = feinere Filamente.",
        "Flow field resolution per cube face. Gaseous Giganticus uses 2048. Finer = finer filaments."
      ),
      (d) => `${d}²`
    ).range(
      "particles",
      i("Partikel-Anzahl", "Particle count"),
      16384,
      u.particles,
      16384,
      i(
        "Anzahl der Partikel. jasper-r: 4 Mio. bei 80 fps. Handys schaffen etwa 0,25 bis 1 Mio., eine RTX 5080 deutlich über 16 Mio. Obergrenze je nach „Gerät“.",
        "Number of particles. jasper-r: 4 M at 80 fps. Phones manage about 0.25 to 1 M, an RTX 5080 well over 16 M. Upper limit depends on “Device”."
      ),
      l
    ).range(
      "iterations",
      i("Druck-Iterationen", "Pressure iterations"),
      2,
      200,
      1,
      i(
        "Jacobi-Schritte für die Druckgleichung. Mehr = sauberer divergenzfrei, aber teurer. Der wichtigste Leistungsregler.",
        "Jacobi steps for the pressure equation. More = closer to divergence-free, but slower. The most important performance control."
      ) + c("∇²p = ∇·u,  u ← u − ∇p")
    ).toggle(
      "bfecc",
      i("BFECC-Advektion", "BFECC advection"),
      i(
        "Fehlerkorrektur beim Mitführen: vor, zurück, halben Fehler abziehen. Schärfere Wirbel und Kanten.",
        "Error correction during transport: back, forth, subtract half the error. Sharper vortices and edges."
      ) + c("x̃ = x − ½(back(forth(x)) − x)")
    ), this.panel.section(i("Speichern und Rückgängig", "Save and undo"), i("Strg+Z / Strg+Y machen Änderungen rückgängig. Doppelklick auf einen Reglernamen setzt nur diesen zurück.", "Ctrl+Z / Ctrl+Y undo and redo. Double-click a control name to reset just that control.")), this.buildSaveSection(), this.panel.section(i("Diagnose", "Diagnostics"), void 0, !1).buttons([
      ["btn-film", i("🎞 Filmstreifen aufnehmen", "🎞 Record film strip"), () => this.recordFilmstrip()],
      ["btn-selftest", i("Kanten-Selbsttest", "Seam self-test"), () => this.runSelftest()]
    ], {
      "btn-film": i(
        "Nimmt 8 Bilder im Abstand von 2 s auf und speichert sie als ein PNG mit Einstellungen und fps. Zeigt Bewegung, die ein einzelnes Standbild nicht zeigt. Gut zum Anhängen an ein GitHub-Issue.",
        "Takes 8 frames 2 s apart and saves them as one PNG with settings and fps. Shows motion a single still cannot. Good for attaching to a GitHub issue."
      ),
      "btn-selftest": i(
        "Misst auf deiner Grafikkarte, ob die Cubemap-Abtastung an Würfelkanten nahtlos ist. Wenn nicht, schaltet er die exakte Abtastung ein.",
        "Measures on your GPU whether cube-map sampling is seamless at cube edges. If not, it turns on exact sampling."
      )
    }).toggle(
      "seamless",
      i("Exakte Kanten", "Exact edges"),
      i(
        "Tastet an Würfelkanten die Nachbartexel einzeln ab, statt der Hardware zu vertrauen. Nur nötig, wenn der Selbsttest eine Naht findet; kostet etwas Leistung.",
        "Samples neighbouring texels one by one at cube edges instead of trusting the hardware. Only needed if the self-test finds a seam; costs some performance."
      )
    ).custom(this.diagNote()), this.buildToolbar(), this.updateVisibility(), this.applyStaticText();
  }
  formulaNote(e) {
    const n = document.createElement("p");
    return n.className = "note formula", n.innerHTML = `<code class="fx">${e}</code>`, n;
  }
  diagNote() {
    const e = document.createElement("p");
    return e.className = "note", e.id = "diag-msg", e.setAttribute("aria-live", "polite"), e;
  }
  /** Feste Texte der Seite in der aktuellen Sprache. */
  applyStaticText() {
    const e = document.getElementById("version");
    e && (e.textContent = "d8d1537");
    const n = (a, l) => {
      const c = document.getElementById(a);
      c && (c.textContent = l);
    };
    n("hint", i("ziehen zum Drehen, Mausrad oder zwei Finger zum Zoomen", "drag to rotate, scroll or pinch to zoom")), n("load-title", i("Atmosphäre wird eingeschwungen", "Spinning up the atmosphere")), n("panel-title", i("Regler", "Controls")), nt("gas");
    const r = document.getElementById("lang");
    r && r.setAttribute("aria-label", i("Sprache: Englisch", "Language: German"));
    const s = document.getElementById("credits");
    s && (s.innerHTML = i(
      'Echtzeit-WebGPU, keine Bilddateien. Verfahren nach <a href="https://mofu-dev.com/en/blog/stable-fluids/" target="_blank" rel="noopener">mofu</a>, <a href="https://jasper-r.github.io/gas-giant" target="_blank" rel="noopener">jasper-r</a> und Gaseous Giganticus. <a href="#" target="_blank" rel="noopener">Quellcode</a>',
      'Real-time WebGPU, no image files. Methods after <a href="https://mofu-dev.com/en/blog/stable-fluids/" target="_blank" rel="noopener">mofu</a>, <a href="https://jasper-r.github.io/gas-giant" target="_blank" rel="noopener">jasper-r</a> and Gaseous Giganticus. <a href="#" target="_blank" rel="noopener">Source code</a>'
    )), this.updateInfo();
  }
  /** Steckbrief oben links: bekannte Werte des Planeten (bei Zufallsplaneten plausibel geschätzt). */
  static factsOpen = !1;
  updateInfo() {
    const e = document.getElementById("planet-info");
    if (!e) return;
    const n = this.preset, r = n.facts, s = (u, d = 0) => u.toLocaleString(Y === "de" ? "de-DE" : "en-US", { maximumFractionDigits: d }), a = [];
    if (r) {
      const u = r.diameterKm / 12742;
      a.push([i("Durchmesser", "Diameter"), `${s(r.diameterKm)} km (${s(u, 1)}× ${i("Erde", "Earth")})`]), a.push([i("Abstand zum Stern", "Distance to star"), `${s(r.distanceAU, r.distanceAU < 1 ? 3 : 2)} AE`.replace("AE", i("AE", "AU"))]), a.push([i("Jahr", "Year"), r.yearDays < 400 ? `${s(r.yearDays, 1)} ${i("Tage", "days")}` : `${s(r.yearDays / 365.25, 1)} ${i("Erdjahre", "Earth years")}`]), a.push([i("Tag", "Day"), r.locked ? i("gebunden (= Jahr)", "tidally locked (= year)") : `${s(n.rotationHours, 1)} h`]), a.push([i("Temperatur", "Temperature"), `${s(r.tempC)} °C ${i("(Wolkenobergrenze)", "(cloud tops)")}`]), a.push([i("Schwerkraft", "Gravity"), `${s(r.gravity, 1)} m/s² (${s(r.gravity / 9.81, 2)} g)`]), a.push([i("Stärkste Winde", "Fastest winds"), `${s(r.windMs)} m/s (${s(r.windMs * 3.6)} km/h)`]), a.push([i("Wolken aus", "Clouds of"), i(r.clouds[0], r.clouds[1])]), a.push([i("Monde", "Moons"), s(r.moons)]);
    } else
      a.push([i("Tag", "Day"), `${s(n.rotationHours, 1)} h`]);
    a.push([i("Achsneigung", "Axial tilt"), `${s(n.tilt, 1)}°`]), a.push([i("Abplattung", "Oblateness"), s(n.oblateness, 3)]), a.push([i("Stürme", "Storms"), String(n.storms.length)]);
    const l = (u) => u.replace(/[&<>]/g, (d) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[d]), c = a.filter(([u]) => u === i("Durchmesser", "Diameter") || u === i("Tag", "Day")), h = D.factsOpen ? a : c;
    e.innerHTML = `<div class="facts-name">${l(n.name)}${r?.note && D.factsOpen ? ` <span>· ${l(i(r.note[0], r.note[1]))}</span>` : ""} <button type="button" class="facts-more" aria-expanded="${D.factsOpen}">${D.factsOpen ? i("weniger ▴", "less ▴") : i("mehr ▾", "more ▾")}</button></div><dl class="facts${D.factsOpen ? "" : " short"}">${h.map(([u, d]) => `<dt>${u}</dt><dd>${l(d)}</dd>`).join("")}</dl>`, e.querySelector(".facts-more")?.addEventListener("click", () => {
      D.factsOpen = !D.factsOpen, this.updateInfo();
    });
  }
  updateVisibility() {
    const e = this.flowMode() === "fluid", n = this.lookMode();
    for (const r of ["jetRelax", "omega", "turbulence", "turbScale", "confinement", "drag", "iterations", "velRes", "bfecc", "stormSpawn", "kickLife", "stormHold"]) this.panel.visible(r, e);
    for (const r of ["curlStrength", "curlFreq", "curlSpeed", "curlOctaves", "vortexCount", "vortexStrength", "curlRes"]) this.panel.visible(r, !e);
    for (const r of ["particles", "lifetime", "opacity", "blur", "viewFocus"]) this.panel.visible(r, n !== "dye");
    this.panel.visible("fade", n === "pure");
    for (const r of ["bandRelax", "fineStripes", "convection", "stormTint"]) this.panel.visible(r, n !== "pure");
    for (const r of document.querySelectorAll("#panel-body details")) {
      const s = [...r.querySelectorAll(".row")];
      r.hidden = s.length > 0 && s.every((a) => a.hidden);
    }
  }
  /** Vorspulen: Sekunden Simulationszeit ohne Bild vorausrechnen, ohne Ladezeit-Grenze. */
  skip(e) {
    const n = Math.round(e / ne);
    this.warm = n, this.warmTotal = n, this.warmStart = performance.now(), this.manualSkip = !0, J(!0);
  }
  /** Immer sichtbare Knopfleiste oben im Panel. */
  buildToolbar() {
    const e = document.getElementById("toolbar");
    if (!e) return;
    e.innerHTML = "";
    const n = (s, a, l, c) => {
      const h = document.createElement("button");
      return h.type = "button", h.id = s, h.textContent = a, h.title = l, h.addEventListener("click", c), e.append(h), h;
    };
    n(
      "btn-warm",
      i("⏩ 20 s", "⏩ 20 s"),
      i("20 Sekunden Simulationszeit vorspulen: sofort den eingeschwungenen Zustand sehen.", "Skip 20 seconds of simulation time: see the settled state right away."),
      () => this.skip(20)
    ), n("btn-warm60", i("⏩ 60 s", "⏩ 60 s"), i("60 Sekunden Simulationszeit vorspulen.", "Skip 60 seconds of simulation time."), () => this.skip(60)), n("btn-warm600", i("⏩ 600 s", "⏩ 600 s"), i("10 Minuten Simulationszeit vorspulen. Dauert je nach Grafikkarte einige Sekunden.", "Skip 10 minutes of simulation time. Takes a few seconds depending on the GPU."), () => this.skip(600));
    const r = n("btn-pause", o.paused ? i("▶ Weiter", "▶ Resume") : i("⏸ Pause", "⏸ Pause"), i("Simulation anhalten oder weiterlaufen lassen.", "Pause or resume the simulation."), () => {
      o.paused = !o.paused, r.textContent = o.paused ? i("▶ Weiter", "▶ Resume") : i("⏸ Pause", "⏸ Pause");
    });
    n(
      "btn-reset",
      i("↻ Neuer Lauf", "↻ New run"),
      i("Gleicher Planet, gleiche Regler, neu gewürfelte Turbulenz.", "Same planet, same controls, freshly rolled turbulence."),
      () => {
        this.runSeed = Math.floor(Math.random() * 1e5), this.needsInit = !0;
      }
    );
  }
  resetSettings() {
    const e = {
      preset: o.preset,
      quality: o.quality,
      velRes: o.velRes,
      dyeRes: o.dyeRes,
      curlRes: o.curlRes,
      particles: o.particles,
      seed: o.seed,
      rndFamily: o.rndFamily,
      rndBands: o.rndBands,
      rndStorms: o.rndStorms,
      rndRings: o.rndRings
    }, n = o.retro !== ee.retro;
    Object.assign(o, ee, e), this.applyPreset(), n && (this.spin = -this.spin), b.classList.toggle("map", o.map), this.updateVisibility(), this.panel.refresh(), this.buildToolbar(), this.remember();
  }
  /** Sprache wechseln: Panel neu aufbauen, feste Texte ersetzen. */
  toggleLang() {
    Qe(Y === "de" ? "en" : "de"), this.buildUI();
  }
  onChange(e) {
    switch (this.remember(), e) {
      case "preset":
        o.preset === "Zufall" && (o.seed = ce()), this.applyPreset(), this.sky.generate(String(o.seed) + o.preset), this.buildUI();
        break;
      case "rndFamily":
      case "rndBands":
      case "rndStorms":
      case "rndRings":
        o.preset === "Zufall" && this.applyPreset();
        break;
      case "quality": {
        this.downgrades = 0, this.renderScale = 1, this.applyQuality(!0), this.buildUI();
        break;
      }
      case "contrast":
        this.writeTables();
        break;
      case "remember":
        try {
          localStorage.setItem("fgp-remember", o.remember ? "1" : "0");
        } catch {
        }
        o.remember && this.warm === 0 && this.saveState();
        break;
      case "fineStripes":
        this.needsDye = !0;
        break;
      case "velRes":
      case "curlRes":
        this.allocVel();
        break;
      case "dyeRes":
        this.allocDye();
        break;
      case "particles":
        this.allocParticles();
        break;
      case "flow":
      case "look":
        e === "look" && (Object.values(pe).includes(o.eddyStrength) && (o.eddyStrength = pe[o.look] ?? o.eddyStrength), Object.values(fe).includes(o.relief) && (o.relief = fe[o.look] ?? o.relief), this.panel.refresh()), this.updateVisibility(), this.needsDye = !0, e === "look" && me[o.quality]?.fluid && (this.applyQuality(!0), this.panel.refresh());
        break;
      case "retro":
        this.usePreset(this.preset), this.needsInit = !0;
        break;
      case "seamless":
        this.buildPipes(o.seamless);
        break;
      case "map":
        b.classList.toggle("map", o.map);
        break;
      case "autoQuality":
        this.renderScale = 1;
        break;
      case "pixelDensity":
        this.dpr = o.pixelDensity;
        break;
    }
  }
}
const gt = () => ft().catch((t) => C(`${i("<b>Start fehlgeschlagen:</b>", "<b>Start failed:</b>")} ${t instanceof Error ? t.message : String(t)}`));
export {
  D as App,
  me as QUALITY,
  o as S,
  gt as run
};
