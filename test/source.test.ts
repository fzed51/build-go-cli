import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findModuleRoot, readModulePath, resolveSource } from "../src/source.js";

/**
 * Les tests travaillent sur une vraie arborescence temporaire : la résolution
 * repose entièrement sur le système de fichiers (présence de `go.mod`,
 * remontée de l'arborescence), la simuler ne prouverait rien.
 */
let root: string;
let moduleDir: string;
let cmdDir: string;
let soloDir: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "build-go-cli-"));

  moduleDir = join(root, "monprojet");
  cmdDir = join(moduleDir, "cmd", "outil");
  mkdirSync(cmdDir, { recursive: true });
  writeFileSync(
    join(moduleDir, "go.mod"),
    "module exemple.com/equipe/monprojet\n\ngo 1.24\n",
  );
  writeFileSync(join(moduleDir, "main.go"), "package main\n");
  writeFileSync(join(cmdDir, "main.go"), "package main\n");
  writeFileSync(join(cmdDir, "options.go"), "package main\n");
  writeFileSync(join(cmdDir, "options_test.go"), "package main\n");

  soloDir = join(root, "solo");
  mkdirSync(soloDir, { recursive: true });
  writeFileSync(join(soloDir, "hello.go"), "package main\n");
  writeFileSync(join(soloDir, "autre.go"), "package main\n");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("findModuleRoot", () => {
  it("trouve le go.mod du dossier lui-même", () => {
    expect(findModuleRoot(moduleDir)).toBe(moduleDir);
  });

  it("remonte l'arborescence jusqu'au go.mod", () => {
    expect(findModuleRoot(cmdDir)).toBe(moduleDir);
  });

  it("retourne null hors de tout module", () => {
    expect(findModuleRoot(soloDir)).toBeNull();
  });
});

describe("readModulePath", () => {
  it("extrait la directive module", () => {
    expect(readModulePath(moduleDir)).toBe("exemple.com/equipe/monprojet");
  });

  it("retourne null si le go.mod est absent", () => {
    expect(readModulePath(soloDir)).toBeNull();
  });
});

describe("resolveSource — mode module", () => {
  it("monte la racine du module quand on vise un sous-dossier", () => {
    const source = resolveSource(cmdDir);
    expect(source.mountDir).toBe(moduleDir);
    expect(source.workdir).toBe("/src/cmd/outil");
    expect(source.buildTarget).toBe(".");
    expect(source.moduleRoot).toBe(moduleDir);
  });

  it("monte la racine du module quand on vise un fichier du sous-dossier", () => {
    const source = resolveSource(join(cmdDir, "main.go"));
    expect(source.mountDir).toBe(moduleDir);
    expect(source.workdir).toBe("/src/cmd/outil");
    // Le package entier est compilé : c'est ce qui débloque le multi-fichiers.
    expect(source.buildTarget).toBe(".");
  });

  it("place le workdir à la racine quand le package y vit", () => {
    const source = resolveSource(moduleDir);
    expect(source.workdir).toBe("/src");
  });

  it("prévient que tout le package est compilé, pas le seul fichier visé", () => {
    const source = resolveSource(join(cmdDir, "main.go"));
    expect(source.warnings.join(" ")).toMatch(/tout le package est compilé/);
  });

  it("ne compte pas les fichiers _test.go dans l'avertissement", () => {
    // cmd/outil contient main.go, options.go et options_test.go : 2 fichiers.
    const source = resolveSource(join(cmdDir, "main.go"));
    expect(source.warnings.join(" ")).toMatch(/2 fichiers Go/);
  });

  it("nomme le binaire d'après le dossier du package", () => {
    expect(resolveSource(cmdDir).binaryName).toBe("outil");
  });

  it("nomme le binaire d'après le module à la racine", () => {
    expect(resolveSource(moduleDir).binaryName).toBe("monprojet");
  });

  it("laisse l'appelant imposer le nom du binaire", () => {
    const source = resolveSource(cmdDir, { binaryName: "autrechose" });
    expect(source.binaryName).toBe("autrechose");
  });

  it("place la sortie par défaut à la racine du module", () => {
    expect(resolveSource(cmdDir).defaultOutputDir).toBe(join(moduleDir, "build"));
  });
});

describe("resolveSource — mode fichier isolé", () => {
  it("monte le dossier du fichier et compile ce seul fichier", () => {
    const source = resolveSource(join(soloDir, "hello.go"));
    expect(source.mountDir).toBe(soloDir);
    expect(source.workdir).toBe("/src");
    expect(source.buildTarget).toBe("hello.go");
    expect(source.moduleRoot).toBeNull();
  });

  it("nomme le binaire d'après le fichier", () => {
    expect(resolveSource(join(soloDir, "hello.go")).binaryName).toBe("hello");
  });

  it("prévient que les autres fichiers du dossier sont ignorés", () => {
    const source = resolveSource(join(soloDir, "hello.go"));
    expect(source.warnings.join(" ")).toMatch(/autre\.go/);
  });

  it("refuse un dossier sans go.mod en proposant un fichier", () => {
    expect(() => resolveSource(soloDir)).toThrow(/Aucun go\.mod/);
    expect(() => resolveSource(soloDir)).toThrow(/go mod init/);
  });
});

describe("resolveSource — entrées invalides", () => {
  it("refuse un chemin inexistant", () => {
    expect(() => resolveSource(join(root, "absent.go"))).toThrow(
      /introuvable/,
    );
  });

  it("refuse un fichier qui n'est pas du Go", () => {
    const readme = join(soloDir, "README.md");
    writeFileSync(readme, "# doc\n");
    expect(() => resolveSource(readme)).toThrow(/extension \.go/);
    rmSync(readme);
  });
});
