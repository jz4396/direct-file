#!/usr/bin/env node
// Fail-closed dependency gate.
// npm ci --ignore-scripts, then npm audit --audit-level=high, then OSV-Scanner
// over every tracked package-lock.json and Maven pom. Findings fail unless the
// reviewed allowlist matches the scan exactly.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCAN_TARGETS = path.join(ROOT, ".github/security/scan-targets.txt");
const NPM_ALLOWLIST = path.join(ROOT, ".github/security/npm-audit-allowlist.txt");
const OSV_ALLOWLIST = path.join(ROOT, ".github/security/osv-allowlist.txt");
const NPM_CI_ARGS = ["ci", "--ignore-scripts", "--no-audit", "--no-fund"];
const NPM_AUDIT_ARGS = ["audit", "--audit-level=high", "--json"];
const OSV_ARGS_PREFIX = ["scan", "source", "--verbosity", "info", "--format", "json"];
const INTERNAL_GROUP = /^gov\.irs\.(?:directfile(?:\.[a-z0-9]+)*|factgraph)$/;

class GateError extends Error {}

function fail(message) {
  throw new GateError(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
    cwd: ROOT,
    env: {
      ...process.env,
      PATH: `/tmp/ci-scanners/bin:${process.env.PATH || ""}`,
    },
    ...options,
  });
  if (result.error) {
    fail(`${command} failed to start: ${result.error.message}`);
  }
  return result;
}

function readText(file) {
  if (!existsSync(file)) fail(`required file is missing: ${path.relative(ROOT, file)}`);
  return readFileSync(file, "utf8");
}

function readLines(file) {
  return readText(file)
    .split("\n")
    .map((line) => line.trim().replace(/\r$/, ""))
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function trackedScanTargets() {
  const result = run("git", ["-C", ROOT, "ls-files", "-z"]);
  if (result.status !== 0) {
    fail(`git ls-files failed: ${(result.stderr || "").trim()}`);
  }
  return result.stdout
    .split("\0")
    .filter(
      (file) =>
        file.endsWith("/pom.xml") ||
        file.endsWith("/package-lock.json") ||
        file === "pom.xml" ||
        file === "package-lock.json",
    )
    .sort();
}

function manifestTargets() {
  const lines = readLines(SCAN_TARGETS);
  const seen = new Set();
  for (const line of lines) {
    if (seen.has(line)) fail(`duplicate scan target: ${line}`);
    seen.add(line);
    if (!line.endsWith("/pom.xml") && !line.endsWith("/package-lock.json")) {
      fail(`scan target is not a pom.xml or package-lock.json: ${line}`);
    }
  }
  return lines.sort();
}

function verifyTargets() {
  const tracked = trackedScanTargets();
  const listed = manifestTargets();
  const trackedSet = new Set(tracked);
  const listedSet = new Set(listed);
  const missing = tracked.filter((file) => !listedSet.has(file));
  const stale = listed.filter((file) => !trackedSet.has(file));
  if (missing.length > 0 || stale.length > 0) {
    const lines = ["scan target list does not match tracked lockfiles and poms; failing closed."];
    if (missing.length > 0) lines.push(`MISSING:\n${missing.join("\n")}`);
    if (stale.length > 0) lines.push(`STALE:\n${stale.join("\n")}`);
    fail(lines.join("\n"));
  }
  if (listed.length === 0) fail("scan target list is empty; failing closed");
  return listed;
}

function npmProjects(targets) {
  const projects = [];
  for (const target of targets) {
    if (!target.endsWith("package-lock.json")) continue;
    const dir = path.posix.dirname(target);
    const packageJson = path.join(ROOT, dir, "package.json");
    if (existsSync(packageJson)) projects.push(dir);
  }
  if (projects.length === 0) {
    fail("no package.json next to a package-lock.json; failing closed");
  }
  return projects;
}

function assertSingleField(value, label) {
  if (typeof value !== "string" || value.length === 0 || /[\t\r\n]/.test(value)) {
    fail(`${label} is missing or not a single field`);
  }
}

function parseNpmAudit(parsed, project) {
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`npm audit JSON for ${project} was not an object`);
  }
  if (parsed.error) {
    const summary = parsed.error.summary || parsed.error.code || "unknown error";
    fail(`npm audit for ${project} returned an error: ${summary}`);
  }
  if (parsed.vulnerabilities == null || typeof parsed.vulnerabilities !== "object") {
    fail(`npm audit JSON for ${project} has no vulnerabilities object`);
  }
  const keys = [];
  for (const [name, info] of Object.entries(parsed.vulnerabilities)) {
    assertSingleField(name, `package name in ${project}`);
    const severity = info && info.severity;
    if (severity !== "high" && severity !== "critical") continue;
    if (!Array.isArray(info.via)) fail(`npm audit entry ${project} ${name} has no via array`);
    const ids = new Set();
    for (const via of info.via) {
      if (typeof via === "string") {
        assertSingleField(via, `via name for ${project} ${name}`);
        if (via.includes(",")) fail(`via name for ${project} ${name} cannot be encoded`);
        ids.add(`via:${via}`);
      } else if (via && typeof via === "object") {
        if (via.severity !== "high" && via.severity !== "critical") continue;
        if (via.source === undefined || via.source === null) {
          fail(`high advisory for ${project} ${name} has no source id`);
        }
        const source = String(via.source);
        assertSingleField(source, `advisory id for ${project} ${name}`);
        if (source.includes(",")) fail(`advisory id for ${project} ${name} cannot be encoded`);
        ids.add(source);
      } else {
        fail(`unexpected via entry for ${project} ${name}`);
      }
    }
    if (ids.size === 0) {
      fail(`high or critical package ${project} ${name} produced no advisory id`);
    }
    keys.push(`${project}\t${name}\t${severity}\t${[...ids].sort().join(",")}`);
  }
  const meta = parsed.metadata && parsed.metadata.vulnerabilities;
  if (!meta) fail(`npm audit JSON for ${project} has no metadata.vulnerabilities`);
  const expected = Number(meta.high || 0) + Number(meta.critical || 0);
  if (keys.length !== expected) {
    fail(
      `parsed ${keys.length} high/critical packages for ${project} but npm metadata reports ${expected}`,
    );
  }
  return keys;
}

