import fs from 'fs';
import path from 'path';

const ALL_SCREENS_PATTERN = /all-?screens/i;

/** Returns the paths (relative to `outDir`) of any all-screens page, directory or chunk in a build output. */
export function findAllScreensArtifacts(outDir: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(outDir, full).split(path.sep).join(`/`);
      if (ALL_SCREENS_PATTERN.test(entry.name)) {
        found.push(entry.isDirectory() ? `${relative}/` : relative);
      }
      if (entry.isDirectory()) {
        walk(full);
      }
    }
  };
  walk(outDir);
  return found.sort();
}

/**
 * Returns the reasons a build output must not ship: a missing output directory, or any all-screens artifact in it.
 * An empty list means the output passed. Shared by the post-build check (checkProductionBuildCli.ts) and the static
 * site staging step (stageStaticSite.ts), so the check still runs when npm skips lifecycle scripts.
 */
export function productionBuildProblems(outDir: string): string[] {
  if (!fs.existsSync(outDir)) return [`${outDir} does not exist`];
  const artifacts = findAllScreensArtifacts(outDir);
  return artifacts.length ? [`the all-screens development view is in ${outDir}: ${artifacts.join(`, `)}`] : [];
}
