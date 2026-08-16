import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Command } from "commander";

interface CommanderOption {
  flags: string;
  description: string;
  mandatory: boolean;
  defaultValue?: unknown;
}

interface CommanderArgument {
  name(): string;
  description: string;
  required: boolean;
  variadic: boolean;
}

type IntrospectableCommand = Command & {
  options: CommanderOption[];
  registeredArguments: CommanderArgument[];
};

/**
 * Nom du skill généré. C'est la SEULE source de vérité : il pilote à la fois
 * le `name` du frontmatter et le nom du dossier feuille (`<DIR>/<SKILL_NAME>/`).
 * Un skill Claude Code se résout par son dossier, donc le dossier et ce `name`
 * doivent toujours être identiques.
 */
export const SKILL_NAME = "build-go-cli";

/** Commandes exclues du catalogue généré (ne doivent pas s'auto-documenter). */
const EXCLUDED = new Set(["help", "skill"]);

/**
 * Description du frontmatter : c'est le mécanisme de DÉCLENCHEMENT du skill.
 * Volontairement insistante — dit À LA FOIS ce que fait l'outil ET quand
 * l'invoquer, en listant les verbes métier et les cas implicites (un simple
 * fichier .go fourni sans nommer l'outil).
 *
 * Chaque verbe reste collé à Go : « construire » ou « packager » seuls
 * déclenchaient sur un `cargo build` ou un packaging Electron. La frontière
 * finale écarte les quatre confusions plausibles — autre langage, image
 * Docker, `go run`, `go test` — sur le modèle des autres skills maison.
 */
const SKILL_DESCRIPTION =
  "Compile du code Go en binaires pour macOS, Linux et Windows (amd64 et " +
  "arm64) dans un conteneur Docker `golang`, sans que Go soit installé sur " +
  "la machine, grâce à la CLI `build-go`. À UTILISER DÈS QUE l'utilisateur " +
  "veut compiler un programme Go, en obtenir un exécutable ou un binaire, le " +
  "cross-compiler pour une autre plateforme, récupérer un `.exe` Windows ou " +
  "un binaire Linux / macOS / Apple Silicon / Raspberry Pi, préparer les " +
  "binaires d'une release Go, savoir quelles architectures sont compilables " +
  "(`build-go targets`), ou diagnostiquer un échec de compilation Go et " +
  "l'état de Docker (`build-go doctor`). DÉCLENCHE AUSSI ce skill quand " +
  "l'utilisateur fournit juste un fichier `.go`, un `go.mod` ou un dossier " +
  "de projet Go et dit « tu peux me le compiler ? », « fais-moi un " +
  "binaire », « il me faut la version Windows », « est-ce que ça compile ? », " +
  "« je n'ai pas Go installé sur cette machine », sans nommer l'outil ni " +
  "Docker. Verbes déclencheurs, toujours appliqués à du code Go : compiler, " +
  "builder, cross-compiler, produire un binaire, générer un exécutable. " +
  "Frontière : ce skill ne fait QUE produire des binaires Go. Il ne compile " +
  "pas un autre langage (Rust, C, TypeScript…), ne construit pas d'image " +
  "Docker (`docker build`, Dockerfile), n'exécute pas (`go run`), ne teste " +
  "pas (`go test`) et ne sert pas à lire, écrire ou corriger du code Go sans " +
  "en produire de binaire.";

const TOOL_PURPOSE =
  "CLI de compilation Go multi-architectures. Compile le package `main` d'un " +
  "module Go — ou un fichier `.go` autonome hors module — pour macOS, Linux " +
  "et Windows (amd64 et arm64), en déléguant la compilation à l'image Docker " +
  "officielle `golang:alpine`. La machine hôte n'a donc besoin d'aucune " +
  "installation de Go — seulement de Docker.";

const INVOCATION_NOTES = [
  "Invocation par le shell : `build-go [commande] [options]`. `build` est la " +
    "commande par défaut : `build-go ./cmd/outil` équivaut à " +
    "`build-go build ./cmd/outil`.",
  "Aucune configuration, aucun secret, aucune variable d'environnement " +
    "requise. Le seul prérequis est un daemon Docker démarré, capable de " +
    "monter le dossier des sources.",
  "Vérifier l'état de Docker avec `build-go doctor` avant de conclure à une " +
    "erreur de code : un daemon éteint fait échouer toutes les cibles.",
  "Sortie : messages de progression sur stderr, données sur stdout. L'option " +
    "`--json` sur `build` et `targets` produit un rapport JSON sur stdout et " +
    "rien d'autre — c'est la forme à utiliser pour lire le résultat par " +
    "programme.",
  "Rapport JSON de `build` : `{ ok, source, moduleRoot, image, outputDir, " +
    "binaryName, warnings, results }`, chaque entrée de `results` portant " +
    "`{ target, goos, goarch, ok, file, path, bytes, log }`. Les " +
    "avertissements de résolution de la source ne sont pas affichés en mode " +
    "`--json` : ils ne vivent que dans `warnings`.",
  "Codes de sortie : `build` rend 0 si toutes les cibles ont compilé, 1 si " +
    "au moins une a échoué ; `doctor` rend 1 quand le daemon Docker ne " +
    "répond pas. En `--json`, le détail d'un échec est dans le champ `log` " +
    "du résultat concerné.",
  "`DEBUG=1` affiche la ligne `docker run` complète de chaque compilation.",
];

