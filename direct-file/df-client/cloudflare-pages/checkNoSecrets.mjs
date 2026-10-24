// Fails if a staged file contains a deploy credential. Run by deploy.sh right before the upload, with the
// credentials in its environment. Plain Node.js, no dependencies.
//
//   node checkNoSecrets.mjs <dir>
//
// Looks for the exact values of CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (when set) and for Cloudflare's
// prefixed API keys and tokens (cfk_, cfut_, cfat_, cfoat_). Prints only file names, never a value.
import fs from 'fs';
import path from 'path';

const PREFIXED_TOKEN = /\bcf(?:k|ut|at|oat)_[A-Za-z0-9]{40}/;

export function filesWithSecrets(dir, values) {
  const secrets = values.filter((v) => typeof v === 'string' && v.length >= 8);
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const text = fs.readFileSync(p).toString('latin1');
        if (PREFIXED_TOKEN.test(text) || secrets.some((s) => text.includes(s))) found.push(path.relative(dir, p));
      }
    }
  };
  walk(dir);
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) {
    console.error('usage: node checkNoSecrets.mjs <dir>');
    process.exit(2);
  }
  const found = filesWithSecrets(dir, [process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID]);
  if (found.length) {
    console.error(
      `A deploy credential or Cloudflare token is in these staged files; not deploying:\n  ${found.join('\n  ')}`
    );
    process.exit(1);
  }
  console.log('No deploy credential or Cloudflare token in the staged site.');
}
