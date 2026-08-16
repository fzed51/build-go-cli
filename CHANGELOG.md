# Changelog

Toutes les évolutions notables de ce projet sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et le
versionnage respecte [SemVer](https://semver.org/lang/fr/).

## [0.1.0] — 2026-08-16

Première version. Portage TypeScript du script Python `build-go`, qui compilait
un programme Go pour plusieurs architectures via un conteneur Docker.

### Ajouté

- Commande `build` : compile le `package main` d'un module Go, ou un fichier
  `.go` autonome hors module, pour six architectures — macOS, Linux et Windows
  en amd64 et arm64. Trois sont produites par défaut (`darwin-arm64`,
  `darwin-amd64`, `windows-amd64`).
- Options de `build` : `--arch` (liste ou `all`), `--out`, `--name`,
  `--go-version`, `--image`, `--no-strip`, `--no-cache` et `--json`. Le script
  d'origine portait ce paramétrage en dur, sans jamais l'exposer.
- Commande `targets` : liste les architectures compilables.
- Commande `doctor` : vérifie Docker, l'état du daemon, la présence de l'image
  et des volumes de cache. Rend 1 si le daemon ne répond pas.
- Commande `skill` : génère un skill Claude Code clé en main
  (`<DIR>/build-go-cli/SKILL.md`) décrivant l'outil, pour qu'un agent
  l'invoque de lui-même. La partie commandes, arguments et options est produite
  par introspection de la CLI.
- Rapport JSON (`--json`) sur stdout, toute la progression restant sur stderr :
  la sortie est parsable sans filtrage.
- Volumes de cache Docker nommés (`build-go-cli-gomod`, `build-go-cli-gobuild`)
  conservant les caches de modules et de compilation d'un appel à l'autre.
- Compilation avec `-trimpath` et `CGO_ENABLED=0` : binaire statique et
  reproductible, sans les chemins de la machine.
- Scripts d'installation `scripts/install.sh` et `scripts/install.ps1`
  (`npm pack` + `npm install -g`), qui s'alignent sur la dernière release.

### Corrigé

Les cinq défauts du script Python d'origine :

- **Docker jugé prêt à tort** : `docker --version` réussit daemon éteint,
  puisqu'il n'interroge que le client. La vérification passe par `docker info`.
- **Un seul fichier compilé** : `go build fichier.go` ignorait les autres
  fichiers du package. La CLI compile le package entier.
- **`go.mod` dans un dossier parent** : la compilation était impossible. La
  racine du module est trouvée par remontée d'arborescence, montée dans le
  conteneur, et le répertoire de travail pointe sur le sous-dossier visé.
- **Chemins avec espace ou guillemet** : la commande assemblée en f-string avec
  `shell=True` cassait dessus. Tout passe par `spawnSync(cmd, args)` sans shell.
- **Téléchargement silencieux** : `capture_output=True` masquait le pull de
  l'image et perdait la sortie du compilateur. Le pull est annoncé, et la
  sortie Docker est héritée.

### Modifié

- Image de compilation : `golang:alpine` — la dernière version stable de Go — en
  remplacement de la version figée, arrivée en fin de vie. `--go-version` fige
  une version au besoin.

[0.1.0]: https://github.com/fzed51/build-go-cli/releases/tag/v0.1.0
