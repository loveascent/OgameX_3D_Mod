// Holt three.js (fester Stand) von npm und legt eine minifizierte Fassung nach docs/celestia2/fremd/three/.
//   node werkzeug/seite/three-bauen.mjs
// Warum selbst minifizieren: npm liefert three 0.186.1 nur unminifiziert (webgpu + core ≈ 3,7 MB).
// esbuild verkleinert jede Datei einzeln, Modulgrenzen bleiben gleich (Importmap in index.html).
// Die benötigten Zusatzmodule (GLTF, KTX2, meshopt, Bloom) werden zu EINER Datei gebündelt, three bleibt extern.
import { execSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const VERSION = '0.186.1';
const hier = dirname(fileURLToPath(import.meta.url));
const ziel = resolve(hier, '../../docs/celestia2/fremd/three');
const esbuild = resolve(hier, '../gasplanet/quelle/node_modules/.bin/esbuild');   // aus dem Planet-Bau (npm ci)
const tmp = join(tmpdir(), `three-${VERSION}`);
const sh = (c, cwd = tmp) => execSync(c, { cwd, stdio: 'inherit' });

mkdirSync(tmp, { recursive: true });
if (!existsSync(join(tmp, 'package'))) { sh(`npm pack three@${VERSION} --silent`); sh(`tar xzf three-${VERSION}.tgz`); }
mkdirSync(join(ziel, 'basis'), { recursive: true });
const p = join(tmp, 'package');

for (const f of ['three.core.js', 'three.webgpu.js', 'three.tsl.js'])
  sh(`"${esbuild}" "${join(p, 'build', f)}" --minify --format=esm --log-level=warning --outfile="${join(ziel, f.replace('.js', '.min.js'))}"`);
// three.webgpu.min.js importiert './three.core.js' -> auf die minifizierte Datei umbiegen
for (const f of ['three.webgpu.min.js', 'three.tsl.min.js']) {
  const pfad = join(ziel, f);
  const t = (await import('node:fs')).readFileSync(pfad, 'utf8').replaceAll('./three.core.js', './three.core.min.js').replaceAll('./three.webgpu.js', './three.webgpu.min.js');
  writeFileSync(pfad, t);
}

writeFileSync(join(tmp, 'zusatz.js'), `
export { GLTFLoader } from './package/examples/jsm/loaders/GLTFLoader.js';
export { KTX2Loader } from './package/examples/jsm/loaders/KTX2Loader.js';
export { MeshoptDecoder } from './package/examples/jsm/libs/meshopt_decoder.module.js';
export { bloom } from './package/examples/jsm/tsl/display/BloomNode.js';
`);
sh(`"${esbuild}" zusatz.js --bundle --minify --format=esm --log-level=warning --external:three --external:three/webgpu --external:three/tsl --outfile="${join(ziel, 'zusatz.min.js')}"`);
for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) copyFileSync(join(p, 'examples/jsm/libs/basis', f), join(ziel, 'basis', f));
copyFileSync(join(p, 'LICENSE'), join(ziel, 'LICENSE'));

for (const f of ['three.core.min.js', 'three.webgpu.min.js', 'three.tsl.min.js', 'zusatz.min.js'])
  console.log(f.padEnd(22), (statSync(join(ziel, f)).size / 1024).toFixed(0), 'KB');
