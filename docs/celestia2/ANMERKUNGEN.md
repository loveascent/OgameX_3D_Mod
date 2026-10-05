# Gesammelte Anmerkungen des Auftraggebers (aus allen Celestia-Chats, 03.–05.10.2026)

Quelle: Chats „Celestia 3D mod“, „OGame Allianz 3D Mod Integration“, „Celestia2 Planet und Todesstern“,
„Death Star beam effects“, „Gas planet vulkane mit Laser Smoke“ (nur die Nachrichten des Auftraggebers, entdoppelt).
Status: ✅ erledigt (meist durch den 3D-Umbau) · 🟡 teilweise · ⬜ offen · ❓ Widerspruch, beim Auftraggeber klären

## Arbeitsweise (gilt immer)
- Token sparen: erst denken und planen, dann gezielt handeln; Bilder als Collage (4–8 auf einmal); keine Subagenten.
- Vorhandene, bewährte Lösungen nehmen statt raten oder neu erfinden („current“-Stand hat die richtigen Werte).
- Einfache Punkte zuerst abarbeiten, dann die schweren; To-do-Liste zeigen; nichts liegen lassen.
- Physikalische/3D-mathematische Korrektheit entscheidet, nicht „sieht von hier richtig aus“; aus mehreren Blickwinkeln prüfen.
- Nur auf der RTX 5080 testen; den PC nie auslasten (keine vielen Tabs, iGPU nie).
- Kleine Dateien, kein Riesen-Blob; jedes Teil einzeln änderbar.
- Regeln anderer Projekte gelten hier nicht.

## Inhalt / Wirkung
- ⬜ „WOW“ für Besucher, die nichts davon wissen.
- ⬜ Link-Vorschau (og:image / og:video) für Discord usw. – gab es für /celestia/, fehlt in /celestia2/.
- ⬜ **Gasplanet-Projekt nicht erwähnen** (Pre-Alpha, niemand soll davon wissen; Urheber anonym). Kapitel „Projekte“
  nennt es noch → entfernen. Keine „wir entwickeln“-Formulierungen: Technik ist allein Arbeit des Auftraggebers.
- ✅ Todesstern schießt auf den Planeten, nicht ins Schwarze.
- 🟡 Start = Endbild mit schießendem Todesstern; blauer Nebel/Milchstraße von Anfang an sichtbar (Band fehlt im Startbild).
- ✅ Seite startet immer am Anfang.

## Planet
- ⬜ Am Ende „3D Planeten testen“: Regler zum Planetenwechsel und Drehen, dazu Umschalter Partikel/Flüssigkeit.
- ⬜ Planeten: Jupiter (Start), Neptun, Zufallsplanet (statt Saturn); kein Heißer Jupiter. Seed des Zufallsplaneten anzeigen.
- ⬜ Planetenwechsel und Qualitätswechsel sofort, ohne Einschwingen; sofort sichtbar ist wichtiger als eingeschwungen.
- 🟡 Tempo/Drehung genau wie im Editor („current“) – prüfen, keine eigenen Zahlen.
- ❓ „Eiförmige“ Planeten (auch Neptun) als Fehler empfunden – prüfen, ob echte Abplattung oder Verzerrung (Seitenverhältnis).
- ✅ Planet nie schwarz.
- ✅ Hintergrund nicht beim Scrollen drehen (davon wird einem schlecht).
- ⬜ Später: Gesteinsplaneten, Monde.

## Todesstern / Strahl
- ✅ Immer auf die Planetenmitte ausgerichtet, Masseträgheit, Strahl aus der Mündung (gemessen), gleich bei jeder Fenstergröße.
- ❓ Größen: früher „Planet ~12 000 km, Station 4–8 km, Jäger 20–30 m, Verhältnisse verständlich, auch auf dem Handy“;
  am 05.10. Bühnenmaßstab (Variante A) gewählt. Klären, welche Verhältnisse gelten.
- ⬜ Idee: Todesstern schießt von links, damit das Größenverhältnis für den Besucher logisch ist.
- ⬜ Einschlag-Effekte waren auf dem Gasplaneten kaum sichtbar (Glut, Stoßwellen, Brandspur, Hitzeflimmern);
  „nimm festen Planeten“. Wichtigstes aus dem Video: aufsteigender 3D-Rauch → kommt aus dem Laser-Smoke-Projekt.
- ✅ Hitzeflimmern erlaubt („der Strahl krümmt den Raum“).

## Jäger (fehlen in celestia2)
- ⬜ Geschwader Leichter Jäger startet aus dem Todesstern (zuerst 1 Pixel groß), geskriptet (nicht ans Scrollen gebunden),
  mit Kondensstreifen aus der Düse: eleganter Bogen auf den Betrachter zu, abdrehen, auf der anderen Seite hinaus.
  Bekannte Pose: `OgameGrafikenHD/LJ/Transparent/grok-e4efc36e-….png`.

## Technik / Leistung
- 🟡 Kein Ruckeln, PC nie auslasten. Kamerafahrten jetzt ruhig; Qualitätswechsel ruckelt noch.
- ✅ Kamera: stabile Bahnen statt „besoffenem“ Schwenken; Station sinnvoll im Bild.
- 🟡 Vier Qualitätsstufen sichtbar (jetzt im Aufklappmenü; Start aus der Grafikkarte statt „Smartphone“).
- ⬜ Editor („3D Planeten testen“) im Vordergrund mit gewählter Stufe, dahinter nichts doppelt rendern.
- ⬜ Wechsel von verkleinertem Fenster auf Vollbild: früher Grafikfehler – in celestia2 prüfen.
- ✅ Durch 3D gelöst: springender Todesstern bei Fenstergröße, Laden in Scroll-Reihenfolge, Ruckeln bei „Zum Anfang/Ende“, Collage-Fehler.
