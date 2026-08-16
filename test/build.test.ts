import { describe, expect, it } from "vitest";
import { formatBytes, goImage, outputFileName } from "../src/build.js";
import {
  BUILD_CACHE_VOLUME,
  buildDockerArgs,
  type DockerBuildParams,
  MODULE_CACHE_VOLUME,
} from "../src/docker.js";

const base: DockerBuildParams = {
  image: "golang:alpine",
  mountDir: "/home/moi/monprojet",
  outputDir: "/home/moi/monprojet/build",
  workdir: "/src/cmd/outil",
  buildTarget: ".",
  outputFile: "outil-linux-amd64",
  goos: "linux",
  goarch: "amd64",
  strip: true,
  cache: true,
};

/** Valeur de l'argument qui suit le premier `flag` donné. */
function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

describe("goImage", () => {
  it("suit la dernière version stable par défaut", () => {
    expect(goImage()).toBe("golang:alpine");
  });

  it("compose le tag alpine à partir d'une version", () => {
    expect(goImage("1.24")).toBe("golang:1.24-alpine");
  });

  it("laisse --image prendre le pas sur --go-version", () => {
    expect(goImage("1.24", "golang:1.22-bookworm")).toBe("golang:1.22-bookworm");
  });
});

describe("outputFileName", () => {
  it("suffixe le nom par la cible", () => {
    expect(outputFileName("outil", "linux-amd64", "linux")).toBe(
      "outil-linux-amd64",
    );
  });

  it("ajoute .exe pour Windows", () => {
    expect(outputFileName("outil", "windows-amd64", "windows")).toBe(
      "outil-windows-amd64.exe",
    );
  });
});

describe("formatBytes", () => {
  it("affiche les Mio au dixième", () => {
    expect(formatBytes(3_500_000)).toBe("3.3 Mio");
  });

  it("bascule en Kio sous le Mio", () => {
    expect(formatBytes(2048)).toBe("2 Kio");
  });

  it("affiche un tiret quand la taille est inconnue", () => {
    expect(formatBytes(null)).toBe("—");
  });
});

describe("buildDockerArgs", () => {
  it("monte la source et la sortie", () => {
    const args = buildDockerArgs(base);
    expect(args).toContain("/home/moi/monprojet:/src");
    expect(args).toContain("/home/moi/monprojet/build:/output");
  });

  it("positionne le répertoire de travail et les variables Go", () => {
    const args = buildDockerArgs(base);
    expect(valueAfter(args, "-w")).toBe("/src/cmd/outil");
    expect(args).toContain("GOOS=linux");
    expect(args).toContain("GOARCH=amd64");
    expect(args).toContain("CGO_ENABLED=0");
  });

  it("monte les volumes de cache par défaut", () => {
    const args = buildDockerArgs(base);
    expect(args.join(" ")).toContain(MODULE_CACHE_VOLUME);
    expect(args.join(" ")).toContain(BUILD_CACHE_VOLUME);
  });

  it("omet les volumes de cache quand il est désactivé", () => {
    const args = buildDockerArgs({ ...base, cache: false });
    expect(args.join(" ")).not.toContain(MODULE_CACHE_VOLUME);
    expect(args.join(" ")).not.toContain(BUILD_CACHE_VOLUME);
  });

  it("compile toujours avec -trimpath", () => {
    expect(buildDockerArgs(base)).toContain("-trimpath");
  });

  it("passe -ldflags en UN seul argument", () => {
    // Sans shell, rien ne redécoupe la valeur : "-s -w" doit rester groupé.
    expect(buildDockerArgs(base)).toContain("-ldflags=-s -w");
  });

  it("retire -ldflags avec --no-strip", () => {
    const args = buildDockerArgs({ ...base, strip: false });
    expect(args.some((a) => a.startsWith("-ldflags"))).toBe(false);
  });

  it("écrit le binaire dans /output", () => {
    expect(valueAfter(buildDockerArgs(base), "-o")).toBe(
      "/output/outil-linux-amd64",
    );
  });

  it("termine par la cible de compilation", () => {
    expect(buildDockerArgs(base).at(-1)).toBe(".");
    expect(buildDockerArgs({ ...base, buildTarget: "hello.go" }).at(-1)).toBe(
      "hello.go",
    );
  });

  it("place l'image avant la commande go", () => {
    const args = buildDockerArgs(base);
    expect(args.indexOf("golang:alpine")).toBeLessThan(args.indexOf("go"));
    expect(args[args.indexOf("golang:alpine") + 1]).toBe("go");
  });

  it("n'insère aucune enveloppe shell", () => {
    const args = buildDockerArgs(base);
    expect(args).not.toContain("sh");
    expect(args).not.toContain("-c");
  });

  it("transmet les chemins contenant une espace sans échappement", () => {
    const args = buildDockerArgs({
      ...base,
      mountDir: "/home/moi/mon projet",
    });
    expect(args).toContain("/home/moi/mon projet:/src");
  });
});
