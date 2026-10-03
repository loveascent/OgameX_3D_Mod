// Himmel + "Liquid Glass"-Titel in einem Durchgang.
// Der Himmel (Nebel + Sterne) ist rein prozedural; der Titel ist eine Hoehenkarte (weichgezeichnete Schrift),
// aus der Normalen entstehen. Mit ihnen wird der Himmel hinter den Buchstaben gebrochen (je Farbkanal etwas
// anders = Dispersion), dazu Fresnel-Rand, Glanzlicht vom Zeiger und Schatten aussen.

struct U {
  res: vec2f,
  zeit: f32,
  flug: f32,        // 0..1 Kamerafahrt durch den Titel hindurch
  zeiger: vec2f,    // -1..1
  titel: f32,       // Sichtbarkeit des Titels 0..1
  aspekt: f32,
  tempo: f32,       // Sternenflug (Jaeger-Kapitel), 0..1
  fit: f32,         // Titel passend zur Breite
  waerme: f32,      // 0..1 orange Schimmer (Jaeger/Triebwerk)
  _p: f32,
};

@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var maskScharf: texture_2d<f32>;
@group(0) @binding(3) var maskHoehe: texture_2d<f32>;

struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = vec2f((p[i].x + 1.0) * 0.5, 1.0 - (p[i].y + 1.0) * 0.5);
  return o;
}

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}
fn hash22(p: vec2f) -> vec2f {
  let n = hash21(p);
  return vec2f(n, hash21(p + n + 17.0));
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  let s = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}
fn fbm(p0: vec2f) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0;
  for (var i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = mat2x2f(0.8, -0.6, 0.6, 0.8) * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return s;
}

fn sterne(q: vec2f, t: f32) -> vec3f {
  var c = vec3f(0.0);
  for (var l = 0; l < 3; l++) {
    let s = 22.0 + f32(l) * 38.0;
    let g = q * s + f32(l) * 7.31;
    let id = floor(g); let f = fract(g) - 0.5;
    let r = hash22(id);
    let off = (r - 0.5) * 0.7;
    let d = length(f - off);
    let gr = 0.035 + 0.03 * hash21(id + 3.0);
    let bright = smoothstep(gr, 0.0, d) * (0.35 + 0.65 * hash21(id + 9.0));
    let tw = 0.75 + 0.25 * sin(t * (1.5 + 3.0 * r.x) + r.y * 40.0);
    let keep = select(0.0, 1.0, hash21(id + 5.0) > 0.55 - 0.1 * f32(l));
    let tint = mix(vec3f(0.65, 0.8, 1.0), vec3f(1.0, 0.85, 0.7), hash21(id + 1.7));
    c += tint * bright * tw * keep * (1.4 - 0.3 * f32(l));
  }
  return c;
}

// Sternenflug: radiale Striche, wenn der Jaeger anfliegt
fn striche(p: vec2f, t: f32, tempo: f32) -> vec3f {
  if (tempo < 0.01) { return vec3f(0.0); }
  let r = length(p); let a = atan2(p.y, p.x);
  let n = 90.0;
  let id = floor(a / 6.2831853 * n + 0.5);
  let ang = fract(a / 6.2831853 * n + 0.5) - 0.5;
  let rr = hash21(vec2f(id, 3.0));
  let ph = fract(rr + t * (0.25 + 0.5 * hash21(vec2f(id, 8.0))) * (0.4 + tempo));
  let rad = ph * 1.4;
  let len = 0.04 + 0.35 * tempo * ph;
  let line = smoothstep(0.12, 0.0, abs(ang) * r * 6.0) * smoothstep(len, 0.0, abs(r - rad)) ;
  return vec3f(0.6, 0.8, 1.0) * line * tempo * ph * 1.6;
}

fn himmel(q: vec2f, t: f32, warm: f32) -> vec3f {
  let w = vec2f(fbm(q * 1.1 + t * 0.012), fbm(q * 1.1 + 5.2 - t * 0.01));
  let n1 = fbm(q * 1.35 + w * 1.7 + vec2f(t * 0.008, 0.0));
  let n2 = fbm(q * 2.6 - w * 1.1 + 3.3);
  let tief = vec3f(0.008, 0.016, 0.040);
  let blau = vec3f(0.050, 0.150, 0.360);
  let viol = vec3f(0.240, 0.090, 0.340);
  let cyan = vec3f(0.100, 0.520, 0.700);
  let glut = vec3f(0.800, 0.330, 0.100);
  var c = tief;
  c = mix(c, blau, smoothstep(0.30, 0.78, n1) * 0.95);
  c = mix(c, viol, smoothstep(0.45, 0.85, n2) * smoothstep(0.35, 0.8, n1) * 0.8);
  c += cyan * pow(smoothstep(0.62, 0.95, n1 * 0.7 + n2 * 0.5), 2.2) * 0.65;
  c += glut * pow(smoothstep(0.55, 0.95, n2), 3.0) * (0.10 + 0.55 * warm);
  c += sterne(q, t);
  return c;
}

