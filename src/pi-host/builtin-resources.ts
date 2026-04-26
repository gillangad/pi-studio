import { mkdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import {
  PI_STUDIO_BUILTIN_EXTENSIONS,
  PI_STUDIO_BUILTIN_SKILLS,
} from "../builtins/pi-studio-builtins";

type PiStudioBuiltinResources = {
  extensionFactories: ExtensionFactory[];
  additionalExtensionPaths: string[];
  additionalSkillPaths: string[];
};

const MATERIALIZED_ROOT = path.join(os.homedir(), ".pi-studio", "builtins", "materialized");
const INLINE_SKILL_ROOT = path.join(MATERIALIZED_ROOT, "skills-inline");

let cachedResourcesPromise: Promise<PiStudioBuiltinResources> | null = null;

function sanitizeSkillId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "skill";

  const normalized = trimmed
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  return normalized || "skill";
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findBundledBuiltinsRoot() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "..", "..", "src", "builtins"),
    path.resolve(moduleDir, "builtins"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function materializeInlineBuiltinSkills() {
  if (PI_STUDIO_BUILTIN_SKILLS.length === 0) {
    return [] as string[];
  }

  await mkdir(INLINE_SKILL_ROOT, { recursive: true });

  for (const skill of PI_STUDIO_BUILTIN_SKILLS) {
    const skillId = sanitizeSkillId(skill.id);
    const skillDir = path.join(INLINE_SKILL_ROOT, skillId);
    const skillFile = path.join(skillDir, "SKILL.md");

    await mkdir(skillDir, { recursive: true });
    await writeFile(skillFile, skill.markdown, "utf8");
  }

  return [INLINE_SKILL_ROOT];
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}

export function getPiStudioBuiltinResources() {
  if (!cachedResourcesPromise) {
    cachedResourcesPromise = (async () => {
      const root = await findBundledBuiltinsRoot();
      const extensionDir = root ? path.join(root, "extensions") : null;
      const skillDir = root ? path.join(root, "skills") : null;

      const additionalExtensionPaths =
        extensionDir && (await pathExists(extensionDir)) ? [extensionDir] : [];
      const additionalSkillPaths =
        skillDir && (await pathExists(skillDir)) ? [skillDir] : [];

      const inlineSkillPaths = await materializeInlineBuiltinSkills();

      return {
        extensionFactories: [...PI_STUDIO_BUILTIN_EXTENSIONS],
        additionalExtensionPaths: dedupe(additionalExtensionPaths),
        additionalSkillPaths: dedupe([...additionalSkillPaths, ...inlineSkillPaths]),
      };
    })();
  }

  return cachedResourcesPromise;
}