const USAGE_RULES = [
  "CE QUI EST COMPILÉ, C'EST LE PACKAGE DU DOSSIER VISÉ. Passer le dossier " +
    "qui contient le `package main`, et non la racine du projet — sauf si le " +
    "`main` vit à la racine. Dans un layout `projet/cmd/outil/`, c'est " +
    "`build-go ./cmd/outil` ; `build-go .` lancé à la racine échoue, faute " +
    "de `package main` à cet endroit.",
  "Désigner un fichier `.go` d'un module revient à désigner son dossier : la " +
    "CLI remonte jusqu'au `go.mod`, monte la racine du module et compile le " +
    "package entier. `build-go ./cmd/outil/main.go` et `build-go ./cmd/outil` " +
    "produisent le même binaire ; un simple avertissement rappelle que tout " +
    "le package est pris.",
  "Hors module (aucun `go.mod` nulle part au-dessus), c'est l'inverse : il " +
    "faut désigner un fichier `.go` précis, un dossier est REFUSÉ avec une " +
    "erreur. Seul ce fichier est compilé, les autres `.go` du dossier sont " +
    "ignorés — réservé aux programmes autonomes n'utilisant que la " +
    "bibliothèque standard. Pour compiler tout un package, créer d'abord le " +
    "module : `go mod init <nom>`.",
  "Sans `--arch`, seules les cibles par défaut sont compilées " +
    "(darwin-arm64, darwin-amd64, windows-amd64). Utiliser `--arch` pour " +
    "toute autre cible, notamment Linux : `--arch linux-amd64`, ou " +
    "`--arch all` pour les six.",
  "Lister les cibles valides avec `build-go targets` avant de composer une " +
    "valeur de `--arch`. Ne jamais inventer un nom d'architecture : une " +
    "valeur inconnue fait échouer la commande avant toute compilation.",
  "Le dossier de sortie par défaut est `build/` à la racine du module — hors " +
    "module, `build/` à côté du fichier compilé. Dans les deux cas, ce n'est " +
    "pas le répertoire courant : le préciser avec `--out` si l'utilisateur " +
    "attend les binaires ailleurs.",
  "Les binaires sont produits sous la forme `<nom>-<cible>`, avec le suffixe " +
    "`.exe` pour Windows. Le nom se force avec `--name`.",
  "Les binaires sont compilés avec `-trimpath` et sans symboles de debug. " +
    "Utiliser `--no-strip` si l'utilisateur veut déboguer le binaire produit.",
  "La première compilation télécharge l'image `golang:alpine` (quelques " +
    "centaines de Mio) : c'est normal qu'elle soit longue. Les suivantes " +
    "réutilisent l'image et les volumes de cache Go. `--go-version 1.24` " +
    "vise `golang:1.24-alpine` ; `--image` impose une référence complète et " +
    "ignore `--go-version`.",
];

const EXAMPLES: Record<string, string[]> = {
  build: [
    "# Layout cmd/ : viser le dossier du package main",
    "build-go ./cmd/outil",
    "# Sans argument : le package du répertoire courant",
    "build-go",
    "# Package main à la racine du module",
    "build-go .",
    "# Fichier autonome, hors module",
    "build-go main.go",
    "build-go ./cmd/outil --arch linux-amd64",
    "build-go ./cmd/outil --arch all --out ./dist",
    "build-go ./cmd/outil --name monoutil --go-version 1.24",
    "build-go ./cmd/outil --json",
  ],
  targets: ["build-go targets", "build-go targets --json"],
  doctor: ["build-go doctor", "build-go doctor --go-version 1.24"],
};

export interface OptionDoc {
  flags: string;
  description: string;
  required: boolean;
  default?: unknown;
}

export interface ArgumentDoc {
  name: string;
  description: string;
  required: boolean;
  variadic: boolean;
}

