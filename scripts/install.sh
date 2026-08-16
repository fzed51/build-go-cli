#!/usr/bin/env bash
# Installe ou met à jour build-go-cli en global via npm (macOS / Linux).
#
# Usage, depuis le clone du dépôt :
#   ./scripts/install.sh
#
# Le script bascule le clone sur la dernière release (tag le plus récent de
# origin/main) quand il y en a une, compile, puis installe le package en global
# via `npm pack` + `npm install -g`. Relancer le même script suffit pour mettre
# à jour.
set -euo pipefail

err() { echo "Erreur : $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

command -v git  >/dev/null || err "git est requis"
command -v node >/dev/null || err "Node.js ≥ 18 est requis"
command -v npm  >/dev/null || err "npm est requis"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || err "Node.js ≥ 18 requis (trouvé : $(node -v))"

cd "$ROOT_DIR"
[ -f package.json ] || err "package.json introuvable — lancer ce script depuis le clone build-go-cli"

# Tant que le dépôt n'a ni remote ni tag de release, on installe l'état courant
# du clone. Dès qu'une release existe, on s'aligne dessus comme les autres CLI.
echo "→ Récupération de la dernière release"
if git remote get-url origin >/dev/null 2>&1; then
  git fetch --tags origin main
  if TAG="$(git describe --tags --abbrev=0 origin/main 2>/dev/null)"; then
    echo "  version : $TAG"
    git checkout --quiet "$TAG"
  else
    echo "  aucun tag de release — installation de l'état courant du clone"
  fi
else
  echo "  aucun remote 'origin' — installation de l'état courant du clone"
fi

echo "→ Installation des dépendances et compilation"
npm install

echo "→ Installation globale"
TGZ="$(npm pack --silent)"
npm install -g "$TGZ"
rm -f "$TGZ"

echo
echo "✓ build-go $(build-go --version) installé"

# L'ancien script Python ~/bin/build-go masque la commande npm si ~/bin passe
# avant le préfixe npm dans le PATH.
BUILD_GO_BIN="$(command -v build-go || true)"
NPM_BIN="$(npm prefix -g)/bin/build-go"
if [ -n "$BUILD_GO_BIN" ] && [ "$BUILD_GO_BIN" != "$NPM_BIN" ]; then
  echo
  echo "⚠ 'build-go' pointe sur $BUILD_GO_BIN au lieu de $NPM_BIN :"
  echo "  l'ancien script build-go est probablement encore dans le PATH."
  echo "  Retire-le (ou renomme-le) pour utiliser cette version."
fi