fn tonemap(c: vec3f) -> vec3f {
  let x = c * 1.05;
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let t = u.zeit;
  let p = (in.uv - 0.5) * vec2f(u.aspekt, 1.0);

  // Kamerafahrt: Himmel zoomt, Parallaxe mit dem Zeiger
  let zoom = 1.0 + u.flug * 1.6;
  let q0 = p / zoom + u.zeiger * 0.012 * vec2f(1.0, -1.0);

  // Titel-Koordinaten (Karte deckt 2.0 x 1.0 Welteinheiten) mit leichtem fluessigem Wackeln
  let tz = (1.0 + u.flug * u.flug * 9.0) * u.fit;
  var tuv = p / tz / vec2f(2.0, 1.0) + 0.5;
  let wob = vec2f(vnoise(tuv * 6.0 + t * 0.35), vnoise(tuv * 6.0 + 9.0 - t * 0.3)) - 0.5;
  tuv += wob * 0.006;

  var farbe = himmel(q0, t, u.waerme) ;
  farbe += striche(p, t, u.tempo);

  if (u.titel > 0.003) {
    let tx = vec2f(1.0 / 2048.0, 1.0 / 1024.0);
    let m = textureSample(maskScharf, smp, tuv).r;
    let h = textureSample(maskHoehe, smp, tuv).r;
    let hx = textureSample(maskHoehe, smp, tuv + vec2f(tx.x * 3.0, 0.0)).r - textureSample(maskHoehe, smp, tuv - vec2f(tx.x * 3.0, 0.0)).r;
    let hy = textureSample(maskHoehe, smp, tuv + vec2f(0.0, tx.y * 3.0)).r - textureSample(maskHoehe, smp, tuv - vec2f(0.0, tx.y * 3.0)).r;
    let n = normalize(vec3f(-hx * 5.0, -hy * 5.0, 1.0));

    // Schatten / Glut aussen um die Schrift
    let aussen = textureSample(maskHoehe, smp, tuv - vec2f(0.0, 0.012)).r;
    farbe *= 1.0 - 0.55 * aussen * (1.0 - m) * u.titel;
    farbe += vec3f(0.10, 0.25, 0.55) * pow(h, 3.0) * 0.18 * (1.0 - m) * u.titel;

    if (m > 0.002) {
      // Brechung: Versatz entlang der Normalen, je Kanal anders
      let br = n.xy * (0.085 + 0.07 * (1.0 - n.z)) * vec2f(1.0, 1.0);
      let qa = q0 - br * 1.00;
      let qb = q0 - br * 1.07;
      let qc = q0 - br * 1.15;
      var g = vec3f(himmel(qa, t, u.waerme).r, himmel(qb, t, u.waerme).g, himmel(qc, t, u.waerme).b);
      // etwas "Tiefenunschaerfe" des Hintergrunds hinter dem Glas
      g = g * 0.6 + 0.4 * (himmel(q0 - br * 2.2 + vec2f(0.01, 0.0), t, u.waerme) + himmel(q0 - br * 2.2 - vec2f(0.0, 0.01), t, u.waerme)) * 0.5;
      g = g * vec3f(1.0, 1.08, 1.2) * 1.5 + vec3f(0.05, 0.10, 0.19) + vec3f(0.10, 0.17, 0.28) * (1.0 - tuv.y) * smoothstep(0.0, 0.8, h);

      let lichtDir = normalize(vec3f(u.zeiger.x * 0.9 + 0.35, -u.zeiger.y * 0.9 + 0.6, 0.75));
      let V = vec3f(0.0, 0.0, 1.0);
      let hv = normalize(lichtDir + V);
      let spec = pow(max(dot(n, hv), 0.0), 70.0);
      let spec2 = pow(max(dot(n, normalize(vec3f(-0.5, -0.7, 0.6) + V)), 0.0), 40.0);
      let fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.2);
      let kante = smoothstep(0.55, 0.0, h) ;      // innen weich, am Rand hell
      var glas = g + vec3f(0.55, 0.78, 1.0) * fres * 1.15 + vec3f(1.0) * spec * 1.1 + vec3f(0.55, 0.8, 1.0) * spec2 * 0.5;
      glas += vec3f(0.45, 0.7, 1.0) * kante * 0.18;
      // Regenbogensaum an der Kante (Dispersion)
      let reg = 0.5 + 0.5 * cos(6.2831 * (fres * 1.3 + vec3f(0.0, 0.33, 0.67)) + t * 0.4);
      glas += reg * fres * 0.35;
      farbe = mix(farbe, glas, smoothstep(0.0, 0.6, m) * u.titel);
    }
  }

  // Vignette, Tonwert
  let vig = 1.0 - 0.55 * dot(p * vec2f(0.8, 1.0), p * vec2f(0.8, 1.0));
  farbe = tonemap(farbe * clamp(vig, 0.0, 1.0));
  return vec4f(pow(farbe, vec3f(1.0 / 1.08)), 1.0);
}
