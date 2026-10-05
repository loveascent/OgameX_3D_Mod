# celestia2 – Übergabe (Stand 05.10.2026)

Neubau von Grund auf. **Kein Code aus celestia, celestia2 (alt) oder celestia3 übernommen** (Anweisung: die alten Stände
sind fehlerhaft). Das alte celestia2 liegt nur als Sicherung in `werkzeug/_alt/celestia2-stand-2026-10-04/` – nicht als Vorlage benutzen.
Nichts ist committet, nichts veröffentlicht. Die Seite läuft **noch nicht** (index.html, Strahl, Oberfläche, start.js fehlen).

## Ziel (Auftrag)

Allianz-Homepage „World of Celestia“ (OGame Uni 284 DE) als **echte 3D-Welt**: Gasriese (Original-Simulator, Stand
„current“ d8d1537) + Todesstern als Raumstation, Schuss als gerader Zylinder mit Hitzeflimmern, Blättern per
Scrollrad/Wischen/Tasten (keine Scrollleiste), Kamera unabhängig von Physik/Mathe. Jede Datei klein, einzeln
abschaltbar (`?aus=…`), Formeln im Code. Schnell laden, ruckelfrei, Handy bis High-End. Projekte zeigen (Gasplanet,
3D-Mod) – **Urheber des Gasplaneten nirgends nennen** (Build entfernt den Namen und bricht ab, falls er auftaucht).

## Fertig

| Datei | Inhalt |
|---|---|
| `js/mathe/vektor.js` | Vektoren als Arrays |
| `js/mathe/ellipsoid.js` | Strahl–Ellipsoid-Schnitt, Normale, Breite/Länge (wie Planeten-Shader) – getestet |
| `js/mathe/ausrichtung.js` | Quaternionen: blickQuat (+z auf Ziel), drehBegrenzt (ω_max), slerp – getestet |
| `js/mathe/feder.js` | kritisch gedämpfte Feder (exakte Lösung je Schritt) |
| `js/welt/masse.js` | km-Maße: Station 160 km, Planet in 6,5 R, Lichtgeschw., Sonne, Achse |
| `js/welt/welt.js` | S, P, Basis (a, seite, oben) aus Planetenradius |
| `js/welt/kapitel.js` | 7 Kapitel = Kameraeinstellungen (st()/pl()-Bezug), Feuerplan je Kapitel |
| `js/kamera/rahmen.js` | Bildwinkel je Seitenverhältnis, Körper bleiben im Bild |
| `js/kamera/kamera.js` | Flug per Feder, Kollision mit Station/Planet, Atmen, Übergabe an three |
| `js/kern/takt.js, luft.js, module.js, leitung.js, qualitaet.js` | Bildschleife 60 fps, Yield, Bauteil-Schalter, Leitungsmessung, 4 Stufen + Automatik |
| `js/gpu/geraet.js` | ein WebGPU-Gerät für three + Simulator, sonst WebGL2; reversed-Z |
| `js/gpu/bild.js` | Komposition: Hintergrund (Simulator) + Szene, Alpha-Kanal = Rumpf/Hitze, ACES wie Planet, Bloom |
| `js/gpu/mischung.js` | Mischarten Glanz (nur Farbe) / Hitze (nur Alpha) |
| `js/koerper/planet/gasriese.js` | Unterklasse des Original-Simulators: Weltkamera, Weltsonne, eigenes Ziel – **ohne Quell-Patches** |
| `js/koerper/planet/planet.js` | Planet in der Welt: Hintergrund-Textur + Tiefen-Stellvertreter (Ellipsoid) |
| `js/koerper/planet/ersatz.js` + `jupiter-karte.jpg` | Ersatzplanet ohne WebGPU |
| `js/koerper/station/modell.js` | GLB laden (Worker), vorwärmen, Stufen niedrig/mittel/hoch, Tausch ohne Ruckeln |
| `js/koerper/station/blitze.js` | eigene Blitz-Bänder aus blitze.json, Elektroden-Rastung an der Trommel |
| `js/koerper/station/ablauf.js` | Schussablauf-Kurven (Laden, Blenden, Leistung) |
| `js/koerper/station/licht.js` | Sonne, Planetenschein (Lambert-Phase), Sternlicht, Emitter |
| `js/koerper/station/station.js` | Zielen mit 1,5°/s, Feuer nur bei ruhiger Achse (Strahl exakt gerade), Rotoren/Blenden/Iris |
| `js/pfade.js` | alle Asset-Pfade (GLB/Blitze liegen in `allianz-vorschau/…/todesstern/`) |
| `fremd/three/` | three 0.186.1 minifiziert (1,1 MB statt 3,7 MB) – `werkzeug/seite/three-bauen.mjs` |
| `js/fremd/gasplanet-kern.js` | Simulator (186 KB, ohne Namen) – `werkzeug/gasplanet/bauen.mjs` |

## Stand 05.10.2026 (zweite Runde): Seite läuft

Alle Bauteile sind geschrieben und laufen zusammen: Planet (Simulator mit Weltkamera), Station (lädt in 2–4 s),
Strahl (gerade, Lichtgeschwindigkeit, endet am Ellipsoid, L = 393 160 km), Hitzeflimmern, Einschlag mit Wirbel,
7 Kapitel mit Blättern, Qualitätsautomatik (5080: schaltet bis High-End hoch), Quer- und Hochformat.

**Prüfen nur auf der RTX 5080:** Der eingebaute Browser der App rechnet auf der AMD-iGPU – nicht benutzen.
`node werkzeug/seite/pruefen.mjs --kapitel 0,3 --format quer|hoch [--schuss]` startet Chrome, prüft zuerst
`adapter.info.vendor === 'nvidia'` und bricht sonst ab, bevor die Seite lädt. Bilder: `werkzeug/seite/bilder/`.
Lokaler Server: `node werkzeug/seite/server.mjs` (Port 8290), Eintrag `celestia2` in `E:/Claude/.claude/launch.json`.

