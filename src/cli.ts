import { resolve } from "node:path";
import { Command } from "commander";
import { type BuildReport, formatBytes, goImage, runBuild } from "./build.js";
import {
  BUILD_CACHE_VOLUME,
  hasImage,
  isDockerInstalled,
  isDockerRunning,
  MODULE_CACHE_VOLUME,
} from "./docker.js";
import { logger } from "./logger.js";
import { runSkill } from "./skill.js";
import { resolveSource } from "./source.js";
import { DEFAULT_TARGETS, resolveTargets, TARGETS } from "./targets.js";

export const VERSION = "0.1.0";

interface BuildOpts {
  arch?: string;
  out?: string;
  name?: string;
  goVersion?: string;
  image?: string;
  strip: boolean;
  cache: boolean;
  json?: boolean;
}

/** Récapitulatif texte affiché en fin de compilation. */
function printSummary(report: BuildReport): void {
  const lines: string[] = [];
  lines.push("");
  for (const result of report.results) {
    const mark = result.ok ? "✓" : "✗";
    const size = result.ok ? ` (${formatBytes(result.bytes)})` : "";
    lines.push(`  ${mark} ${result.target.padEnd(14)} ${result.file}${size}`);
  }
  lines.push("");
  lines.push(`  Sortie : ${report.outputDir}`);
  console.log(lines.join("\n"));
}

export function buildCli(): Command {
  const program = new Command();

  program
    .name("build-go")
    .description(
      "Compile un programme Go pour plusieurs architectures via Docker, " +
        "sans Go installé localement",
    )
    .version(VERSION);

  program
    .command("build [source]", { isDefault: true })
    .description(
      "Compile un fichier .go ou un package Go pour les architectures cibles",
    )
    .option(
      "-a, --arch <liste>",
      `Architectures séparées par une virgule, ou "all" (défaut : ${DEFAULT_TARGETS.join(",")})`,
    )
    .option(
      "-o, --out <dir>",
      "Dossier de sortie (défaut : build/ à la racine du module)",
    )
    .option(
      "-n, --name <nom>",
      "Nom du binaire (défaut : nom du package ou du fichier)",
    )
    .option(
      "--go-version <version>",
      "Version de Go, ex. 1.24 (défaut : dernière stable)",
    )
    .option("--image <ref>", "Image Docker complète, ignore --go-version")
    .option("--no-strip", "Conserve les symboles de debug dans le binaire")
    .option("--no-cache", "N'utilise pas les volumes de cache Go")
    .option("--json", "Émet le rapport JSON sur stdout et rien d'autre")
    .action((sourceArg: string | undefined, opts: BuildOpts) => {
      const capture = opts.json === true;
      const targets = resolveTargets(opts.arch);
      const source = resolveSource(sourceArg ?? ".", { binaryName: opts.name });
      const outputDir = opts.out
        ? resolve(process.cwd(), opts.out)
        : source.defaultOutputDir;
      const image = goImage(opts.goVersion, opts.image);

      if (!capture) {
        for (const warning of source.warnings) logger.warn(warning);
        const scope = source.moduleRoot
          ? `package ${source.workdir} du module ${source.moduleRoot}`
          : `fichier ${source.buildTarget}`;
        logger.info(`Source : ${scope}`);
      }

      const report = runBuild({
        source,
        targets,
        outputDir,
        image,
        strip: opts.strip,
        cache: opts.cache,
        capture,
      });

      if (capture) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printSummary(report);
        if (!report.ok) {
          const failed = report.results
            .filter((r) => !r.ok)
            .map((r) => r.target)
            .join(", ");
          logger.error(`Compilation en échec : ${failed}`);
        }
      }

      if (!report.ok) process.exit(1);
    });

  program
    .command("targets")
    .description("Liste les architectures compilables")
    .option("--json", "Émet la liste au format JSON")
    .action((opts: { json?: boolean }) => {
      const list = Object.entries(TARGETS).map(([name, target]) => ({
        name,
        goos: target.goos,
        goarch: target.goarch,
        default: DEFAULT_TARGETS.includes(name),
      }));

      if (opts.json) {
        console.log(JSON.stringify(list, null, 2));
        return;
      }

      for (const target of list) {
        const flag = target.default ? " (par défaut)" : "";
        console.log(
          `${target.name.padEnd(14)} GOOS=${target.goos} GOARCH=${target.goarch}${flag}`,
        );
      }
    });

  program
    .command("doctor")
    .description("Vérifie que Docker et l'image de compilation sont prêts")
    .option(
      "--go-version <version>",
      "Version de Go à vérifier (défaut : dernière stable)",
    )
    .option("--image <ref>", "Image Docker complète, ignore --go-version")
    .action((opts: { goVersion?: string; image?: string }) => {
      const image = goImage(opts.goVersion, opts.image);

      const installed = isDockerInstalled();
      if (installed) logger.success("Docker est installé");
      else logger.error("Docker est introuvable dans le PATH");

      const running = installed && isDockerRunning();
      if (running) logger.success("Le daemon Docker répond");
      else if (installed) logger.error("Le daemon Docker ne répond pas");

      if (running) {
        if (hasImage(image)) logger.success(`Image ${image} présente`);
        else logger.warn(`Image ${image} absente (téléchargée au 1er build)`);
        logger.info(
          `Volumes de cache : ${MODULE_CACHE_VOLUME}, ${BUILD_CACHE_VOLUME}`,
        );
      }

      if (!running) process.exit(1);
    });

  program
    .command("skill")
    .description(
      "Génère un skill Claude Code clé en main (<DIR>/<nom>/SKILL.md) décrivant l'outil",
    )
    .option(
      "-o, --output <DIR>",
      "Dossier parent où créer <nom-du-skill>/SKILL.md (- pour stdout)",
      ".",
    )
    .action((opts: { output: string }) => {
      runSkill(program, opts);
    });

  return program;
}
