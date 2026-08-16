# Einrichten und aktualisieren

GitHub hält den Code, Netlify veröffentlicht ihn. Jeder Commit auf GitHub geht
innerhalb einer Minute automatisch live — und die App auf deinem iPhone zieht
die neue Fassung von selbst nach.

Einmal einrichten: etwa fünfzehn Minuten. Danach ist ein Update eine Sache von
zwei Minuten.

---

## Teil 1 — Repository anlegen

1. Auf [github.com](https://github.com) einloggen
2. Oben rechts **+** → **New repository**
3. Ausfüllen:
   - **Repository name**: `intervall`
   - **Public** auswählen
   - **Add a README file**: Haken **weglassen**
4. **Create repository**

> **Warum Public?** Einige Komfortfunktionen kosten bei privaten Repositories
> Geld. Für Netlify wäre privat egal, aber es liegen ohnehin keine Daten und
> keine Zugänge im Code.

> **Warum kein README-Haken?** Ein vorbelegtes Repository ist nicht leer, und
> dann verschwindet der Upload-Link aus Teil 2.

---

## Teil 2 — Dateien hochladen

ZIP entpacken und den Ordner `intervall` **öffnen**. Du arbeitest mit seinem
*Inhalt*.

Auf der Repository-Seite den Link *"uploading an existing file"* anklicken, oder
direkt aufrufen: `https://github.com/DEINNAME/intervall/upload/main`

Alles im Ordner markieren (`Cmd + A`) und ins Browserfenster ziehen:

```
index.html   styles.css   app.js   sw.js
manifest.webmanifest   netlify.toml
README.md   GITHUB.md   LICENSE   build.sh
icons/
```

**Zieh nicht den Ordner `intervall` selbst hinein.** Sonst läge alles eine Ebene
zu tief und die Seite bliebe leer.

Kontrolle danach: In der Dateiliste muss `index.html` direkt oben stehen — nicht
`intervall/index.html`.

Unten **Commit changes**.

> `.gitignore` blendet der Finder aus, weil der Name mit einem Punkt beginnt.
> Mit `Cmd + Shift + .` wird sie sichtbar. Sie ist optional.

---

## Teil 3 — Netlify mit GitHub verbinden

1. Auf [netlify.com](https://netlify.com) mit **GitHub** anmelden
2. **Add new site** → **Import an existing project**
3. **GitHub** wählen, Zugriff bestätigen
4. Repository `intervall` auswählen
5. Die Einstellungen so lassen, wie sie sind:
   - **Branch**: `main`
   - **Build command**: leer
   - **Publish directory**: `.`

   Die Datei `netlify.toml` im Repo setzt das ohnehin.
6. **Deploy**

Nach etwa einer Minute bekommst du eine Adresse wie
`luminous-brioche-4a2c91.netlify.app`.

Unter **Site configuration → Change site name** kannst du sie umbenennen, etwa
in `constantin-intervall`. HTTPS richtet Netlify selbst ein.

---

## Teil 4 — Aufs iPhone

Adresse **in Safari** öffnen — nur Safari kann das auf iOS, Chrome und Firefox
bieten es dort nicht an.

Teilen-Symbol → **Zum Home-Bildschirm** → **Hinzufügen**.

Die App startet ab jetzt im Vollbild ohne Browserleiste und funktioniert offline.

---

## Der Update-Ablauf

So sieht eine Änderung von nun an aus:

1. Du beschreibst mir, was anders werden soll
2. Ich gebe dir die geänderten Dateien
3. Du lädst sie ins Repository
4. Netlify veröffentlicht automatisch
5. Beim nächsten Öffnen holt sich die App die neue Fassung

**Ich kann nicht selbst pushen.** Ich habe keinen Zugang zu deinem Konto — das
ist Absicht. Schritt 3 bleibt bei dir. Dafür gibt es drei Wege, vom einfachsten
zum bequemsten.

### Weg A — Im Browser bearbeiten

Für kleine Änderungen an einer Datei.

Datei im Repository anklicken → Stift-Symbol oben rechts → Inhalt ersetzen →
unten **Commit changes**.

### Weg B — Dateien ersetzen

Für mehrere geänderte Dateien auf einmal.

Im Repository **Add file** → **Upload files** → die neuen Dateien hineinziehen →
**Commit changes**. Gleichnamige Dateien werden überschrieben.

### Weg C — GitHub Desktop

Der bequemste Weg, wenn du öfter änderst. Kein Terminal nötig.

1. [desktop.github.com](https://desktop.github.com) installieren, mit dem Konto
   anmelden
2. **Clone a repository** → `intervall` → Ordner auf dem Mac wählen
3. Bei jedem Update: meine Dateien in diesen Ordner kopieren und überschreiben
4. In GitHub Desktop siehst du links, was sich geändert hat — Zeile für Zeile
5. Unten links eine Notiz eintragen, **Commit to main**, dann oben **Push origin**

Gleiches Ergebnis wie bei A und B, nur ohne Browser — und du siehst vorher
genau, was sich ändert.

---

## Was mit dem Cache passiert

Die häufigste Frustration bei installierten Web-Apps: Man ändert etwas, und das
Handy zeigt weiter die alte Fassung. Dagegen sind drei Dinge eingebaut.

**Der Service Worker fragt zuerst das Netz.** `sw.js` holt jede Datei erst vom
Server und greift nur bei Zeitüberschreitung oder fehlendem Empfang auf den
Cache zurück. Du musst keine Versionsnummer mehr hochzählen.

**`netlify.toml` verbietet das Zwischenspeichern** von `sw.js`, `index.html` und
dem Manifest. Icons dürfen eine Woche liegen bleiben.

**Die App lädt sich selbst neu, aber nicht mitten im Training.** Erkennt sie
eine neue Fassung während einer laufenden Einheit, erscheint der Hinweis
*"Update bereit — nach der Einheit"*, und der Neustart passiert erst nach dem
Stop.

Sollte dennoch einmal eine alte Fassung kleben: App vom Homescreen löschen, in
*Einstellungen → Safari → Verlauf und Websitedaten löschen* aufräumen, Adresse
neu öffnen und wieder hinzufügen. Der Verlauf der Einheiten geht dabei
verloren, er liegt lokal.

---

## Wenn etwas nicht klappt

**Netlify zeigt eine weiße Seite oder 404**
In der Dateiliste auf GitHub steht ein Ordner `intervall`. Du hast den Ordner
statt seines Inhalts hochgeladen. In Netlify unter *Site configuration → Build
& deploy → Publish directory* auf `intervall` stellen — oder auf GitHub
aufräumen.

**Die Seite lädt, sieht aber unformatiert aus**
`styles.css` oder `app.js` fehlt. Über *Add file → Upload files* nachreichen.

**Deploy schlägt fehl**
Im Netlify-Dashboard unter **Deploys** den fehlgeschlagenen Eintrag anklicken;
das Protokoll nennt die Ursache. Bei einem Projekt ohne Build-Schritt liegt es
fast immer am Publish directory.

**Kein Ton beim ersten Start**
iOS erlaubt Audio erst nach einer Berührung. Der erste Tipp auf *Starten*
schaltet es frei; beim allerersten Mal kann der Startton ausbleiben, die
Wechseltöne danach kommen.

**„Zum Home-Bildschirm" fehlt im Teilen-Menü**
Du bist nicht in Safari.

**Der Verlauf ist leer**
Er liegt im lokalen Browserspeicher des Geräts. Anderer Browser, anderes Gerät
oder gelöschte Websitedaten bedeuten leerer Verlauf. Es gibt keinen Server.

---

## Begriffe

| Begriff | Bedeutung |
|---|---|
| **Repository** | Projektordner auf GitHub, samt Änderungsverlauf |
| **Commit** | Ein gespeicherter Änderungsstand mit Notiz |
| **Push** | Commits vom Rechner zu GitHub übertragen |
| **Branch** | Entwicklungsstrang; `main` ist der Hauptstrang |
| **Deploy** | Veröffentlichung einer Fassung auf dem Server |
| **PWA** | Web-App, die sich wie eine native App installieren lässt |
| **Service Worker** | Skript zwischen App und Netz; ermöglicht Offline-Betrieb |
