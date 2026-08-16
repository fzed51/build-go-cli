import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  assertDockerReady,
  buildDockerArgs,
  hasImage,
  pullImage,
  runDocker,
} from "./docker.js";
import { logger } from "./logger.js";
import type { ResolvedSource } from "./source.js";
import { getTarget } from "./targets.js";

/**
 * Image Docker utilisée pour compiler.
 *
 * Le défaut est le tag mobile `golang:alpine`, qui suit la dernière version
 * stable de Go. Un tag figé finit toujours par sortir du support et par
 * embarquer des vulnérabilités connues de la bibliothèque standard — c'est ce
 * qui était arrivé au script d'origine, resté sur Go 1.21. `--go-version`
 * permet de figer volontairement une version quand c'est le besoin.
 */
export function goImage(version?: string, image?: string): string {
  if (image) return image;
  if (version) return `golang:${version}-alpine`;
  return "golang:alpine";
}

/** Nom du fichier produit pour une cible donnée. */
export function outputFileName(
  binaryName: string,
  targetName: string,
  goos: string,
): string {
  const name = `${binaryName}-${targetName}`;
  return goos === "windows" ? `${name}.exe` : name;
}

export interface BuildOutcome {
  target: string;
  goos: string;
  goarch: string;
  ok: boolean;
  file: string;
  path: string;
  bytes: number | null;
  /** Sortie du compilateur, renseignée en mode capture uniquement. */
  log: string;
}

export interface BuildReport {
  ok: boolean;
  source: string;
  moduleRoot: string | null;
  image: string;
  outputDir: string;
  binaryName: string;
  warnings: string[];
  results: BuildOutcome[];
}

export interface RunBuildParams {
  source: ResolvedSource;
  targets: string[];
  outputDir: string;
  image: string;
  strip: boolean;
  cache: boolean;
  /** Mode JSON : la sortie Docker est collectée au lieu d'être affichée. */
  capture: boolean;
}

function fileSize(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

export function runBuild(params: RunBuildParams): BuildReport {
  const { source, targets, outputDir, image, strip, cache, capture } = params;

  assertDockerReady();
  mkdirSync(outputDir, { recursive: true });

  // Téléchargement explicite : sans lui, le premier build reste sans réponse
  // le temps du pull, sans que rien n'indique ce qui se passe.
  if (!hasImage(image)) {
    if (!capture) logger.step(`Téléchargement de l'image ${image}`);
    const pull = pullImage(image, capture);
    if (pull.code !== 0) {
      throw new Error(
        `Impossible de télécharger l'image ${image}.` +
          (pull.output ? `\n${pull.output}` : ""),
      );
    }
  }

  const results: BuildOutcome[] = [];

  for (const targetName of targets) {
    const { goos, goarch } = getTarget(targetName);
    const file = outputFileName(source.binaryName, targetName, goos);

    if (!capture) {
      logger.step(`Compilation ${targetName} (${goos}/${goarch})`);
    }

    const args = buildDockerArgs({
      image,
      mountDir: source.mountDir,
      outputDir,
      workdir: source.workdir,
      buildTarget: source.buildTarget,
      outputFile: file,
      goos,
      goarch,
      strip,
      cache,
    });
    logger.debug(`docker ${args.join(" ")}`);

    const res = runDocker(args, capture);
    const path = join(outputDir, file);
    const ok = res.code === 0;

    results.push({
      target: targetName,
      goos,
      goarch,
      ok,
      file,
      path,
      bytes: ok ? fileSize(path) : null,
      log: res.output,
    });

    if (!capture) {
      if (ok) logger.success(`${targetName} → ${path}`);
      else logger.error(`${targetName} : échec de la compilation`);
    }
  }

  return {
    ok: results.every((r) => r.ok),
    source: source.entryPath,
    moduleRoot: source.moduleRoot,
    image,
    outputDir,
    binaryName: source.binaryName,
    warnings: source.warnings,
    results,
  };
}

/** Formate une taille en octets pour le récapitulatif. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  const mib = bytes / 1024 / 1024;
  if (mib >= 1) return `${mib.toFixed(1)} Mio`;
  return `${Math.max(1, Math.round(bytes / 1024))} Kio`;
}
