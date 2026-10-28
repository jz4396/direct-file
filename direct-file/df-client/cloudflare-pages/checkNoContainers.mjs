// Fails closed if this tree would deploy Cloudflare Containers.
//
// Phase A publishes the public client as static files on the Cloudflare Pages free plan
// (wrangler pages deploy, or the Git-integration build). The JVM and PDF stack runs in
// local Docker (docker compose on the machine running the stack). Cloudflare Containers
// attaches a container image to a Worker and is not part of that Pages plan. This script
// stops the build and the upload when the tree declares or invokes it.
//
//   node checkNoContainers.mjs [repo-root]
//
// Exit 0 when the tree stays on static Pages. Exit 1 and print each path when it does not.
// Exit 2 when the directory argument is missing. Plain Node.js, no dependencies.
import fs from 'fs';
import path from 'path';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'dist-static',
  'target',
  'build',
  'coverage',
  'generated',
]);

const WRANGLER_CONFIG = new Set(['wrangler.toml', 'wrangler.json', 'wrangler.jsonc']);

// Wrangler config only. A containers table or key is the binding that ships an image.
const CONFIG_PATTERNS = [
  [/^\s*\[\[?\s*containers\s*\]\]?\s*$/m, 'a containers binding'],
  [/^\s*containers\s*=/, 'a containers assignment'],
  [/["']containers["']\s*:/, 'a "containers" key'],
];

// Shell scripts, GitHub workflows, and the Pages directory. "wrangler pages deploy" does not match.
const COMMAND_PATTERNS = [
  [/\bwrangler(?:\.js)?\s+containers\b/, 'a wrangler containers command'],
  [/\bwrangler(?:\.js)?\s+deploy\b/, 'a Worker deploy (wrangler deploy)'],
  [/@cloudflare\/containers\b/, 'the Containers SDK'],
  [/registry\.cloudflare\.com/, 'the Cloudflare container registry'],
];

const FAIL_CLOSED =
  'Phase A does not use Cloudflare Containers. The public client is static files on the Cloudflare Pages free plan. ' +
  'The JVM and PDF stack runs in local Docker, not on Cloudflare. ' +
  'Remove the configuration below before deploying:';

function readText(abs) {
  return fs.readFileSync(abs, 'utf8');
}

function commandHits(text) {
  const hits = [];
  for (const [re, why] of COMMAND_PATTERNS) {
    if (re.test(text)) hits.push(why);
  }
  return hits;
}

function consider(root, abs) {
  const rel = path.relative(root, abs);
  const base = path.basename(abs);
  // This file names the commands it rejects.
  if (base === 'checkNoContainers.mjs') return [];
  const out = [];
  if (WRANGLER_CONFIG.has(base)) {
    const text = readText(abs);
    for (const [re, why] of CONFIG_PATTERNS) {
      if (re.test(text)) out.push(`${rel}: ${why}`);
    }
    for (const why of commandHits(text)) out.push(`${rel}: ${why}`);
    return out;
  }
  if (base === 'package.json') {
    if (readText(abs).includes('@cloudflare/containers')) {
      out.push(`${rel}: depends on @cloudflare/containers`);
    }
    return out;
  }
  const parts = rel.split(path.sep);
  const inPages = parts.includes('cloudflare-pages');
  if (inPages && /^Dockerfile/i.test(base)) {
    out.push(`${rel}: a Dockerfile on the Cloudflare Pages path`);
    return out;
  }
  const inWorkflows = parts[0] === '.github' && parts[1] === 'workflows';
  const scan =
    base.endsWith('.sh') ||
    (inPages && /\.(mjs|js|yml|yaml)$/.test(base)) ||
    (inWorkflows && /\.(yml|yaml|sh)$/.test(base));
  if (!scan) return out;
  for (const why of commandHits(readText(abs))) out.push(`${rel}: ${why}`);
  return out;
}

export function findContainerViolations(root) {
  const violations = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      violations.push(...consider(root, path.join(dir, entry.name)));
    }
  };
  walk(root);
  return violations;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error('usage: node checkNoContainers.mjs [repo-root]');
    process.exit(2);
  }
  const found = findContainerViolations(root);
  if (found.length) {
    console.error(`${FAIL_CLOSED}\n  ${found.join('\n  ')}`);
    process.exit(1);
  }
  console.log('Phase A path does not use Cloudflare Containers.');
}
