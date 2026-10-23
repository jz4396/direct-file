import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildInputs } from './buildInputs.js';
import { findAllScreensArtifacts } from './productionBuildCheck.js';

describe(`build inputs`, () => {
  const root = `/app`;

  it.each([`production`, `static`])(`%s builds ship only the app page`, (mode) => {
    expect(buildInputs(root, mode)).toEqual({ main: path.resolve(root, `index.html`) });
  });

  it(`development builds keep the all-screens page`, () => {
    expect(buildInputs(root, `development`)).toEqual({
      main: path.resolve(root, `index.html`),
      'all-screens': path.resolve(root, `all-screens/index.html`),
    });
  });
});

describe(`findAllScreensArtifacts`, () => {
  let outDir: string;

  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), `df-build-check-`));
    fs.mkdirSync(path.join(outDir, `assets`));
    fs.writeFileSync(path.join(outDir, `index.html`), `<html></html>`);
    fs.writeFileSync(path.join(outDir, `assets`, `main-abc123.js`), ``);
  });

  afterEach(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it(`passes an app-only build`, () => {
    expect(findAllScreensArtifacts(outDir)).toEqual([]);
  });

  it(`flags the all-screens page directory`, () => {
    fs.mkdirSync(path.join(outDir, `all-screens`));
    fs.writeFileSync(path.join(outDir, `all-screens`, `index.html`), `<html></html>`);
    expect(findAllScreensArtifacts(outDir)).toEqual([`all-screens/`]);
  });

  it(`flags all-screens chunks`, () => {
    fs.writeFileSync(path.join(outDir, `assets`, `all-screens-def456.js`), ``);
    fs.writeFileSync(path.join(outDir, `assets`, `AllScreensContent-789abc.js`), ``);
    expect(findAllScreensArtifacts(outDir)).toEqual([
      `assets/AllScreensContent-789abc.js`,
      `assets/all-screens-def456.js`,
    ]);
  });
});
