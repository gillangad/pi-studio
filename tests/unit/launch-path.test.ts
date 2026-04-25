import { describe, expect, it, vi } from "vitest";
import { resolveLaunchProjectPathCandidate } from "../../src/pi-host/launch-path";

describe("resolveLaunchProjectPathCandidate", () => {
  it("returns null for missing launch path", async () => {
    const result = await resolveLaunchProjectPathCandidate(null, {
      platform: "linux",
      isDirectory: async () => true,
      toWslPath: async () => "/mnt/c/Users/Angad",
    });

    expect(result).toBeNull();
  });

  it("keeps a directly valid directory path", async () => {
    const result = await resolveLaunchProjectPathCandidate("/home/angad/projects/pi-studio", {
      platform: "linux",
      isDirectory: async (targetPath) => targetPath === "/home/angad/projects/pi-studio",
      toWslPath: async () => null,
    });

    expect(result).toBe("/home/angad/projects/pi-studio");
  });

  it("translates Windows paths to WSL paths on linux", async () => {
    const toWslPath = vi.fn(async (windowsPath: string) =>
      windowsPath === "C:\\Users\\Angad\\Desktop" ? "/mnt/c/Users/Angad/Desktop" : null,
    );

    const result = await resolveLaunchProjectPathCandidate("C:\\Users\\Angad\\Desktop", {
      platform: "linux",
      isDirectory: async (targetPath) => targetPath === "/mnt/c/Users/Angad/Desktop",
      toWslPath,
    });

    expect(result).toBe("/mnt/c/Users/Angad/Desktop");
    expect(toWslPath).toHaveBeenCalledWith("C:\\Users\\Angad\\Desktop");
  });

  it("does not try WSL translation on non-linux platforms", async () => {
    const toWslPath = vi.fn(async () => "/mnt/c/Users/Angad/Desktop");

    const result = await resolveLaunchProjectPathCandidate("C:\\Users\\Angad\\Desktop", {
      platform: "win32",
      isDirectory: async () => false,
      toWslPath,
    });

    expect(result).toBeNull();
    expect(toWslPath).not.toHaveBeenCalled();
  });

  it("returns null when translated path is not a directory", async () => {
    const result = await resolveLaunchProjectPathCandidate("C:\\Users\\Angad\\Desktop", {
      platform: "linux",
      isDirectory: async () => false,
      toWslPath: async () => "/mnt/c/Users/Angad/Desktop",
    });

    expect(result).toBeNull();
  });
});
