import { execFileSync, spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The shell side of the Cloudflare Pages deploy (../cloudflare-pages): build.sh refuses a build environment that
 * holds a Cloudflare credential, and checkNoSecrets.mjs stops a deploy whose staged files contain one (including
 * the exact value of CLOUDFLARE_API_KEY). Neither prints the value. The values here are random and made up at
 * run time. `check-install.sh` is the Pages Git-integration build (`build.sh --install`); run it to install from
 * the lockfile with no lifecycle scripts and require the production-build and staging checks to pass.
 */
const PAGES = path.resolve(__dirname, `../../../cloudflare-pages`);
const fakeValue = () => `test-${crypto.randomBytes(16).toString(`hex`)}`;
const baseEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/^(VITE_|REACT_APP_|CLOUDFLARE_)/.test(k))
  ) as NodeJS.ProcessEnv;

describe(`build.sh`, () => {
  it.each([`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_KEY`])(
    `refuses to build with %s in the environment, printing only its name`,
    (name) => {
      const value = fakeValue();
      const r = spawnSync(`bash`, [path.join(PAGES, `build.sh`)], {
        env: { ...baseEnv(), [name]: value },
        encoding: `utf8`,
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain(name);
      expect(r.stdout + r.stderr).not.toContain(value);
    }
  );

  it(`refuses a VITE_* variable that would override .env.static`, () => {
    const r = spawnSync(`bash`, [path.join(PAGES, `build.sh`)], {
      env: { ...baseEnv(), VITE_BACKEND_URL: `https://api.example.com/df/file/api/` },
      encoding: `utf8`,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(`VITE_BACKEND_URL`);
    expect(r.stdout + r.stderr).not.toContain(`api.example.com`);
  });

  it(`keeps xtrace off and never echoes a credential`, () => {
    for (const f of [`build.sh`, `deploy.sh`, `check-install.sh`]) {
      const script = fs.readFileSync(path.join(PAGES, f), `utf8`);
      expect(script).toMatch(/^set \+x$/m);
      expect(script).not.toMatch(/set -x|echo[^\n]*\$\{?CLOUDFLARE_(API_TOKEN|ACCOUNT_ID|API_KEY)/);
    }
  });

  it(`--install installs from the lockfile without lifecycle scripts, then runs the production checks`, () => {
    const build = fs.readFileSync(path.join(PAGES, `build.sh`), `utf8`);
    const check = fs.readFileSync(path.join(PAGES, `check-install.sh`), `utf8`);
    expect(build).toMatch(/if \[\[ "\$\{1:-\}" == "--install" \]\]; then/);
    const installAt = build.indexOf(`npm ci --ignore-scripts`);
    const prodAt = build.indexOf(`npm run --silent check:production-build`);
    const stageAt = build.indexOf(`npm run --silent stage:static`);
    expect(installAt).toBeGreaterThan(-1);
    expect(prodAt).toBeGreaterThan(installAt);
    expect(stageAt).toBeGreaterThan(prodAt);
    expect(check).toContain(`"$HERE/build.sh" --install`);
  });
});

describe(`checkNoSecrets.mjs`, () => {
  let dir = ``;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (files: Record<string, string>, env: NodeJS.ProcessEnv) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), `pages-secrets-`));
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    }
    return spawnSync(process.execPath, [path.join(PAGES, `checkNoSecrets.mjs`), dir], {
      env: { ...baseEnv(), ...env },
      encoding: `utf8`,
    });
  };

  it(`passes a site without credentials`, () => {
    const r = run({ 'index.html': `<html></html>`, 'df/file/assets/a.js': `x` }, { CLOUDFLARE_API_TOKEN: fakeValue() });
    expect(r.status).toBe(0);
  });

  it.each([`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_KEY`])(
    `fails when a staged file holds the value of %s, naming the file only`,
    (name) => {
      const value = fakeValue();
      const r = run({ 'index.html': `<html></html>`, 'df/file/assets/a.js': `const k="${value}";` }, { [name]: value });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(path.join(`df`, `file`, `assets`, `a.js`));
      expect(r.stdout + r.stderr).not.toContain(value);
    }
  );

  it(`fails on a prefixed Cloudflare token even without the credentials in the environment`, () => {
    const token = [`cf`, `at_`, crypto.randomBytes(20).toString(`hex`)].join(``);
    const r = run({ 'robots.txt': token }, {});
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).not.toContain(token);
  });

  it(`is plain Node.js with no dependencies`, () => {
    const text = fs.readFileSync(path.join(PAGES, `checkNoSecrets.mjs`), `utf8`);
    const imports = [...text.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual([`fs`, `path`]);
    expect(execFileSync(process.execPath, [`--check`, path.join(PAGES, `checkNoSecrets.mjs`)]).toString()).toBe(``);
  });
});

