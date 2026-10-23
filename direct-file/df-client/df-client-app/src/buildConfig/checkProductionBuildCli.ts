/* eslint-disable no-console -- command-line check: its output is the build log. */
import path from 'path';
import { parseArgs } from 'node:util';
import { productionBuildProblems } from './productionBuildCheck.js';

// Runs after `npm run build` and `npm run build:static`, and explicitly from cloudflare-pages/deploy.sh (npm skips
// post-hooks when ignore-scripts is set): fails if the all-screens development view reached the output.
const { positionals } = parseArgs({ allowPositionals: true });
const outDir = path.resolve(process.cwd(), positionals[0] ?? `dist`);
const shown = path.relative(process.cwd(), outDir);
const problems = productionBuildProblems(shown || `.`);
if (problems.length) {
  console.error(`Production build check failed:\n- ${problems.join(`\n- `)}`);
  process.exit(1);
}
console.log(`Production build check passed: no all-screens output in ${shown}.`);
