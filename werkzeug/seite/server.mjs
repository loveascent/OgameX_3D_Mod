// Lokaler Server wie GitHub Pages: docs/ liegt unter /OgameX_3D_Mod/. Kein Zwischenspeichern (no-store).
//   node werkzeug/seite/server.mjs   →   http://localhost:8290/OgameX_3D_Mod/celestia2/
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 8290;
const BASIS = '/OgameX_3D_Mod/';
const DOCS = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs');
const ARTEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
	'.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
	'.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

createServer((req, res) => {
	const url = new URL(req.url, 'http://x');
	if (!url.pathname.startsWith(BASIS)) { res.writeHead(302, { location: BASIS + 'celestia2/' }); return res.end(); }
	let pfad = normalize(join(DOCS, decodeURIComponent(url.pathname.slice(BASIS.length))));
	if (pfad !== DOCS && !pfad.startsWith(DOCS + sep)) { res.writeHead(403); return res.end(); }
	try {
		if (statSync(pfad).isDirectory()) {
			if (!url.pathname.endsWith('/')) { res.writeHead(301, { location: url.pathname + '/' + url.search }); return res.end(); }
			pfad = join(pfad, 'index.html');
		}
		const groesse = statSync(pfad).size;
		res.writeHead(200, { 'content-type': ARTEN[extname(pfad)] ?? 'application/octet-stream', 'content-length': groesse, 'cache-control': 'no-store' });
		createReadStream(pfad).pipe(res);
	} catch { res.writeHead(404, { 'cache-control': 'no-store' }); res.end('404 ' + url.pathname); }
}).listen(PORT, () => console.log(`celestia2: http://localhost:${PORT}${BASIS}celestia2/`));
