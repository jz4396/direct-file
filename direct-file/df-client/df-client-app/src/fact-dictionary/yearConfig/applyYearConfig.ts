/**
 * Writes the values in the tax year parameter file into the fact dictionary XML.
 *
 *   npm run apply-year-config              # current tax year from the registry
 *   npm run apply-year-config -- --check   # exit 1 if the XML differs from the parameter file
 *   npm run apply-year-config -- --year 2026
 */
import fs from 'fs';
import path from 'path';
import {
  FACT_DICTIONARY_XML_FOLDER,
  applyConfig,
  loadTaxYearConfig,
  loadTaxYearRegistry,
  readXmlModules,
  taggedFacts,
  validateConfig,
} from './yearConfig.js';

const args = process.argv.slice(2);
const check = args.includes(`--check`);
const yearArg = args.indexOf(`--year`);
const taxYear = yearArg >= 0 ? Number(args[yearArg + 1]) : loadTaxYearRegistry().currentTaxYear;

const config = loadTaxYearConfig(taxYear);
const modules = readXmlModules();
const changed = applyConfig(config, modules);

if (check) {
  const errors = validateConfig(config, taggedFacts(modules));
  for (const e of errors) {
    // eslint-disable-next-line no-console
    console.error(e);
  }
  for (const file of changed.keys()) {
    // eslint-disable-next-line no-console
    console.error(`${file} differs from the TY${taxYear} parameter file`);
  }
  process.exit(errors.length || changed.size ? 1 : 0);
}

for (const [file, xml] of changed) {
  // nosemgrep: eslint.detect-non-literal-fs-filename
  fs.writeFileSync(path.join(FACT_DICTIONARY_XML_FOLDER, file), xml);
  // eslint-disable-next-line no-console
  console.log(`Updated ${file}`);
}
const errors = validateConfig(config, taggedFacts(readXmlModules()));
for (const e of errors) {
  // eslint-disable-next-line no-console
  console.error(e);
}
process.exit(errors.length ? 1 : 0);