function diffAllowlist(actualKeys, allowText) {
  const actual = new Set(actualKeys);
  const allowed = new Set();
  for (const raw of allowText.split("\n")) {
    const line = raw.trim().replace(/\r$/, "");
    if (!line || line.startsWith("#")) continue;
    if (allowed.has(line)) fail(`duplicate allowlist line: ${line}`);
    allowed.add(line);
  }
  return {
    missing: [...actual].filter((key) => !allowed.has(key)).sort(),
    stale: [...allowed].filter((key) => !actual.has(key)).sort(),
  };
}

function reportDiff(kind, diff) {
  if (diff.missing.length === 0 && diff.stale.length === 0) {
    return;
  }
  const lines = [`${kind} allowlist does not match the scan; failing closed.`];
  if (diff.missing.length > 0) {
    lines.push(`MISSING ${diff.missing.length} (in the scan, not in the allowlist):`);
    lines.push(...diff.missing);
  }
  if (diff.stale.length > 0) {
    lines.push(`STALE ${diff.stale.length} (in the allowlist, not in the scan):`);
    lines.push(...diff.stale);
  }
  fail(lines.join("\n"));
}

function npmCi() {
  const projects = npmProjects(verifyTargets());
  for (const project of projects) {
    const result = run("npm", NPM_CI_ARGS, {
      cwd: path.join(ROOT, project),
      stdio: "inherit",
    });
    if (result.status !== 0) {
      fail(`npm ci --ignore-scripts failed in ${project}; failing closed`);
    }
    const marker = path.join(ROOT, project, "node_modules/.package-lock.json");
    if (!existsSync(marker)) {
      fail(`npm ci did not write node_modules in ${project}; failing closed`);
    }
  }
}

