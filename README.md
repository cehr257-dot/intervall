# Intervall

Ein Intervall-Timer für Lauf-Geh-Training, mit Analyse und Streckenkarte.

Kein Build-Schritt, keine Konten, keine externen Schriften. Reines HTML, CSS und
JavaScript, installierbar als PWA. Einzige Abhängigkeit ist Leaflet für die
Karte — fällt sie aus, zeichnet die App die Route als reine Grafik.

Schritt-für-Schritt-Anleitung zum Veröffentlichen: [GITHUB.md](GITHUB.md).

## Aufbau

Drei Bereiche, umschaltbar über die schwebende Leiste unten:

**Intervalle** — Timer mit Abschnittsleiste. Minuten laufen, Minuten gehen und
Runden werden untereinander eingetragen.

**Analyse** — eine Einheit je Ansicht, blätterbar über die Pfeile. Distanz mit
Höhenprofil, Pace mit Verlauf, darunter Zeit, Ø Pace, Puls und Zone.

**Karte** — die Route in Blau/Weiß. Während einer Einheit läuft sie live mit
und zeigt den aktuellen Standort als weißen Punkt; wischt man selbst über die
Karte, erscheint eine Zentrieren-Taste. Ohne laufende Aufzeichnung zeigt sie die
in der Analyse gewählte Strecke — beide Ansichten teilen sich die Auswahl.

## Gestaltung

Weiß, dunkelblaue Schrift, Helvetica. Eine Signalfarbe für Zeiger, aktive
Zustände und Graphen. Überschriften stehen links oben, das Zahnrad rechts auf
gleicher Höhe.

Die Schrift kommt vom Gerät. Auf iOS und macOS ist das Helvetica Neue, auf
Android und Windows greift der Stapel auf Arial beziehungsweise Liberation Sans
zurück.

## Streckenaufzeichnung

Die Route wird über `watchPosition` aufgezeichnet. Distanz per Haversine,
Höhengewinn aus den GPS-Höhenwerten mit einer Schwelle von einem Meter gegen
Rauschen, Pace geglättet über ein gleitendes Fenster. Die Karte nutzt
OpenStreetMap-Kacheln über Leaflet, per CSS-Filter auf einen Blauton gebracht.

**Grenze auf dem iPhone:** iOS beendet die Ortung, sobald der Bildschirm sperrt
oder die App in den Hintergrund geht. Eine installierte Web-App bekommt keinen
Hintergrundstandort — eine Plattformgrenze, kein Fehler der App. Deshalb
schaltet sich *Display anlassen* mit der Aufzeichnung automatisch ein.

**Apple Health ist nicht erreichbar.** HealthKit steht nur nativen iOS-Apps
offen; es gibt keine Web-Schnittstelle. Puls und Zone werden deshalb in der
Analyse von Hand eingetragen.

Jede Einheit lässt sich als **GPX** sichern und in Strava hochladen. Auf dem
iPhone öffnet sich dafür das Teilen-Menü.

## Lokal starten

Ein Server ist nötig, weil Service Worker über `file://` nicht laufen.

```bash
python3 -m http.server 8080
# http://localhost:8080
```

## Veröffentlichen

Die App ist statisch und läuft auf jedem Hoster.

**GitHub Pages**

```bash
git init
git add .
git commit -m "Intervall-Timer"
git branch -M main
git remote add origin git@github.com:<nutzer>/<repo>.git
git push -u origin main
```

Dann unter *Settings → Pages* als Quelle `main` und `/ (root)` wählen.

**Netlify mit GitHub verbunden** — der empfohlene Weg: Jeder Commit wird
automatisch veröffentlicht. Schritt für Schritt in [GITHUB.md](GITHUB.md).

HTTPS ist Pflicht — Service Worker, Wake Lock und die Installation als App
funktionieren sonst nicht. Alle drei Hoster liefern es mit.

## Auf dem Homescreen

- **iOS**: In Safari öffnen → Teilen → *Zum Home-Bildschirm*. Nur Safari kann
  das; andere Browser auf iOS bieten es nicht an.
- **Android**: Chrome bietet *App installieren* im Menü an.

Danach startet die App im Vollbild ohne Browserleiste und funktioniert offline.

## Speicherung

Eingaben und Verlauf bleiben auf dem Gerät. Der Adapter in `app.js` nimmt
`window.storage`, falls vorhanden (Vorschau in der Claude-Oberfläche), sonst
`localStorage`, sonst den Arbeitsspeicher. Es geht nichts an einen Server.

Ein Wechsel des Browsers oder das Löschen der Websitedaten entfernt den Verlauf.

## Dateien

```
index.html              Aufbau
styles.css              Gestaltung
app.js                  Timer, Audio-Planung, Speicherung
sw.js                   Service Worker, Offline-Betrieb
manifest.webmanifest    PWA-Metadaten
icons/                  App-Icons
netlify.toml            Netlify-Konfiguration und Cache-Regeln
GITHUB.md               Anleitung: GitHub, Netlify, Updates
build.sh                erzeugt eine Einzeldatei zum Teilen
```

## Kompatibilität

| Funktion | iOS Safari | Chrome Android | Desktop |
|---|---|---|---|
| Audio bei gesperrtem Display | ja | ja | ja |
| Wake Lock | ab iOS 16.4 | ja | ja |
| Vibration | nein | ja | teilweise |
| Installation | über Safari | ja | ja |

## Aktualisieren

`sw.js` fragt zuerst das Netz und nutzt den Cache nur bei Zeitüberschreitung
oder fehlendem Empfang. Eine neue Fassung ist damit beim nächsten Öffnen da,
ohne dass eine Versionsnummer hochgezählt werden muss.

Erkennt die App während einer laufenden Einheit ein Update, wartet sie bis zum
Stop, bevor sie neu lädt.

`netlify.toml` sorgt zusätzlich dafür, dass `sw.js`, `index.html` und das
Manifest nicht im Browser-Cache hängen bleiben.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
