# Spec: Client-side save state (no server taxpayer storage)

**Status:** product requirement (Joshua / Feat)  
**Owner implementer:** Dev or Cod  
**Review:** Feat merge (privacy/security); Rev only if tax facts are reshaped

## Goal
One save-state format shared by **web (remote)** and **local (Electron later)** that persists an in-progress return **without any server-side taxpayer data storage**.

## Normative sources (audit trail)
- Product requirement: Joshua → Feat, Oct 2026 ("good way to save state on remote that doesn’t have server side data storage and use the same save state for local app").
- Upstream Fact Graph model: graph holds incomplete return; consumer owns persistence of serialized JSON ([Fact Graph 3.1 ADR — serialization / persister responsibility](https://github.com/IRS-Public/fact-graph/blob/main/docs/fact-graph-3.1-adr.md)).
- Privacy baseline: no PII/FTI on our servers (aligns with upstream exempted-code posture in README).

## Requirements
1. **Canonical blob** — versioned JSON (or equivalent) of Fact Graph writable facts + metadata (`taxYear`, `schemaVersion`, `updatedAt`).
2. **Remote web** — persist only in the browser (IndexedDB/localStorage) and/or user-initiated download/upload of the blob. **No** app-backend database of returns.
3. **Local app** — same blob on disk; round-trip identical to web export/import.
4. **Optional user cloud** — if sync is added later, it must be user-controlled (e.g. their Drive) and encrypted client-side; out of scope for v1 except documenting the extension point.
5. **Integrity** — schema version check; refuse load on incompatible major version with clear UX.
6. **Tests** — export → clear → import restores culminating facts; web and “local” path use the same serializer module.

## Non-goals
- MeF submission credentials.
- Multi-device sync product.

## Acceptance
- [ ] Spec under `docs/product/`
- [ ] Shared serializer module + browser persistence stub + file import/export
- [ ] Explicit assertion in README/security notes: no server-side return storage
- [ ] Feat merges after proof of round-trip tests