function collectNpmFindings(requireInstall) {
  const projects = npmProjects(verifyTargets());
  const keys = [];
  for (const project of projects) {
    if (requireInstall) {
      const marker = path.join(ROOT, project, "node_modules/.package-lock.json");
      if (!existsSync(marker)) {
        fail(`npm ci has not been run in ${project}; failing closed`);
      }
    }
    const result = run("npm", NPM_AUDIT_ARGS, { cwd: path.join(ROOT, project) });
    if (result.status !== 0 && result.status !== 1) {
      fail(
        `npm audit --audit-level=high failed in ${project} with status ${result.status}; failing closed\n${(result.stderr || "").slice(0, 2000)}`,
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      fail(`npm audit --audit-level=high did not return JSON for ${project}; failing closed`);
    }
    keys.push(...parseNpmAudit(parsed, project));
  }
  return keys.sort();
}

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function classifyScannerStderr(stderr, targets) {
  const scanned = new Set();
  for (const raw of stripAnsi(stderr).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const scannedMatch = line.match(/^Scanned (.+) file and found (\d+) packages?$/);
    if (scannedMatch) {
      scanned.add(path.resolve(scannedMatch[1]));
      continue;
    }
    if (
      line.startsWith("Starting filesystem walk") ||
      line.startsWith("End status:") ||
      /^Filtered \d+ local\/unscannable package\/s from the scan\.$/.test(line) ||
      line.startsWith("Warning: enricher transitivedependency/pomxml ")
    ) {
      continue;
    }
    if (!/failed resolution|Error during extraction/.test(line)) {
      fail(`unexpected osv-scanner output: ${line}`);
    }
    const groups = [...line.matchAll(/Maven:([^:\s]+):/g)].map((match) => match[1]);
    if (groups.length === 0 || groups.some((group) => !INTERNAL_GROUP.test(group))) {
      fail(`Maven resolution failed for a coordinate that is not an in-repo module: ${line}`);
    }
  }
  for (const target of targets) {
    const absolute = path.resolve(ROOT, target);
    if (!scanned.has(absolute)) {
      fail(`osv-scanner did not report a scan of ${target}`);
    }
  }
  return scanned;
}

function parseOsv(parsed) {
  if (!parsed || !Array.isArray(parsed.results)) {
    fail("osv-scanner JSON has no results array");
  }
  const keys = [];
  for (const result of parsed.results) {
    const source = result && result.source && result.source.path;
    if (typeof source !== "string" || source.length === 0) {
      if ((result.packages || []).some((pkg) => (pkg.vulnerabilities || []).length > 0)) {
        fail("OSV result with vulnerabilities has no source path");
      }
      continue;
    }
    const relative = path.relative(ROOT, source);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      fail(`OSV source is outside the repository: ${source}`);
    }
    const rel = relative.split(path.sep).join("/");
    for (const pkg of result.packages || []) {
      const info = pkg.package || {};
      const vulns = pkg.vulnerabilities || [];
      const ids = new Set(vulns.map((vuln) => vuln.id));
      for (const group of pkg.groups || []) {
        for (const id of group.ids || []) {
          if (!ids.has(id)) {
            fail(`OSV group id ${id} was not listed as a vulnerability for ${info.name || rel}`);
          }
        }
      }
      if (vulns.length === 0) continue;
      assertSingleField(info.ecosystem, `OSV ecosystem for ${rel}`);
      assertSingleField(info.name, `OSV package name for ${rel}`);
      assertSingleField(String(info.version), `OSV version for ${rel}`);
      for (const vuln of vulns) {
        assertSingleField(vuln.id, `OSV vulnerability id for ${rel}`);
        keys.push([rel, vuln.id, info.ecosystem, info.name, info.version].join("\t"));
      }
    }
  }
  return keys.sort();
}

function collectOsvFindings(targets) {
  if (!existsSync("/tmp/ci-scanners/bin/osv-scanner")) {
    fail("osv-scanner is not installed; failing closed");
  }
  const outputFile = path.join(tmpdir(), `osv-scan-${process.pid}.json`);
  try {
    const result = run("osv-scanner", [...OSV_ARGS_PREFIX, "--output-file", outputFile, ...targets.flatMap((target) => ["-L", target])]);
    if (![0, 1, 127].includes(result.status)) {
      fail(
        `osv-scanner exited ${result.status}; failing closed\n${(result.stderr || "").slice(0, 2000)}`,
      );
    }
    classifyScannerStderr(result.stderr || "", targets);
    if (!existsSync(outputFile)) fail("osv-scanner did not write a JSON report; failing closed");
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(outputFile, "utf8"));
    } catch {
      fail("osv-scanner JSON report did not parse; failing closed");
    }
    return parseOsv(parsed);
  } finally {
    if (existsSync(outputFile)) unlinkSync(outputFile);
  }
}

function npmAudit() {
  const keys = collectNpmFindings(true);
  reportDiff("npm audit", diffAllowlist(keys, readText(NPM_ALLOWLIST)));
  console.log(`npm audit --audit-level=high matched the allowlist (${keys.length} high or critical findings)`);
}

function osv() {
  const targets = verifyTargets();
  const keys = collectOsvFindings(targets);
  reportDiff("OSV-Scanner", diffAllowlist(keys, readText(OSV_ALLOWLIST)));
  console.log(`OSV-Scanner matched the allowlist (${keys.length} findings)`);
}

function printNpm() {
  process.stdout.write(`${collectNpmFindings(false).join("\n")}\n`);
}

function printOsv() {
  process.stdout.write(`${collectOsvFindings(verifyTargets()).join("\n")}\n`);
}

