import path from 'path';
import { OUT, stageStaticSite } from './stageStaticSite.js';

// `npm run stage:static`: stage dist-static/ for Cloudflare Pages and fail on any no-network check problem.
const problems = stageStaticSite();
if (problems.length) {
  console.error(`Static bundle check failed:\n- ${problems.join(`\n- `)}`);
  process.exit(1);
}
console.log(`Static bundle staged at ${path.relative(process.cwd(), OUT)} and passed the no-network checks.`);