describe(`checkNoContainers.mjs`, () => {
  let dir = ``;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = ``;
  });

  const run = (files: Record<string, string>) => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), `pages-containers-`));
    for (const [name, text] of Object.entries(files)) {
      const dest = path.join(dir, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text);
    }
    return spawnSync(process.execPath, [path.join(PAGES, `checkNoContainers.mjs`), dir], { encoding: `utf8` });
  };

  it(`accepts this repository: static Pages on the free plan, JVM and PDF on local Docker`, () => {
    const script = path.join(PAGES, `checkNoContainers.mjs`);
    const r = spawnSync(process.execPath, [script, path.resolve(PAGES, `../../..`)], {
      encoding: `utf8`,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`does not use Cloudflare Containers`);
    expect(r.stderr).toBe(``);
  });

  it(`rejects a wrangler.toml containers binding and names the file`, () => {
    const r = run({ 'wrangler.toml': `name = "demo"\n[[containers]]\nimage = "./Dockerfile"\n` });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`wrangler.toml`);
    expect(r.stderr).toContain(`containers binding`);
    expect(r.stderr).toContain(`Cloudflare Pages free plan`);
    expect(r.stderr).toContain(`local Docker`);
  });

  it(`rejects a wrangler.json containers key`, () => {
    const r = run({ 'app/wrangler.json': `{"containers":[{"image":"./Dockerfile"}]}\n` });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(path.join(`app`, `wrangler.json`));
  });

  it(`rejects a package.json dependency on the Containers SDK`, () => {
    const sdk = [`@cloudflare`, `containers`].join(`/`);
    const r = run({ 'package.json': `{"dependencies":{"${sdk}":"0.0.0"}}\n` });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`package.json`);
    expect(r.stderr).toContain(sdk);
  });

  it(`rejects a workflow that runs a Containers command`, () => {
    const r = run({
      '.github/workflows/containers.yml': `jobs:\n  build:\n    steps:\n      - run: npx wrangler containers build\n`,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`containers.yml`);
    expect(r.stderr).toContain(`wrangler containers command`);
  });

  it(`rejects a push to the Cloudflare container registry`, () => {
    const r = run({ 'push.sh': `docker push registry.cloudflare.com/example/app:1\n` });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`push.sh`);
    expect(r.stderr).toContain(`container registry`);
  });

  it(`rejects a Worker deploy in a shell script`, () => {
    const r = run({ 'ship.sh': `npx wrangler deploy\n` });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`ship.sh`);
    expect(r.stderr).toContain(`Worker deploy`);
  });

  it(`allows wrangler pages deploy and local docker compose`, () => {
    const r = run({
      'cloudflare-pages/deploy.sh': `./node_modules/.bin/wrangler pages deploy out --project-name demo --branch main\n`,
      'docker-compose.yaml': `services:\n  api:\n    container_name: direct-file-api\n`,
      'scripts/local-docker.sh': `# local Docker containers for the JVM and PDF stack\n`,
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe(``);
  });

  it(`rejects a Dockerfile on the Pages path and allows one for local JVM services`, () => {
    const banned = run({ 'direct-file/df-client/cloudflare-pages/Dockerfile': `FROM scratch\n` });
    expect(banned.status).toBe(1);
    expect(banned.stderr).toContain(`Dockerfile`);
    const allowed = run({ 'direct-file/backend/Dockerfile-local': `FROM eclipse-temurin:17\n` });
    expect(allowed.status).toBe(0);
  });

  it(`is invoked by build.sh and deploy.sh before a Pages upload`, () => {
    const build = fs.readFileSync(path.join(PAGES, `build.sh`), `utf8`);
    const deploy = fs.readFileSync(path.join(PAGES, `deploy.sh`), `utf8`);
    expect(build).toContain(`checkNoContainers.mjs`);
    expect(build.indexOf(`checkNoContainers.mjs`)).toBeLessThan(build.indexOf(`generate-fact-dictionary`));
    expect(deploy.indexOf(`checkNoContainers.mjs`)).toBeGreaterThan(-1);
    expect(deploy.indexOf(`checkNoContainers.mjs`)).toBeLessThan(deploy.indexOf(`pages deploy "$OUT"`));
  });

  it(`documents the free-plan boundary and the CI workflow does not deploy`, () => {
    const readme = fs.readFileSync(path.join(PAGES, `README.md`), `utf8`);
    expect(readme).toContain(`## Cloudflare Containers are not part of Phase A`);
    expect(readme).toContain(`does not require paid Cloudflare Containers`);
    expect(readme).toContain(`checkNoContainers.mjs`);
    expect(readme).toContain(`free plan`);
    expect(readme).toContain(`local Docker`);
    const workflow = fs.readFileSync(
      path.resolve(PAGES, `../../../.github/workflows/no-cloudflare-containers.yml`),
      `utf8`
    );
    expect(workflow).toContain(`checkNoContainers.mjs`);
    expect(workflow).not.toMatch(/\bwrangler\b/);
    expect(workflow).not.toContain(`pages deploy`);
  });

  it(`is plain Node.js with no dependencies`, () => {
    const text = fs.readFileSync(path.join(PAGES, `checkNoContainers.mjs`), `utf8`);
    const imports = [...text.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual([`fs`, `path`]);
    expect(execFileSync(process.execPath, [`--check`, path.join(PAGES, `checkNoContainers.mjs`)]).toString()).toBe(``);
  });

  it(`exits 2 when the directory argument is missing`, () => {
    const script = path.join(PAGES, `checkNoContainers.mjs`);
    const missing = path.join(os.tmpdir(), `missing-pages-root`);
    const r = spawnSync(process.execPath, [script, missing], {
      encoding: `utf8`,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(`usage:`);
  });
});