function selfTest() {
  const audit = {
    vulnerabilities: {
      left: {
        severity: "high",
        via: [
          { severity: "high", source: 10 },
          { severity: "low", source: 2 },
        ],
      },
      right: { severity: "moderate", via: [{ severity: "moderate", source: 3 }] },
      child: { severity: "critical", via: ["left"] },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 1, critical: 1, total: 2 } },
  };
  const keys = parseNpmAudit(audit, "app").sort();
  if (keys.join("\n") !== "app\tchild\tcritical\tvia:left\napp\tleft\thigh\t10") {
    fail(`npm audit parser mismatch: ${keys.join(" | ")}`);
  }
  let threw = false;
  try {
    parseNpmAudit(
      {
        vulnerabilities: { bare: { severity: "high", via: [{ severity: "moderate", source: 1 }] } },
        metadata: { vulnerabilities: { high: 1, critical: 0 } },
      },
      "app",
    );
  } catch (error) {
    if (!(error instanceof GateError)) throw error;
    threw = true;
  }
  if (!threw) fail("high package without an advisory id was accepted");

  const same = diffAllowlist(["b", "a"], "# comment\n\na\nb\n");
  if (same.missing.length !== 0 || same.stale.length !== 0) fail("exact allowlist was rejected");
  const drift = diffAllowlist(["a", "c"], "a\nb\n");
  if (drift.missing.join() !== "c" || drift.stale.join() !== "b") fail("allowlist diff was wrong");

  const stderr = [
    "Starting filesystem walk for root: /",
    `Scanned ${path.resolve(ROOT, "direct-file/backend/pom.xml")} file and found 1 package`,
    "Filtered 2 local/unscannable package/s from the scan.",
    "Warning: enricher transitivedependency/pomxml may be risky when run on untrusted artifacts.",
    "failed resolution for direct-file/backend/pom.xml: version Maven:gov.irs.directfile:data-models[Concrete:0.0.1-SNAPSHOT]: not found",
    "End status: 0 dirs visited",
  ].join("\n");
  classifyScannerStderr(stderr, ["direct-file/backend/pom.xml"]);
  threw = false;
  try {
    classifyScannerStderr(
      `${stderr}\nfailed resolution Maven:org.springframework:spring-core: not found`,
      ["direct-file/backend/pom.xml"],
    );
  } catch (error) {
    if (!(error instanceof GateError)) throw error;
    threw = true;
  }
  if (!threw) fail("a public Maven resolution failure was accepted");
  threw = false;
  try {
    classifyScannerStderr("something else went wrong", ["direct-file/backend/pom.xml"]);
  } catch (error) {
    if (!(error instanceof GateError)) throw error;
    threw = true;
  }
  if (!threw) fail("unexpected scanner output was accepted");

  const osvParsed = parseOsv({
    results: [
      {
        source: { path: path.join(ROOT, "direct-file/backend/pom.xml") },
        packages: [
          {
            package: { ecosystem: "Maven", name: "com.example:demo", version: "1.2.3" },
            groups: [{ ids: ["GHSA-example"] }],
            vulnerabilities: [{ id: "GHSA-example" }],
          },
        ],
      },
    ],
  });
  if (osvParsed.join("\n") !== "direct-file/backend/pom.xml\tGHSA-example\tMaven\tcom.example:demo\t1.2.3") {
    fail(`OSV parser mismatch: ${osvParsed.join(" | ")}`);
  }
  threw = false;
  try {
    parseOsv({
      results: [
        {
          source: { path: path.join(ROOT, "direct-file/backend/pom.xml") },
          packages: [
            {
              package: { ecosystem: "Maven", name: "com.example:demo", version: "1.2.3" },
              groups: [{ ids: ["GHSA-missing"] }],
              vulnerabilities: [],
            },
          ],
        },
      ],
    });
  } catch (error) {
    if (!(error instanceof GateError)) throw error;
    threw = true;
  }
  if (!threw) fail("an OSV group id with no vulnerability was accepted");

  if (NPM_CI_ARGS.join(" ") !== "ci --ignore-scripts --no-audit --no-fund") {
    fail("npm ci arguments drifted");
  }
  if (NPM_AUDIT_ARGS.join(" ") !== "audit --audit-level=high --json") {
    fail("npm audit arguments drifted");
  }
  if (OSV_ARGS_PREFIX.includes("--call-analysis")) fail("OSV call analysis must stay disabled");
  console.log("dependency-audit self-test passed");
}

const command = process.argv[2];
try {
  switch (command) {
    case "self-test":
      selfTest();
      break;
    case "verify-targets":
      console.log(`scan targets matched (${verifyTargets().length} files)`);
      break;
    case "npm-ci":
      npmCi();
      break;
    case "npm-audit":
      npmAudit();
      break;
    case "osv":
      osv();
      break;
    case "print-npm-findings":
      printNpm();
      break;
    case "print-osv-findings":
      printOsv();
      break;
    default:
      fail(
        "usage: dependency-audit.mjs [self-test|verify-targets|npm-ci|npm-audit|osv|print-npm-findings|print-osv-findings]",
      );
  }
} catch (error) {
  if (error instanceof GateError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
