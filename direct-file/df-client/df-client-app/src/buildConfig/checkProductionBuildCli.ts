/* eslint-disable no-console -- command-line check: its output is the build log. */
import fs from 'fs';
import path from 'path';
import { parseArgs } from 'node:util';
import { findAllScreensArtifacts } from './productionBuildCheck.js';

// Runs after `npm run build` and `npm run build:static`: fails if the all-screens development view reached the output.
const { positionals } = parseArgs({ allowPositionals: true });
const outDir = path.resolve(process.cwd(), positionals[0] ?? `dist`);
if (!fs.existsSync(outDir)) {
  console.error(`Production build check failed: ${path.relative(process.cwd(), outDir)} does not exist.`);
  process.exit(1);
}
const artifacts = findAllScreensArtifacts(outDir);
if (artifacts.length) {
  console.error(
    `Production build check failed: the all-screens development view is in ${path.relative(
      process.cwd(),
      outDir
    )}:\n- ${artifacts.join(`\n- `)}`
  );
  process.exit(1);
}
console.log(`Production build check passed: no all-screens output in ${path.relative(process.cwd(), outDir)}.`);
