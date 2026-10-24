import fs from 'fs';
import os from 'os';
import path from 'path';
import { stageStaticSite } from './stageStaticSite.js';

describe(`stageStaticSite refuses a build with the all-screens view`, () => {
  let root: string;
  let dist: string;
  let out: string;
  let pages: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), `df-stage-`));
    dist = path.join(root, `dist-static`);
    out = path.join(root, `out`);
    pages = path.join(root, `pages`);
    fs.mkdirSync(path.join(dist, `assets`), { recursive: true });
    fs.writeFileSync(path.join(dist, `index.html`), `<html></html>`);
    fs.writeFileSync(path.join(dist, `assets`, `main-abc123.js`), ``);
    fs.mkdirSync(pages);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it(`refuses when the all-screens page directory is present`, () => {
    fs.mkdirSync(path.join(dist, `all-screens`));
    fs.writeFileSync(path.join(dist, `all-screens`, `index.html`), `<html></html>`);
    const problems = stageStaticSite(dist, out, pages);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`all-screens/`);
    expect(fs.existsSync(out)).toBe(false);
  });

  it(`refuses when an all-screens chunk is present, and removes a previously staged site`, () => {
    fs.writeFileSync(path.join(dist, `assets`, `AllScreensContent-789abc.js`), ``);
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, `index.html`), `<html></html>`);
    const problems = stageStaticSite(dist, out, pages);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`assets/AllScreensContent-789abc.js`);
    expect(fs.existsSync(out)).toBe(false);
  });
});