## Offen

0. Erledigt (05.10. Runde 3): Bühnenmaßstab (Planet 4 000 km, Abstand 3,2 R); Objektiv-Shift-Raster (Text links/unten, Motive rechts/oben), Kompositionen rechnerisch geprüft mit `node werkzeug/seite/kompositionen.mjs`; Kamerafahrten mit fester Dauer (smootherstep); keine 60-fps-Grenze; Stufe nur beim Start; Gestaltung (Space Grotesk/Inter, Schleier statt Kästen). Bildzeiten: `node werkzeug/seite/messen.mjs`.
0. Erledigt: Austrittspunkt/Achse des Strahls werden beim Laden am Modell gemessen (Iris-Mitte (0;0;4,45), Normale +z), nicht mehr aus dem alten Modul übernommen (vorher z = 5,35). Ansehen: Doppelklick `werkzeug/seite/ansehen.cmd`.

1. Kapitel `schutz` im Hochformat: Bildwinkel 103° (weit). Besser: Kamera zurückfahren statt Bildwinkel öffnen (kamera/rahmen.js).
2. Einschlag-Glut ist aus der Titelperspektive klein – Größe gegen Bild prüfen.
3. Stufenwechsel im laufenden Betrieb (Smartphone ↔ High-End) einzeln ansehen; Modell-Nachladen (mittel/hoch) bestätigen.
4. Ersatzplanet (ohne WebGPU) einmal mit `--url-zusatz aus=planet`/ohne WebGPU prüfen.
5. Texte vom Auftraggeber freigeben lassen (`js/inhalt/texte.js`).
6. Erst nach Ja: committen/veröffentlichen (`docs/celestia2/` + `werkzeug/gasplanet`, `werkzeug/seite`).

## Ältere offene Punkte (erledigt)
 (in dieser Reihenfolge)

1. `js/koerper/strahl/verlauf.js` – Leistungs-Verlauf als Ringpuffer (30 Hz, ~2,2 s): Helligkeit bei Abstand s =
   Leistung zur Zeit t − s/c → Front und Ende fliegen mit Lichtgeschwindigkeit.
2. `js/koerper/strahl/strahl.js` – drei Zylinder (Radius 0,14/0,3/0,6 Modell-Einheiten × Maßstab) von `station.zustand.M`
   entlang `d` bis zum Ellipsoid-Schnitt (`mathe/ellipsoid.js`, Körperrahmen über `planet.koerper`);
   Leuchtdichte ∝ Sehne 2r·|n·v|; Mindestradius 1 Pixel mit Energieerhaltung; `glanzMischung`.
3. `js/koerper/strahl/hitze.js` – Hüllzylinder 3× Radius, schreibt nur Alpha (`hitzeMischung`), bild.js verschiebt.
4. `js/koerper/strahl/einschlag.js` – Feuerball am Treffer: r = 1200 km·t^(2/5) (Sedov-Taylor), Farbe Schwarzkörper;
   beim ersten Eintreffen `planet.wirbel({breite, laenge})` (Breite/Länge via `ellipsoid.breiteLaenge`).
5. `js/inhalt/texte.js` – Texte je Kapitel (start, aktiv, schutz, feuer, gemeinsam, projekte, bewerben).
   Allianz-Link: `https://s284-de.ogame.gameforge.com/game/allianceInfo.php?allianceId=500192`,
   3D-Mod: `https://github.com/loveascent/OgameX_3D_Mod`. Gasplanet ohne Link/Namen.
6. `js/ui/blaettern.js` (Rad mit Schwelle + Sperre, Wischen, Tasten, Punkte, `#kapitel`), `js/ui/kapitel.js`, `js/ui/stufenwahl.js` (inkl. „Auto“).
7. `js/start.js` – Reihenfolge: Texte sofort → Renderer → Planet einschwingen (Häppchen) → Station (niedrig) →
   Bild → Takt; danach `station.nachladen(stufe.modell)`. Stufenwechsel: dpr, `planet.stufe`, Bild neu bauen.
   Je Bild: kamera → `aufThree` → planet.schritt → station.schritt → strahl/hitze/einschlag → bild.render → `qualitaet.messe(dt)`.
8. `index.html` (Importmap auf `fremd/three/*.min.js`, `three/addons/` nicht nötig), `css/` (Tokens, Kapitel, Bedienung).
9. Lokal prüfen: kleiner Server mit Basis `/OgameX_3D_Mod/` (neu schreiben in `werkzeug/seite/`), `.claude/launch.json`,
   dann Browser-Pane: Konsole, Bild je Kapitel, Hochformat 390×844, Stufen.
10. Erst nach Ja des Auftraggebers: committen/veröffentlichen.

## Zu prüfen beim ersten Lauf

- `screenUV` von three vs. Zeilenreihenfolge der Simulator-Textur (evtl. y spiegeln in `planet.hintergrund`).
- Simulator-Uniform-Indizes (`gasriese.js`, Konstante `U`) gegen `writeRender` des Stands d8d1537.
- Blenden-Drehachse und Vorzeichen der Rotoren am Bild prüfen.
- Hinweis: Im Repo (committet, also schon öffentlich) steht der Urhebername noch in `docs/celestia/planet/NOTICE`,
  `docs/celestia/planet/editor.html`, `docs/allianz-vorschau/mods/_gemeinsam/planet/NOTICE` und `…/planet/index.html`.
  Auftraggeber fragen, ob entfernt werden soll (steht dann weiter in der Git-Historie).
