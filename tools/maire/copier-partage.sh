#!/bin/sh
# Copie dans functions/partage les fichiers du jeu dont le serveur a besoin (mêmes règles, mêmes mini-jeux que le navigateur)
set -e
cd "$(dirname "$0")/../.."
mkdir -p functions/partage
for f in reglages session tournoi-jeux tournoi-regles; do cp "public/maire/$f.js" "functions/partage/$f.js"; done
printf '{ "type": "commonjs" }\n' > functions/partage/package.json
