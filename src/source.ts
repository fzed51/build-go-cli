import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

/**
 * Résolution de ce qu'il faut compiler, et de ce qu'il faut monter dans le
 * conteneur pour que la compilation aboutisse.
 *
 * Deux modes, choisis automatiquement selon la présence d'un `go.mod` :
 *
 *   - MODULE — un `go.mod` existe dans le dossier visé ou au-dessus. On monte
 *     la RACINE DU MODULE (et non le dossier du fichier), on se place dans le
 *     sous-dossier visé et on compile le package entier (`.`). C'est ce qui
 *     permet aux programmes répartis sur plusieurs fichiers de compiler, et
 *     aux layouts `projet/cmd/outil/main.go` de trouver leur `go.mod`.
 *
 *   - FICHIER ISOLÉ — aucun `go.mod` nulle part. Go accepte alors
 *     `go build fichier.go` pour un programme autonome n'utilisant que la
 *     bibliothèque standard. On monte le dossier du fichier et on ne compile
 *     que ce fichier ; les autres `.go` du dossier sont ignorés, ce qui est
 *     signalé par un avertissement.
 */

/** Point de montage de la source dans le conteneur. */
export const CONTAINER_SRC = "/src";

export interface ResolvedSource {
  /** Dossier hôte monté sur /src. */
  mountDir: string;
  /** Répertoire de travail dans le conteneur (/src ou /src/sous/dossier). */
  workdir: string;
  /** Argument passé à `go build` : "." en module, sinon le nom du fichier. */
  buildTarget: string;
  /** Racine du module Go, ou null en mode fichier isolé. */
  moduleRoot: string | null;
  /** Chemin du module déclaré par go.mod, si lisible. */
  modulePath: string | null;
  /** Nom de binaire déduit, utilisé si l'appelant n'en impose pas. */
  binaryName: string;
  /** Dossier de sortie par défaut, à côté de la racine du projet. */
  defaultOutputDir: string;
  /** Chemin absolu de l'entrée, tel que résolu. */
  entryPath: string;
  warnings: string[];
}

/** Remonte l'arborescence à la recherche du `go.mod` le plus proche. */
export function findModuleRoot(startDir: string): string | null {
  let current = resolve(startDir);

  for (;;) {
    if (existsSync(join(current, "go.mod"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Extrait la directive `module` d'un go.mod. Null si illisible ou absente. */
export function readModulePath(moduleRoot: string): string | null {
  try {
    const content = readFileSync(join(moduleRoot, "go.mod"), "utf-8");
    const match = content.match(/^\s*module\s+(\S+)/m);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Chemin conteneur d'un dossier hôte situé sous la racine montée. */
function containerPath(mountDir: string, dir: string): string {
  const rel = relative(mountDir, dir).split("\\").join("/");
  return rel === "" ? CONTAINER_SRC : `${CONTAINER_SRC}/${rel}`;
}

/** Fichiers Go compilables d'un dossier (les `_test.go` sont exclus). */
function goFilesIn(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".go") && !name.endsWith("_test.go"))
      .sort();
  } catch {
    return [];
  }
}

export interface ResolveSourceOptions {
  /** Nom de binaire imposé par l'appelant. */
  binaryName?: string;
}

/**
 * Résout l'entrée fournie sur la ligne de commande : un fichier `.go`, un
 * dossier, ou rien (le répertoire courant).
 */
export function resolveSource(
  input: string,
  opts: ResolveSourceOptions = {},
): ResolvedSource {
  const entryPath = resolve(input);
  const warnings: string[] = [];

  if (!existsSync(entryPath)) {
    throw new Error(`Source introuvable : ${entryPath}`);
  }

  const stats = statSync(entryPath);
  const isDirectory = stats.isDirectory();

  if (!isDirectory && !stats.isFile()) {
    throw new Error(
      `Source inutilisable (ni fichier, ni dossier) : ${entryPath}`,
    );
  }

  if (!isDirectory && extname(entryPath) !== ".go") {
    throw new Error(
      `Le fichier source doit avoir l'extension .go : ${entryPath}`,
    );
  }

  const entryDir = isDirectory ? entryPath : dirname(entryPath);
  const moduleRoot = findModuleRoot(entryDir);

  if (moduleRoot) {
    // Mode module : on compile le package du dossier, pas un fichier isolé.
    if (!isDirectory) {
      const siblings = goFilesIn(entryDir);
      if (siblings.length > 1) {
        warnings.push(
          `Le package contient ${siblings.length} fichiers Go : ` +
            "tout le package est compilé, pas seulement le fichier indiqué.",
        );
      }
    }

    const modulePath = readModulePath(moduleRoot);
    const binaryName =
      opts.binaryName ??
      defaultBinaryName({ entryPath, entryDir, moduleRoot, modulePath });

    return {
      mountDir: moduleRoot,
      workdir: containerPath(moduleRoot, entryDir),
      buildTarget: ".",
      moduleRoot,
      modulePath,
      binaryName,
      defaultOutputDir: join(moduleRoot, "build"),
      entryPath,
      warnings,
    };
  }

  // Mode fichier isolé : hors module, `go build` exige un fichier nommé.
  if (isDirectory) {
    const candidates = goFilesIn(entryPath);
    throw new Error(
      `Aucun go.mod trouvé au-dessus de ${entryPath}.\n` +
        "Hors module, il faut désigner un fichier .go précis" +
        (candidates.length > 0
          ? ` (ex. ${join(input, candidates[0] as string)}).`
          : ".") +
        "\nSinon, initialise le module : go mod init <nom>",
    );
  }

  const siblings = goFilesIn(entryDir).filter(
    (name) => name !== basename(entryPath),
  );
  if (siblings.length > 0) {
    warnings.push(
      `Aucun go.mod : seul ${basename(entryPath)} est compilé. ` +
        `Ignorés : ${siblings.join(", ")}. ` +
        "Ajoute un go.mod pour compiler tout le package.",
    );
  }

  return {
    mountDir: entryDir,
    workdir: CONTAINER_SRC,
    buildTarget: basename(entryPath),
    moduleRoot: null,
    modulePath: null,
    binaryName: opts.binaryName ?? basename(entryPath, ".go"),
    defaultOutputDir: join(entryDir, "build"),
    entryPath,
    warnings,
  };
}

/**
 * Nom du binaire en mode module.
 *
 * Go nomme le binaire d'après le dossier du package. On suit cette règle, avec
 * le dernier segment du chemin de module en repli quand le package vit à la
 * racine d'un dossier au nom peu parlant (`src`, `.`).
 */
function defaultBinaryName(params: {
  entryPath: string;
  entryDir: string;
  moduleRoot: string;
  modulePath: string | null;
}): string {
  const dirName = basename(params.entryDir);
  const fromModule = params.modulePath?.split("/").pop();

  if (params.entryDir === params.moduleRoot && fromModule) return fromModule;
  if (dirName && dirName !== "." && dirName !== "src") return dirName;
  if (fromModule) return fromModule;

  return basename(params.entryPath, ".go");
}
