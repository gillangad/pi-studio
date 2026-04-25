import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

export type PiStudioBuiltinSkill = {
  /** Stable identifier used for on-disk materialization */
  id: string;
  /** Full markdown content, usually with skill frontmatter */
  markdown: string;
};

/**
 * Directory-based builtins:
 * - place extension files under src/builtins/extensions/**
 * - place skills under src/builtins/skills/** (SKILL.md trees or top-level .md)
 *
 * These are loaded only for Pi Studio builtin-enabled threads.
 */

/**
 * Optional programmatic extension factories, loaded in addition to directory
 * builtins for builtin-enabled Pi Studio threads.
 */
export const PI_STUDIO_BUILTIN_EXTENSIONS: ExtensionFactory[] = [];

/**
 * Optional inline skills, materialized on disk and loaded in addition to
 * directory builtins for builtin-enabled Pi Studio threads.
 */
export const PI_STUDIO_BUILTIN_SKILLS: PiStudioBuiltinSkill[] = [];
