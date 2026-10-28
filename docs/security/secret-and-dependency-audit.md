# Secret, PII, and dependency audit

Pull requests run `.github/workflows/secret-and-dependency-audit.yml`. Both jobs fail closed: a scanner that does not run, a report that does not parse, or a finding that is not on the reviewed allowlist fails the check.

The workflow uses the default workflow credential with `permissions: contents: read`. It does not set `secrets`, and checkout uses `persist-credentials: false` so the token is not written into the workspace.

## Secret and PII scan

The `gitleaks` job checks out the full pull request history and runs:

```sh
gitleaks detect --log-opts=<base sha>..<head sha>
```

`base..head` is every commit reachable from the pull request head and not from the base. A value that is added and then removed is still in that range. Scanning only the tip would miss it. The job refuses to run when either SHA is missing or is not a full 40-character object id.

Default gitleaks rules stay enabled. Three project rules are added:

| Rule | What it matches |
| --- | --- |
| `ssn-outside-9xx` | Dashed three-two-four numbers whose area is `000`-`899`, including unissued areas `000` and `666` |
| `itin` | Dashed three-two-four numbers whose area is `900`-`999` |
| `ein` | Dashed employer identifiers whose two-digit prefix is an issued prefix |

Area `900`-`999` is not matched by the SSN rule. Unissued EIN prefixes (`07`-`09`, `17`-`19`, `28`-`29`, `49`, `69`, `70`, `78`-`79`, `89`, `96`-`97`) are not matched by the EIN rule.

### Allowlist

The allowlist is in `.gitleaks.toml` and applies only to those three rules. Default secret rules still run on the same paths, so a credential in a test file still fails the job.

Path allowlist, for synthetic identifiers already used in the tree:

- `src/test/` and `src/it/`
- `docs/testing/`
- `direct-file/df-client/df-client-app/src/locales/en.yaml` and `es.yaml` (example identifiers in locale text)
- `direct-file/df-client/df-client-app/src/staticClient/noRetention/` (a golden end-to-end scenario (synthetic data))
- `ExportedFactsClientMock.java` (synthetic identifiers returned by the mock client)

Exact-value allowlist, matched against the value and not the whole file:

- `000-00-0000`, the non-issued sentinel already committed in source. Any other value in that file still fails.
- `92-6001185`, one published identifier already committed in source. Any other EIN still fails.

A new value outside those paths and values fails the job. Adding a path or a value is a change reviewers have to accept in the pull request.

## Dependency audit

The `dependency-audit` job:

1. Checks `.github/security/scan-targets.txt` against every tracked `package-lock.json` and `pom.xml`. A new lockfile or pom that is not added to that list fails the job.
2. Runs `npm ci --ignore-scripts --no-audit --no-fund` in each directory that has both `package.json` and `package-lock.json`. Install scripts do not run.
3. Runs `npm audit --audit-level=high` in those directories. High and critical advisories fail unless `.github/security/npm-audit-allowlist.txt` lists that exact package, severity, and advisory id. Moderate and low advisories do not fail this command. A stale allowlist line fails the job as well.
4. Runs OSV-Scanner 2.7.0 on every path in the scan-target list. Every vulnerability the scanner reports fails unless `.github/security/osv-allowlist.txt` lists that file, id, ecosystem, package, and version. Severity is not filtered. A stale line fails the job.

OSV-Scanner resolves Maven dependencies. Unpublished in-repo modules (`gov.irs.directfile*` and `gov.irs.factgraph`) are not on a public registry, so a resolution error for those coordinates does not by itself fail the job. A resolution error for any other coordinate fails the job. Packages the scanner can extract are still reported.

The allowlists record findings present when the gate was added. They are not a waiver for a new advisory. Refreshing them is a reviewed diff: `node .github/scripts/dependency-audit.mjs print-npm-findings` and `print-osv-findings` print the current set. The pull request commands do not use the print modes.

## Branch protection

`gitleaks` and `dependency-audit` should be required status checks on the protected branch. Required checks are a repository-admin setting (branch protection or a ruleset). This workflow does not change that setting. In the check list they appear under the workflow name `secret-and-dependency-audit`.

Until an admin marks both checks required, a pull request can be merged without them.

## When a check fails

**Secret or PII hit.** Treat the value as compromised once it has been pushed to a public remote, including a pull request commit that is no longer on the branch tip.

1. Revoke the credential and rotate it at the system that issued it. Do not reuse the old value.
2. Purge it from git history. A new commit that only deletes the value leaves it reachable from the old commit. Rewrite the history that contains it, and drop caches and forks that still have the old objects.
3. Re-run this workflow on the rewritten range.

**Dependency finding.** An advisory that is not on the allowlist fails the check. Upgrade the dependency, or add the exact allowlist line in a reviewed change. For npm, change the lockfile and install with `npm ci --ignore-scripts`. Do not set the job to continue on error.

## Pinned tools

| Tool | Pin |
| --- | --- |
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1) |
| `actions/setup-node` | `949feb2413d6458794dcd2491c4babbbce0c15c1` (v7.1.0), Node `22.23.4` |
| gitleaks | 8.30.1 linux x64, SHA-256 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb` |
| osv-scanner | 2.7.0 linux amd64, SHA-256 `160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b` |

The install script downloads those release assets over HTTPS and rejects a checksum mismatch. No npm packages were added for the gate. OSV call analysis is off, so the scanner does not run build scripts.
