# build-go-cli

CLI de **compilation Go multi-architectures** via Docker. Elle compile un projet
Go ou un simple fichier `.go` pour macOS, Linux et Windows (amd64 et arm64)
**sans que Go soit installé sur la machine** : la compilation se déroule dans un
conteneur `golang`, seul Docker est requis.

```bash
build-go ./cmd/monoutil
```

…et les binaires des trois plateformes apparaissent dans `build/`.

## Sommaire

- [Prérequis](#prérequis)
- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [Compiler un projet Go](#compiler-un-projet-go)
- [Compiler un fichier `.go` isolé](#compiler-un-fichier-go-isolé)
- [Choisir les architectures](#choisir-les-architectures)
- [Où atterrissent les binaires](#où-atterrissent-les-binaires)
- [Toutes les options](#toutes-les-options)
- [Sortie JSON](#sortie-json)
- [Les autres commandes](#les-autres-commandes)
- [Comportement](#comportement)
- [Dépannage](#dépannage)
- [Développement](#développement)

## Prérequis

- **Docker**, installé **et démarré**. C'est lui qui fait la compilation.
- **Node.js ≥ 18** et **npm**, pour installer la CLI.
- Go n'est **pas** nécessaire.

Un doute ? La commande `doctor` répond :

```console
$ build-go doctor
✓ Docker est installé
✓ Le daemon Docker répond
✓ Image golang:alpine présente
ℹ Volumes de cache : build-go-cli-gomod, build-go-cli-gobuild
```

## Installation

```bash
git clone https://github.com/fzed51/build-go-cli.git
cd build-go-cli
./scripts/install.sh
```

Sous Windows :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

Le script s'aligne sur la dernière release (tag le plus récent de `origin/main`)
quand il y en a une, installe les dépendances, compile le TypeScript, puis
installe le package en global via `npm pack` + `npm install -g`. **Relancer le
même script suffit pour mettre à jour.**

> Si une autre commande nommée `build-go` est déjà dans le `PATH` avant le
> préfixe npm, elle masque celle-ci. Le script d'installation détecte le cas et
> indique quel fichier répond réellement.

## Démarrage rapide

Soit un projet Go tout à fait ordinaire :

```
demo/
├── go.mod
└── cmd/
    └── salut/
        ├── main.go
        └── salut.go
```

Une seule commande, lancée depuis `demo/` :

```console
$ build-go ./cmd/salut
ℹ Source : package /src/cmd/salut du module /Users/moi/demo
→ Compilation darwin-arm64 (darwin/arm64)
✓ darwin-arm64 → /Users/moi/demo/build/salut-darwin-arm64
→ Compilation darwin-amd64 (darwin/amd64)
✓ darwin-amd64 → /Users/moi/demo/build/salut-darwin-amd64
→ Compilation windows-amd64 (windows/amd64)
✓ windows-amd64 → /Users/moi/demo/build/salut-windows-amd64.exe

  ✓ darwin-arm64   salut-darwin-arm64 (1.6 Mio)
  ✓ darwin-amd64   salut-darwin-amd64 (1.6 Mio)
  ✓ windows-amd64  salut-windows-amd64.exe (1.6 Mio)

  Sortie : /Users/moi/demo/build
```

Résultat :

```
demo/
├── build/
│   ├── salut-darwin-amd64
│   ├── salut-darwin-arm64
│   └── salut-windows-amd64.exe
├── go.mod
└── cmd/salut/…
```

Rien d'autre à configurer : ni fichier de config, ni variable d'environnement.

## Compiler un projet Go

C'est le cas courant, dès qu'un `go.mod` existe. **L'argument est le dossier du
package à compiler** — celui qui contient le `package main` — et non la racine
du projet :

```bash
build-go ./cmd/monoutil     # un projet en layout cmd/
build-go .                  # un projet à plat, main.go à la racine
build-go ~/dev/monprojet    # depuis n'importe où, en chemin absolu
```

Le `go.mod` est cherché **en remontant l'arborescence** depuis le dossier visé.
Peu importe donc à quelle profondeur se trouve le package : la racine du module
est montée dans le conteneur, et le package entier est compilé — tous ses
fichiers, pas seulement `main.go`.

C'est ce qui permet aux programmes répartis sur plusieurs fichiers de compiler,
et aux dépendances externes d'être résolues normalement.

> Désigner **un fichier** d'un package multi-fichiers (`build-go
> ./cmd/salut/main.go`) compile quand même **tout le package** : c'est la seule
> chose qui ait un sens. Un avertissement le rappelle.

## Compiler un fichier `.go` isolé

Pour un script Go autonome, hors de tout module, il suffit de le nommer :

```bash
build-go hello.go
build-go outils/convertisseur.go
```

Seul ce fichier est compilé. Ce mode ne s'active que s'il n'existe **aucun**
`go.mod`, ni dans le dossier ni au-dessus.

Hors module, `go build` exige un fichier nommé. Passer un dossier dépourvu de
`go.mod` échoue donc, avec la marche à suivre :

```console
$ build-go .
✗ Aucun go.mod trouvé au-dessus de /Users/moi/essais.
Hors module, il faut désigner un fichier .go précis (ex. hello.go).
Sinon, initialise le module : go mod init <nom>
```

### En résumé

| Situation | Ce qui est monté | Ce qui est compilé |
| --- | --- | --- |
| Un `go.mod` existe dans le dossier visé **ou au-dessus** | la **racine du module** | le **package entier** du dossier visé |
| Aucun `go.mod` nulle part | le dossier du fichier | le **seul fichier** indiqué |

## Choisir les architectures

Par défaut, trois cibles sont produites : `darwin-arm64`, `darwin-amd64` et
`windows-amd64`. `--arch` (ou `-a`) impose la liste :

```bash
build-go ./cmd/monoutil --arch linux-amd64
build-go ./cmd/monoutil --arch linux-amd64,darwin-arm64
build-go ./cmd/monoutil --arch all          # les six cibles
```

| Cible | GOOS | GOARCH | Par défaut |
| --- | --- | --- | --- |
| `darwin-arm64` | darwin | arm64 | oui |
| `darwin-amd64` | darwin | amd64 | oui |
| `linux-arm64` | linux | arm64 | non |
| `linux-amd64` | linux | amd64 | non |
| `windows-arm64` | windows | arm64 | non |
| `windows-amd64` | windows | amd64 | oui |

`build-go targets` affiche cette liste à tout moment.

## Où atterrissent les binaires

Par défaut dans **`build/` à la racine du module** — et non dans le répertoire
courant, pour que le même appel produise toujours les binaires au même endroit
quel que soit l'endroit d'où on le lance. Hors module, c'est `build/` à côté du
fichier.

Chaque binaire est nommé **`<nom>-<cible>`**, suffixé `.exe` pour Windows. Le
`<nom>` vient du dossier du package (ou du nom du fichier hors module).

Les deux se changent :

```bash
build-go ./cmd/monoutil --out ./dist        # dossier de sortie
build-go ./cmd/monoutil --name monoutil     # nom du binaire
```

## Toutes les options

```
build-go [build] [source] [options]
```

`source` est le **dossier contenant le `package main`** (ex. `./cmd/outil`), un
**fichier `.go` autonome** hors module, ou rien — le répertoire courant. `build`
est la commande par défaut : elle peut être omise.

| Option | Effet |
| --- | --- |
| `-a, --arch <liste>` | Cibles séparées par une virgule, ou `all`. Défaut : `darwin-arm64,darwin-amd64,windows-amd64` |
| `-o, --out <dir>` | Dossier de sortie. Défaut : `build/` à la racine du module |
| `-n, --name <nom>` | Nom du binaire. Défaut : nom du package ou du fichier |
| `--go-version <version>` | Version de Go, ex. `1.24`. Défaut : dernière stable |
| `--image <ref>` | Image Docker complète. Ignore `--go-version` |
| `--no-strip` | Conserve les symboles de debug (binaire ~30 % plus gros) |
| `--no-cache` | N'utilise pas les volumes de cache Go |
| `--json` | Émet le rapport JSON sur stdout, et rien d'autre |
| `-V, --version` | Version de la CLI |
| `-h, --help` | Aide (`build-go help <commande>` pour une commande) |

## Sortie JSON

`--json` destine la sortie à un script ou à un agent : stdout ne porte alors que
le rapport, toute la progression partant sur stderr.

```console
$ build-go ./cmd/salut --arch linux-amd64 --json
{
  "ok": true,
  "source": "/Users/moi/demo/cmd/salut",
  "moduleRoot": "/Users/moi/demo",
  "image": "golang:alpine",
  "outputDir": "/Users/moi/demo/build",
  "binaryName": "salut",
  "warnings": [],
  "results": [
    {
      "target": "linux-amd64",
      "goos": "linux",
      "goarch": "amd64",
      "ok": true,
      "file": "salut-linux-amd64",
      "path": "/Users/moi/demo/build/salut-linux-amd64",
      "bytes": 1585314,
      "log": ""
    }
  ]
}
```

En cas d'échec, `ok` passe à `false` et le champ `log` de la cible fautive
contient la sortie du compilateur.

## Les autres commandes

| Commande | Rôle |
| --- | --- |
| `build-go build [source]` | Compiler. Commande par défaut, `build` peut être omis |
| `build-go targets` | Lister les architectures compilables |
| `build-go doctor` | Vérifier que Docker et l'image de compilation sont prêts |
| `build-go skill -o <DIR>` | Générer un skill Claude Code clé en main (`<DIR>/build-go-cli/SKILL.md`) décrivant l'outil, pour qu'un agent l'invoque tout seul |

## Comportement

- **Compilation** : toujours `-trimpath` (binaire reproductible, sans les
  chemins de la machine), `CGO_ENABLED=0` (binaire statique), et
  `-ldflags "-s -w"` qui retire les symboles de debug — environ 30 % de taille
  en moins. `--no-strip` les conserve.
- **Image Docker** : `golang:alpine` par défaut, soit la dernière version stable
  de Go. `--go-version 1.24` fige une version (`golang:1.24-alpine`), `--image`
  impose une référence complète.
- **Cache** : deux volumes Docker nommés (`build-go-cli-gomod`,
  `build-go-cli-gobuild`) conservent le cache des modules et de compilation
  entre deux appels — la deuxième compilation d'un même projet prend une
  fraction de seconde. `--no-cache` les désactive. Pour repartir de zéro :
  `docker volume rm build-go-cli-gomod build-go-cli-gobuild`.
- **Source montée en lecture-écriture** : `go build` doit pouvoir compléter
  `go.sum` quand une dépendance y manque. Sans Go installé localement, personne
  ne pourrait le faire à sa place.
- **Sorties** : progression sur stderr, données sur stdout. `--json` produit
  donc un rapport parsable sans avoir à filtrer quoi que ce soit.
- **Code de sortie** : `0` si toutes les cibles ont compilé, `1` si au moins une
  a échoué — ou si la source n'a pas pu être résolue.
- **`DEBUG=1`** affiche la ligne `docker run` complète de chaque compilation.
- **Linux** : les binaires produits appartiennent à `root`, le conteneur
  s'exécutant sous cet utilisateur. Sans conséquence sur macOS, où Docker
  Desktop remappe les droits.

## Dépannage

| Symptôme | Cause probable |
| --- | --- |
| `Le daemon Docker ne répond pas` | Docker n'est pas démarré. Lancer Docker Desktop, puis `build-go doctor` |
| `Aucun go.mod trouvé au-dessus de …` | Dossier hors module : viser un fichier `.go` précis, ou faire `go mod init <nom>` |
| Le premier build est très long | L'image `golang:alpine` est téléchargée (237 Mo sur disque). C'est annoncé par `Téléchargement de l'image …`, et cela n'arrive qu'une fois |
| Erreurs de compilation Go | Elles viennent du compilateur et s'affichent telles quelles. En `--json`, elles sont dans le champ `log` |
| `build-go` lance autre chose que cette CLI | Une commande homonyme est plus tôt dans le `PATH`. `command -v build-go` indique laquelle répond |
| Cache suspect, build incohérent | `build-go … --no-cache`, ou `docker volume rm build-go-cli-gomod build-go-cli-gobuild` |

## Développement

```bash
npm run build      # tsc
npm run lint       # biome (npm run lint:fix pour corriger)
npm run test       # vitest
```
