# Owners – Übergabe (Stand 08.10.2026)

Allianzseite „Owners“ (Tag [Owned], OGame Celestia / Uni 284, gegründet 03.10.2026). Nachbau von `docs/celestia2/` (3D-Welt:
Gasriese + Todesstern, Blättern) mit neuen Texten und einer neuen Mondszene. `docs/celestia2/` ist unverändert geblieben.
Adresse nach dem Veröffentlichen: https://loveascent.github.io/OgameX_3D_Mod/Owners/ — **noch nichts committet/veröffentlicht.**

## Unterschiede zu celestia2
| Was | Wo |
|---|---|
| Texte (7 Kapitel: start, veteranen, zusammen, siegreich, celestia, jubilaeum, spass), Bewerbungslink | `js/inhalt/texte.js` |
| Kapitel-IDs/Kameras (letztes Kapitel = Mondszene) | `js/welt/kapitel.js` |
| Mond-Geometrie (Bahn, Kreuzungspunkt, Kamera) – reine Formeln | `js/welt/mond.js` |
| Mond: Anflug, Schnitt, Hälften, Schnittflächen | `js/koerper/mond/mond.js`, `oberflaeche.js` (prozedurale Oberfläche) |
| Rauch/Glut des Schnitts (Partikel) | `js/koerper/mond/rauch.js` |
| Station zielt im Mondkapitel auf den Mond-Zielpunkt und schießt nur auf dessen Freigabe | `js/koerper/station/station.js` (4 Zeilen), `js/start.js` |
| Projekte-Kapitel (Gasplanet/3D-Mod) entfällt – bewusst, Technik gehört nicht der Allianz | – |

## Mondszene (Ablauf)
Station schwenkt auf `T = P + 0,30 R·seite + 0,22 R·oben`; der Mond fliegt auf einer Kreisbahn (Radius 2 R, 260 km/s, Radius 420 km)
durch genau diese Strahlgerade. Schuss wird 8,2 s vor der Kreuzung ausgelöst (Strahl voll: 6,7–10 s). Schnittebene = Ebene aus
echter Strahlachse und Flugrichtung; Hälften driften mit 60 km/s auseinander (Formeln im Kopf von `mond.js`). Ein Durchgang
dauert ~35 s, danach kommt ein neuer Mond. Abschalten: `?aus=mond` (nur Rauch: `?aus=rauch`). Feinwerte: `MOND` in `welt/mond.js`.

## Prüfen (nur RTX 5080)
`node werkzeug/seite/pruefen.mjs --seite Owners --kapitel 6 --warte 1 --mond-vor 7.5 --serie 9 --takt 1200` → `werkzeug/seite/bilder/quer-collage.png`
(`--format hoch` fürs Handyformat; `werkzeug/seite/collage.mjs` baut Sammelbilder aus beliebigen PNG).

## Offen / zu klären
1. **Rauch ist ein Näherungs-Effekt** (Partikel). Der echte 3D-Rauch-Löser (Laserschnitt-Baustein im Fluid-Gas-Planet, `bausteine-todesstern/3-schnitt-und-einblendung`) ist nicht eingebunden – er bringt eigene Mond-/Strahl-Simulation mit.
2. Bewerbungslink: erledigt (allianceId=500167).
3. Allianz-Wappen/Banner aus dem Spiel sind nicht eingebaut (Bilddateien liegen nicht vor).
4. Link-Vorschau (og:image) fehlt wie bei celestia2.
5. Erst nach Ja: committen/veröffentlichen (`docs/Owners/`, `werkzeug/seite/`).

Quellen der Fakten: OGame-DE-Board „Neues Universum Celestia startet am 02.10.2026“; MMOFacts „OGame: Mega-Update zum 24-jährigen – Project Orion“.
