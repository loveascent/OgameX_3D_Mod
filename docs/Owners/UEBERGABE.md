# Owners – Übergabe (Stand 08.10.2026)

Allianzseite „Owners“ (Tag [Owned], OGame Celestia / Uni 284, gegründet 03.10.2026). Nachbau von `docs/celestia2/` (3D-Welt:
Gasriese + Todesstern, Blättern) mit neuen Texten, dauerhaft kreisendem Mond und sichtbarer Milchstraße. `docs/celestia2/` ist unverändert.
Online: https://loveascent.github.io/OgameX_3D_Mod/Owners/ · Bewerbungslink: `allianceId=500167` (`js/inhalt/texte.js`).

## Unterschiede zu celestia2
| Was | Wo |
|---|---|
| Texte (7 Kapitel: start, veteranen, zusammen, siegreich, celestia, jubilaeum, bewerben) | `js/inhalt/texte.js` |
| Kapitel/Kameras: wie celestia2 (nur umbenannt), Feuerplan mit `pause: 0` | `js/welt/kapitel.js` |
| Mondbahn, Geschwindigkeitsprofil, Zeit bis zur Kreuzung – reine Formeln | `js/welt/mond.js` |
| Mond (Umlauf, Schnitt, Hälften, Schnittflächen), Oberfläche prozedural | `js/koerper/mond/mond.js`, `oberflaeche.js` |
| Rauch/Glut des Schnitts (Partikel) | `js/koerper/mond/rauch.js` |
| Station zielt mit Mond auf die Planetenmitte und schießt nur auf Freigabe des Mondes | `js/koerper/station/station.js` (2 Zeilen), `js/start.js` |
| Milchstraße: anderer Würfelschlüssel + breiter/heller | `js/koerper/planet/gasriese.js` (`HIMMEL`, `HIMMEL_WERTE`) |
| Projekte-Kapitel (Gasplanet/3D-Mod) entfällt – Technik gehört nicht der Allianz | – |

## Mond
Er kreist immer (in allen Kapiteln, kein Spawnen): Bahnebene enthält die Strahlachse Station → Planet, Radius 2,6 R, Kreuzung 2 400 km vor der
Station. Auf der Rückseite hinter dem Planeten klein und schnell, vor der Station groß und langsam (Profil ω(φ), Formeln im Kopf von `welt/mond.js`).
In Kapiteln mit Feuerplan (start, siegreich, bewerben) zielt die Station auf die Planetenmitte und löst genau dann aus, wenn der Mond in
8,2 s den Strahl kreuzt (Strahl ist 6,5 s nach dem Auslösen da). Die Schnittebene folgt dem echten Strahl; die Hälften driften mit 60 km/s auseinander.
Danach kommt ein neuer Mond von der Rückseite. In Kapiteln ohne Schuss fliegt der Mond unversehrt weiter. Feinwerte: `MOND` in `welt/mond.js`.
Abschalten: `?aus=mond` (nur Rauch: `?aus=rauch`).

### OFFEN – Mond: Proportionen stimmen nicht (08.10.2026, Auftraggeber kümmert sich in einem anderen Chat darum – hier NICHT anfassen)
Der Einbau (Orbit, Schnitt, Hälften, Rauch) funktioniert, aber die Größenverhältnisse zerstören die Illusion eines Riesenplaneten.
Zu klären ist das Zusammenspiel von: Kameraabstand (größter und kleinster je Kapitel) · gefühlte Planetengröße · Stationsgröße · Mondgröße · Mondgeschwindigkeit im Bild · Perspektive.
Aktuell Bühnenmaßstab (Mond 300 km Radius, Bahnradius 2,6 R, Kreuzung 2 400 km vor der Station, 210 km/s an der Kreuzung, Zeitprofil ω(φ) mit 14-fach schnellerer Rückseite) – das ist keine echte Äquatorialbahn und nie auf die Größenwirkung abgestimmt worden.
Gewünscht war: kleiner blauer Punkt hinter dem Planeten → wird größer, je näher er der Station kommt → fliegt durch den Strahl → wird zerteilt; Planet, Station und Strahl bleiben unverändert (nur der Mond wird eingesteckt).

## Laden (Stand 08.10.2026)
Reihenfolge strikt nacheinander, nichts blockiert den Hauptstrang (Ablauf im Kopf von `js/start.js`): Text → (parallel: Modell-Download) → Planet mit Himmel (schon beim Einschwingen sichtbar,
eingeblendet bei ruhiger Bildfolge) → Station (Texturen bildweise, Shader asynchron im Ziel des Bildes: `bild.kompiliere`) → Strahl/Hitze/Einschlag/Mond in einer Ablage vorübersetzt → besseres Modell.
Messen: `node werkzeug/seite/ladeprofil.mjs --dauer 22 --breite 2560 --hoehe 1440 --dsf 1.5 [--profil ORDNER]` (zweiter Lauf mit gleichem `--profil` = warmer Shader-Speicher = Wiederbesuch; `--cpu` zeigt, wohin die Hauptstrang-Zeit geht).
Gemessen (RTX 5080, 30 Mbit/s): Wiederbesuch Planet 1,9 s, Station 2,5 s, Mond 3,3 s, ohne ein Ruckeln ≥ 100 ms. Erster Besuch (kalter Shader-Speicher): Planet 1,9 s, Station 5 s, Mond 7 s; es bleiben ca. 1 s Ruckeln beim ersten Planetenaufbau
(Chrome übersetzt die Simulator-Shader synchron – in `fremd/gasplanet-kern.js` stehen `createComputePipeline`-Aufrufe ohne Async; das ginge nur im Quelltext des Simulators zu ändern).

## Milchstraße
Der Simulator würfelt die Lage des Bandes aus „Seed + Vorlage“ (hier „1Jupiter“) – das legte es 60° neben die Startansicht. Jetzt `HIMMEL = 'owners303'`
(am Bild gewählt; die Rechnung in `himmel.mjs`-Art liefert nur Anhaltspunkte, die Helligkeit schwankt je Schlüssel). Proben: `?himmel=…&breit=…&hell=…`.

## Prüfen (nur RTX 5080)
`node werkzeug/seite/pruefen.mjs --seite Owners --kapitel 0 --warte 1 --mond-vor 4.5 --serie 9 --takt 1000` → `werkzeug/seite/bilder/quer-collage.png`
(`--format hoch` fürs Handyformat; `werkzeug/seite/collage.mjs` baut Sammelbilder aus beliebigen PNG).

## Offen / zu klären
1. **Rauch ist ein Näherungs-Effekt** (Partikel). Der echte 3D-Rauch-Löser (Laserschnitt-Baustein im Fluid-Gas-Planet, `bausteine-todesstern/3-schnitt-und-einblendung`) ist nicht eingebunden – er bringt eigene Mond-/Strahl-Simulation mit.
2. Allianz-Wappen/Banner aus dem Spiel sind nicht eingebaut (Bilddateien liegen nicht vor).
3. Link-Vorschau (og:image) fehlt wie bei celestia2.
5. Hochformat (390×844) nach dem Umbau nur im Start-Kapitel stichprobenartig geprüft, nicht der Schnitt.

Quellen der Fakten: OGame-DE-Board „Neues Universum Celestia startet am 02.10.2026“; MMOFacts „OGame: Mega-Update zum 24-jährigen – Project Orion“.
