#!/usr/bin/env sh
# Baut aus index.html, styles.css und app.js eine einzelne HTML-Datei.
# Nützlich zum schnellen Teilen; für den Betrieb als PWA nicht nötig.
set -e
python3 - <<'PY'
h = open("index.html").read()
css = open("styles.css").read()
js  = open("app.js").read()
h = h.replace('<link rel="stylesheet" href="./styles.css">', "<style>\n" + css + "\n</style>")
h = h.replace('<script src="./app.js"></script>', "<script>\n" + js + "\n</script>")
for tag in ['<link rel="manifest" href="./manifest.webmanifest">',
            '<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">',
            '<link rel="icon" href="./icons/icon-192.png">']:
    h = h.replace(tag, "")
open("intervall-standalone.html", "w").write(h)
print("intervall-standalone.html gebaut")
PY
