import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * No credential is committed: no Cloudflare API key or token (prefixed cfk_/cfut_/cfat_/cfoat_) in any tracked
 * file, and no Cloudflare credential variable assigned a literal value. Docs show `export CLOUDFLARE_API_TOKEN=...`
 * and scripts read `${CLOUDFLARE_API_TOKEN}`; both are allowed.
 */
const REPO = path.resolve(__dirname, `../../../../..`);

export const COMMITTED_SECRET_PATTERNS: [RegExp, string][] = [
  [/\bcf(?:k|ut|at|oat)_[A-Za-z0-9]{40}/, `a Cloudflare API key or token`],
  [
    /\b(?:CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID|API_KEY)|CF_API_TOKEN)\s*[=:]\s*["']?[A-Za-z0-9_-]{16,}/,
    `a Cloudflare credential assigned a literal value`,
  ],
];

function trackedFiles(): string[] {
  try {
    return execFileSync(`git`, [`ls-files`, `-z`], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
      .toString()
      .split(`\0`)
      .filter(Boolean);
  } catch {
    // Not a git checkout (for example a build context without .git): scan the client and the Pages directory.
    const walk = (dir: string): string[] =>
      fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((e) => {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) return /^(node_modules|dist.*|out|generated|\.git)$/.test(e.name) ? [] : walk(rel);
        return [rel];
      });
    return walk(path.join(`direct-file`, `df-client`));
  }
}

describe(`committed files`, () => {
  it(`hold no Cloudflare token and no literal Cloudflare credential`, () => {
    const files = trackedFiles();
    expect(files.length).toBeGreaterThan(100);
    const found: string[] = [];
    for (const f of files) {
      const p = path.join(REPO, f);
      if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
      const text = fs.readFileSync(p).toString(`latin1`);
      for (const [re, what] of COMMITTED_SECRET_PATTERNS) if (re.test(text)) found.push(`${f}: ${what}`);
    }
    expect(found).toEqual([]);
  });

  it(`catches the shapes it is meant to catch`, () => {
    const token = [`cf`, `ut_`, `Ab12`.repeat(10)].join(``);
    const samples = [token, `CLOUDFLARE_API_TOKEN=${`Zz9`.repeat(8)}`, `CLOUDFLARE_ACCOUNT_ID: "${`0f`.repeat(16)}"`];
    for (const s of samples)
      expect(
        COMMITTED_SECRET_PATTERNS.some(([re]) => re.test(s)),
        s
      ).toBe(true);
    for (const s of [
      `export CLOUDFLARE_API_TOKEN=...`,
      `"\${CLOUDFLARE_API_TOKEN:-}"`,
      `env -u CLOUDFLARE_API_TOKEN`,
    ]) {
      expect(
        COMMITTED_SECRET_PATTERNS.some(([re]) => re.test(s)),
        s
      ).toBe(false);
    }
  });
});
