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
