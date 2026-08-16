# build-go-cli

CLI Node.js/TypeScript de compilation Go multi-architectures, déléguée à un
conteneur Docker `golang`. Portage du script Python `~/bin/build-go`.

## Règle impérative : garder la documentation synchronisée

À **chaque** modification du comportement de la CLI — ajout/suppression/renommage
d'une commande, d'un argument ou d'une option, changement d'une valeur par
défaut, d'une architecture cible ou d'une règle d'usage — il faut, dans le même
changement :

1. **Vérifier la commande `skill`** ([src/skill.ts](src/skill.ts)).
   Elle produit le skill Claude Code clé en main (`<nom>/SKILL.md`) lu par les
   agents IA. La partie commandes/arguments/options est générée par
   introspection de commander et se met à jour seule, **mais** les textes
   statiques (`SKILL_DESCRIPTION`, `TOOL_PURPOSE`, `INVOCATION_NOTES`,
   `USAGE_RULES`, exemples dans `EXAMPLES`) sont écrits à la main : les relire
   et les corriger si le changement les concerne. La `description` du
   frontmatter pilote le déclenchement du skill : la garder insistante et à
   jour. Le nom du skill vit dans la constante exportée `SKILL_NAME` (elle
   pilote à la fois le `name` du frontmatter et le nom du dossier feuille).
2. **Mettre à jour le [README.md](README.md)** en conséquence : liste des
   opérations, exemples de la section *Usage*, tableau des architectures et
   *Notes*.

`skill` et le README sont les deux faces — agent et humain — de la même
documentation : ils ne doivent jamais diverger du code.

## Vérifications avant de conclure

```bash
npm run build      # tsc — doit passer sans erreur
npm run lint       # biome — ou `npm run lint:fix` pour corriger
npm run test       # vitest
```

Un changement touchant à l'exécution réelle (arguments Docker, montages, modes
de résolution) se vérifie en plus sur un vrai projet Go, Docker démarré : les
tests couvrent la construction des arguments, pas leur effet.

## Conventions

- Scripts d'outillage (installation, hooks) : **JavaScript/Node.js** ou shell,
  jamais Python — c'est ce dont ce projet est le portage.
- **Aucun appel shell.** Toutes les commandes passent par `spawnSync(cmd, args)`
  sans `shell: true` ([src/docker.ts](src/docker.ts)) : les chemins contenant une
  espace ou un guillemet traversent alors sans échappement. Le script Python
  d'origine assemblait sa commande en f-string, ce qui cassait sur ces chemins ;
  ne pas réintroduire ce motif.
- **Contrôle de Docker.** Toujours `docker info` pour savoir si le daemon
  répond ; `docker --version` est purement client et réussit daemon éteint.
- **stdout porte la donnée, stderr la progression.** Le logger
  ([src/logger.ts](src/logger.ts)) écrit exclusivement sur stderr, ce qui garde
  la sortie `--json` parsable sans filtrage.
- **Fonctions pures pour ce qui est testable.** `buildDockerArgs()`,
  `resolveTargets()`, `outputFileName()` et `resolveSource()` ne font aucun
  effet de bord : ce sont elles que couvrent les tests, l'exécution réelle
  n'étant qu'un `spawnSync` de leur résultat.
- Résolution de la source centralisée dans [src/source.ts](src/source.ts) :
  détection du `go.mod` par remontée d'arborescence, choix entre le mode module
  (montage de la racine, compilation du package) et le mode fichier isolé.
- Catalogue des architectures dans [src/targets.ts](src/targets.ts) : une cible
  ajoutée là devient utilisable partout, y compris dans le skill généré.
