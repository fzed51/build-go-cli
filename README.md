# build-go-cli

CLI de **compilation Go multi-architectures** via Docker. Compile un fichier
`.go` isolé ou un package d'un module Go pour macOS, Linux et Windows (amd64 et
arm64) sans que Go soit installé sur la machine : seul Docker est requis.

Opérations couvertes :

- **build** — compiler pour une ou plusieurs architectures (commande par défaut)
- **targets** — lister les architectures compilables
- **doctor** — vérifier que Docker et l'image de compilation sont prêts
- **skill** — générer un skill Claude Code clé en main (`<nom>/SKILL.md`)
  décrivant l'outil pour qu'un agent l'invoque automatiquement

## Installation

```bash
cd build-go-cli
./scripts/install.sh
```

Sous Windows :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

Le script s'aligne sur la dernière release (tag le plus récent de `origin/main`)
quand il y en a une, installe les dépendances, compile le TypeScript, puis
installe le package en global via `npm pack` + `npm install -g`. Relancer le même
script suffit pour mettre à jour.

> L'ancien script Python `~/bin/build-go` porte le même nom. S'il est encore dans
> le `PATH` avant le préfixe npm, il masque cette version — le script
> d'installation le détecte et le signale.

## Usage

```bash
# Compile le package du dossier courant pour les cibles par défaut
build-go .

# Un package précis d'un module (le go.mod est trouvé automatiquement)
build-go ./cmd/outil

# Un fichier .go autonome, hors module
build-go outils/hello.go

# Choisir les architectures
build-go ./cmd/outil --arch linux-amd64
build-go ./cmd/outil --arch linux-amd64,darwin-arm64
build-go ./cmd/outil --arch all

# Nom du binaire et dossier de sortie
build-go ./cmd/outil --name monoutil --out ./dist

# Figer la version de Go
build-go ./cmd/outil --go-version 1.24

# Rapport JSON, pour un script ou un agent
build-go ./cmd/outil --json
```

Vérifier l'environnement :

```bash
build-go doctor
build-go targets
```

## Ce qui est compilé

La CLI choisit son mode selon la présence d'un `go.mod` :

| Situation | Ce qui est monté | Ce qui est compilé |
| --- | --- | --- |
| Un `go.mod` existe dans le dossier visé ou au-dessus | la **racine du module** | le **package entier** du dossier visé |
| Aucun `go.mod` nulle part | le dossier du fichier | le **seul fichier** indiqué |

Le mode module est celui qui permet aux programmes répartis sur plusieurs
fichiers de compiler, et aux layouts `projet/cmd/outil/main.go` de trouver leur
`go.mod`. Désigner un fichier d'un package multi-fichiers compile quand même
tout le package — un avertissement le rappelle.

Hors module, `go build` exige un fichier nommé : passer un dossier sans `go.mod`
produit une erreur qui propose le fichier à viser.

## Architectures

| Cible | GOOS | GOARCH | Par défaut |
| --- | --- | --- | --- |
| `darwin-arm64` | darwin | arm64 | oui |
| `darwin-amd64` | darwin | amd64 | oui |
| `linux-arm64` | linux | arm64 | non |
| `linux-amd64` | linux | amd64 | non |
| `windows-arm64` | windows | arm64 | non |
| `windows-amd64` | windows | amd64 | oui |

Les binaires sont nommés `<nom>-<cible>`, avec le suffixe `.exe` pour Windows.
Le nom vient du dossier du package (ou du fichier hors module) sauf si `--name`
l'impose.

## Notes

- **Sortie par défaut** : `build/` à la racine du module — et non dans le
  répertoire courant, pour que le même appel produise toujours les binaires au
  même endroit quel que soit l'endroit d'où on le lance. `--out` le change.
- **Compilation** : toujours `-trimpath` (binaire reproductible, sans chemins de
  la machine), `CGO_ENABLED=0` (binaire statique), et `-ldflags "-s -w"` qui
  retire les symboles de debug — environ 30 % de taille en moins. `--no-strip`
  les conserve.
- **Image Docker** : `golang:alpine` par défaut, soit la dernière version stable
  de Go. `--go-version 1.24` fige une version (`golang:1.24-alpine`), `--image`
  impose une référence complète.
- **Cache** : deux volumes Docker nommés (`build-go-cli-gomod`,
  `build-go-cli-gobuild`) conservent le cache des modules et de compilation entre
  deux appels. `--no-cache` les désactive. Pour repartir de zéro :
  `docker volume rm build-go-cli-gomod build-go-cli-gobuild`.
- **Source montée en lecture-écriture** : `go build` doit pouvoir compléter
  `go.sum` quand une dépendance y manque. Sans Go installé localement, personne
  ne pourrait le faire à sa place.
- **Sorties** : progression sur stderr, données sur stdout. `--json` produit donc
  un rapport parsable sans avoir à filtrer quoi que ce soit.
- **Code de sortie** : 0 si toutes les cibles ont compilé, 1 si au moins une a
  échoué. En `--json`, le champ `log` de chaque résultat contient la sortie du
  compilateur.
- **`DEBUG=1`** affiche la ligne `docker run` complète de chaque compilation.
- **Linux** : les binaires produits appartiennent à `root`, le conteneur
  s'exécutant sous cet utilisateur. Sans conséquence sur macOS, où Docker Desktop
  remappe les droits.

## Développement

```bash
npm run build      # tsc
npm run lint       # biome (npm run lint:fix pour corriger)
npm run test       # vitest
```
