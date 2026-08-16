import { spawnSync } from "node:child_process";

/**
 * Accès à Docker.
 *
 * Toutes les commandes passent par spawnSync SANS shell : chaque argument est
 * transmis tel quel au processus, aucune couche d'interprétation ne peut le
 * redécouper. Les chemins contenant une espace, un guillemet ou un caractère
 * d'échappement traversent donc sans traitement particulier.
 */

/** Volumes nommés qui conservent le cache Go entre deux compilations. */
export const MODULE_CACHE_VOLUME = "build-go-cli-gomod";
export const BUILD_CACHE_VOLUME = "build-go-cli-gobuild";

/** Chemins de cache internes à l'image officielle golang. */
const CONTAINER_MODULE_CACHE = "/go/pkg/mod";
const CONTAINER_BUILD_CACHE = "/root/.cache/go-build";

/** Point de montage du dossier de sortie. */
export const CONTAINER_OUTPUT = "/output";

export interface CommandResult {
  code: number;
  output: string;
}

/** `docker` est-il installé ? Ne dit rien de l'état du daemon. */
export function isDockerInstalled(): boolean {
  const res = spawnSync("docker", ["--version"], {
    stdio: "ignore",
    timeout: 10_000,
  });
  return res.status === 0;
}

/**
 * Le daemon Docker répond-il ?
 *
 * `docker --version` ne suffit pas : c'est une commande purement cliente, qui
 * réussit daemon éteint. Seule une commande interrogeant le serveur, comme
 * `docker info`, permet de le savoir.
 */
export function isDockerRunning(): boolean {
  const res = spawnSync("docker", ["info"], {
    stdio: "ignore",
    timeout: 30_000,
  });
  return res.status === 0;
}

/** Vérifie Docker et interrompt avec un message actionnable si besoin. */
export function assertDockerReady(): void {
  if (!isDockerInstalled()) {
    throw new Error(
      "Docker est introuvable. Installe Docker Desktop, ou vérifie que la " +
        "commande `docker` est dans le PATH.",
    );
  }
  if (!isDockerRunning()) {
    throw new Error(
      "Le daemon Docker ne répond pas. Démarre Docker Desktop puis relance " +
        "la compilation.",
    );
  }
}

/** L'image est-elle déjà présente localement ? */
export function hasImage(image: string): boolean {
  const res = spawnSync("docker", ["image", "inspect", image], {
    stdio: "ignore",
    timeout: 30_000,
  });
  return res.status === 0;
}

/** Télécharge l'image. La progression est affichée sauf en mode capture. */
export function pullImage(image: string, capture: boolean): CommandResult {
  return runDocker(["pull", image], capture);
}

export interface DockerBuildParams {
  image: string;
  /** Dossier hôte monté sur /src. */
  mountDir: string;
  /** Dossier hôte monté sur /output. */
  outputDir: string;
  /** Répertoire de travail dans le conteneur. */
  workdir: string;
  /** Argument de `go build` : "." ou un nom de fichier. */
  buildTarget: string;
  /** Nom du fichier produit dans /output. */
  outputFile: string;
  goos: string;
  goarch: string;
  /** Retirer la table des symboles et les infos de debug (-s -w). */
  strip: boolean;
  /** Monter les volumes de cache Go. */
  cache: boolean;
}

/**
 * Construit la ligne d'arguments `docker run` complète.
 *
 * Fonction pure, sans effet de bord : c'est elle qui est couverte par les
 * tests, la commande réelle n'étant qu'un `spawnSync` de son résultat.
 *
 * La source est montée en lecture-écriture, et non en lecture seule : `go
 * build` doit pouvoir compléter `go.sum` quand une dépendance y manque. Un
 * utilisateur sans Go installé — le public de cet outil — n'aurait aucun
 * moyen de le faire lui-même.
 */
export function buildDockerArgs(params: DockerBuildParams): string[] {
  const args = [
    "run",
    "--rm",
    "-v",
    `${params.mountDir}:/src`,
    "-v",
    `${params.outputDir}:${CONTAINER_OUTPUT}`,
  ];

  if (params.cache) {
    args.push(
      "-v",
      `${MODULE_CACHE_VOLUME}:${CONTAINER_MODULE_CACHE}`,
      "-v",
      `${BUILD_CACHE_VOLUME}:${CONTAINER_BUILD_CACHE}`,
    );
  }

  args.push(
    "-w",
    params.workdir,
    "-e",
    `GOOS=${params.goos}`,
    "-e",
    `GOARCH=${params.goarch}`,
    "-e",
    "CGO_ENABLED=0",
    params.image,
    "go",
    "build",
    // Retire les chemins de compilation du binaire : sortie reproductible.
    "-trimpath",
  );

  if (params.strip) {
    // Un seul argument : sans shell, la valeur "-s -w" n'est pas redécoupée.
    args.push("-ldflags=-s -w");
  }

  args.push(
    "-o",
    `${CONTAINER_OUTPUT}/${params.outputFile}`,
    params.buildTarget,
  );

  return args;
}

/**
 * Exécute une commande docker.
 *
 * `capture` à false laisse la sortie du conteneur s'afficher en direct : la
 * progression d'un `docker pull` et les erreurs du compilateur arrivent au
 * fil de l'eau plutôt qu'à la fin. À true, tout est collecté pour être
 * restitué dans le rapport JSON.
 */
export function runDocker(args: string[], capture: boolean): CommandResult {
  if (capture) {
    const res = spawnSync("docker", args, { encoding: "utf-8" });
    const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
    return { code: res.status ?? 1, output };
  }

  const res = spawnSync("docker", args, {
    stdio: ["ignore", "inherit", "inherit"],
  });
  return { code: res.status ?? 1, output: "" };
}
