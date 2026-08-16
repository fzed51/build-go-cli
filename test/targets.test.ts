import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGETS,
  getTarget,
  resolveTargets,
  targetNames,
} from "../src/targets.js";

describe("resolveTargets", () => {
  it("retourne les cibles par défaut sans argument", () => {
    expect(resolveTargets()).toEqual(DEFAULT_TARGETS);
  });

  it("ne partage pas la référence du tableau par défaut", () => {
    const first = resolveTargets();
    first.push("linux-amd64");
    expect(resolveTargets()).toEqual(DEFAULT_TARGETS);
  });

  it("développe all en toutes les cibles connues", () => {
    expect(resolveTargets("all")).toEqual(targetNames());
    expect(resolveTargets("ALL")).toEqual(targetNames());
  });

  it("accepte une liste séparée par des virgules", () => {
    expect(resolveTargets("linux-amd64,darwin-arm64")).toEqual([
      "linux-amd64",
      "darwin-arm64",
    ]);
  });

  it("ignore les espaces autour des noms", () => {
    expect(resolveTargets(" linux-amd64 , darwin-arm64 ")).toEqual([
      "linux-amd64",
      "darwin-arm64",
    ]);
  });

  it("retire les doublons en conservant l'ordre demandé", () => {
    expect(resolveTargets("linux-amd64,darwin-arm64,linux-amd64")).toEqual([
      "linux-amd64",
      "darwin-arm64",
    ]);
  });

  it("rejette une architecture inconnue en listant les valides", () => {
    expect(() => resolveTargets("linux-mips")).toThrow(/linux-mips/);
    expect(() => resolveTargets("linux-mips")).toThrow(/darwin-arm64/);
  });

  it("rejette une liste vide", () => {
    expect(() => resolveTargets(" , ")).toThrow(/Aucune architecture/);
  });
});

describe("getTarget", () => {
  it("retourne le couple GOOS/GOARCH", () => {
    expect(getTarget("windows-amd64")).toEqual({
      goos: "windows",
      goarch: "amd64",
    });
  });

  it("échoue sur une cible inconnue", () => {
    expect(() => getTarget("plan9-386")).toThrow(/inconnue/);
  });
});

describe("catalogue", () => {
  it("couvre les trois systèmes en amd64 et arm64", () => {
    expect(targetNames().sort()).toEqual([
      "darwin-amd64",
      "darwin-arm64",
      "linux-amd64",
      "linux-arm64",
      "windows-amd64",
      "windows-arm64",
    ]);
  });

  it("n'a que des cibles connues dans les défauts", () => {
    for (const name of DEFAULT_TARGETS) {
      expect(targetNames()).toContain(name);
    }
  });
});