export interface CommandDoc {
  name: string;
  description: string;
  usage: string;
  arguments: ArgumentDoc[];
  options: OptionDoc[];
  examples: string[];
}

function argUsage(arg: ArgumentDoc): string {
  const inner = arg.variadic ? `${arg.name}...` : arg.name;
  return arg.required ? `<${inner}>` : `[${inner}]`;
}

function describeCommand(programName: string, cmd: Command): CommandDoc {
  const introspectable = cmd as IntrospectableCommand;
  const args: ArgumentDoc[] = (introspectable.registeredArguments ?? []).map(
    (a) => ({
      name: a.name(),
      description: a.description ?? "",
      required: a.required,
      variadic: a.variadic,
    }),
  );
  const options: OptionDoc[] = (introspectable.options ?? []).map((o) => ({
    flags: o.flags,
    description: o.description ?? "",
    required: o.mandatory,
    default: o.defaultValue,
  }));

  const hasOptions = options.length > 0;
  const usageParts = [
    programName,
    cmd.name(),
    hasOptions ? "[options]" : "",
    ...args.map(argUsage),
  ].filter(Boolean);

  return {
    name: cmd.name(),
    description: cmd.description(),
    usage: usageParts.join(" "),
    arguments: args,
    options,
    examples: EXAMPLES[cmd.name()] ?? [],
  };
}

/** Catalogue des commandes documentables, généré par introspection. */
export function buildCommandDocs(program: Command): CommandDoc[] {
  return program.commands
    .filter((c) => !EXCLUDED.has(c.name()))
    .map((c) => describeCommand(program.name(), c));
}

/** Encode une valeur scalaire pour un frontmatter YAML (guillemets doubles). */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Rend le SKILL.md complet : frontmatter YAML + corps markdown. */
export function renderSkill(program: Command): string {
  const commands = buildCommandDocs(program);
  const lines: string[] = [];

  // Frontmatter — `name` doit correspondre au nom du dossier feuille.
  lines.push("---");
  lines.push(`name: ${SKILL_NAME}`);
  lines.push(`description: ${yamlString(SKILL_DESCRIPTION)}`);
  lines.push("---");
  lines.push("");

  lines.push(`# ${SKILL_NAME}`);
  lines.push("");
  lines.push(TOOL_PURPOSE);
  lines.push("");

  lines.push("## Invocation et prérequis");
  lines.push("");
  for (const note of INVOCATION_NOTES) lines.push(`- ${note}`);
  lines.push("");

  lines.push("## Règles d'usage");
  lines.push("");
  for (const rule of USAGE_RULES) lines.push(`- ${rule}`);
  lines.push("");

  lines.push("## Commandes");
  lines.push("");

  for (const cmd of commands) {
    lines.push(`### \`${cmd.name}\``);
    lines.push("");
    lines.push(cmd.description);
    lines.push("");
    lines.push("```");
    lines.push(cmd.usage);
    lines.push("```");
    lines.push("");

    if (cmd.arguments.length > 0) {
      lines.push("**Arguments**");
      lines.push("");
      for (const arg of cmd.arguments) {
        const req = arg.required ? "requis" : "optionnel";
        lines.push(`- \`${argUsage(arg)}\` (${req}) — ${arg.description}`);
      }
      lines.push("");
    }

    if (cmd.options.length > 0) {
      lines.push("**Options**");
      lines.push("");
      for (const opt of cmd.options) {
        const tags: string[] = [];
        if (opt.required) tags.push("requis");
        if (opt.default !== undefined && opt.default !== false) {
          tags.push(`défaut: ${JSON.stringify(opt.default)}`);
        }
        const suffix = tags.length > 0 ? ` (${tags.join(", ")})` : "";
        lines.push(`- \`${opt.flags}\`${suffix} — ${opt.description}`);
      }
      lines.push("");
    }

    if (cmd.examples.length > 0) {
      lines.push("**Exemples**");
      lines.push("");
      lines.push("```bash");
      for (const ex of cmd.examples) lines.push(ex);
      lines.push("```");
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export interface SkillOptions {
  /** Dossier PARENT où créer `<SKILL_NAME>/SKILL.md`. `-` = stdout. */
  output: string;
}

export function runSkill(program: Command, opts: SkillOptions): void {
  const content = renderSkill(program);

  if (opts.output === "-") {
    process.stdout.write(content);
    return;
  }

  const parentDir = resolve(process.cwd(), opts.output);
  const skillDir = join(parentDir, SKILL_NAME);
  mkdirSync(skillDir, { recursive: true });
  const outPath = join(skillDir, "SKILL.md");
  writeFileSync(outPath, content, "utf-8");
  process.stderr.write(`Skill écrit dans ${outPath}\n`);
}
