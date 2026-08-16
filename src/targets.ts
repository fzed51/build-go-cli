/**
 * Catalogue des couples GOOS/GOARCH compilables.
 *
 * La clé est le nom public de la cible, employé aussi bien dans `--arch` que
 * dans le suffixe du binaire produit (`monoutil-linux-amd64`).
 */

export interface Target {
  goos: string;
  goarch: string;
}

export const TARGETS: Record<string, Target> = {
  "darwin-arm64": { goos: "darwin", goarch: "arm64" },
  "darwin-amd64": { goos: "darwin", goarch: "amd64" },
  "linux-arm64": { goos: "linux", goarch: "arm64" },
  "linux-amd64": { goos: "linux", goarch: "amd64" },
  "windows-arm64": { goos: "windows", goarch: "arm64" },
  "windows-amd64": { goos: "windows", goarch: "amd64" },
};

/**
 * Cibles compilées quand `--arch` n'est pas fourni.
 *
 * Reprend le comportement historique du script Python `build-go` : les deux
 * macOS et Windows x86. Les cibles Linux existent mais ne sont pas compilées
 * par défaut — elles servent surtout à produire des binaires de conteneur,
 * ce qui relève d'une demande explicite. `--arch all` compile tout.
 */
export const DEFAULT_TARGETS = [
  "darwin-arm64",
  "darwin-amd64",
  "windows-amd64",
];

export function targetNames(): string[] {
  return Object.keys(TARGETS);
}

/**
 * Traduit la valeur de `--arch` en liste de cibles.
 *
 * Accepte `all`, ou une liste séparée par des virgules. Les doublons sont
 * retirés en conservant l'ordre demandé, qui pilote l'ordre de compilation.
 */
export function resolveTargets(spec?: string): string[] {
  if (!spec) return [...DEFAULT_TARGETS];

  const trimmed = spec.trim();
  if (trimmed.toLowerCase() === "all") return targetNames();

  const requested = trimmed
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  if (requested.length === 0) {
    throw new Error(
      `Aucune architecture dans --arch. Disponibles : ${targetNames().join(", ")}`,
    );
  }

  const unknown = requested.filter((name) => !(name in TARGETS));
  if (unknown.length > 0) {
    throw new Error(
      `Architecture inconnue : ${unknown.join(", ")}. ` +
        `Disponibles : ${targetNames().join(", ")}, all`,
    );
  }

  return [...new Set(requested)];
}

export function getTarget(name: string): Target {
  const target = TARGETS[name];
  if (!target) {
    throw new Error(`Architecture inconnue : ${name}`);
  }
  return target;
}
