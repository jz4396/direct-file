# Spec: Free hosting + solid local run

**Status:** product requirement (Joshua / Feat)  
**Owner implementer:** Dev or Cod  
**Review:** Feat merge

## Goal
Make the product easy to **run locally** and deploy to a **free/low-cost public host**, ideally on Joshua’s existing **Cloudflare** domain.

## Normative sources (audit trail)
- Product requirement: Joshua → Feat, Oct 2026 ("most importantly a good free place to host this for now as well as run locally… Cloudflare domain").
- Cloudflare Free limits (as of docs fetch Oct 2026):
  - [Pages limits](https://developers.cloudflare.com/pages/platform/limits/): Free plan static hosting; 500 builds/month; static asset requests free/unlimited.
  - [Workers Free](https://developers.cloudflare.com/workers/platform/limits/): 100k requests/day, 10 ms CPU/invocation for Workers/Pages Functions.
  - [Containers pricing](https://developers.cloudflare.com/containers/pricing/): **not on Free** — requires Workers Paid (~$5/mo) for containerized JVM backends.
- Upstream local run: [ONBOARDING.md](https://github.com/jz4396/direct-file/blob/main/ONBOARDING.md) / Docker compose from Direct File.

## Decision (Feat recommendation)
**Phase A (free):** ship a **static/client-heavy** build on **Cloudflare Pages** (custom domain on existing CF zone). Keep full JVM/backend stack for **local Docker** only.

**Phase B (optional paid):** if MeF/API or heavy server features need always-on JVM, evaluate Workers Paid + Containers or a separate free-tier PaaS — escalate to Joshua (me-only cost decision).

## Requirements
1. Document one-command local run (Docker Compose or documented script) that boots the interview client.
2. Document Cloudflare Pages deploy for the client (build command, output dir, custom domain steps).
3. Architecture note: what runs in-browser vs what requires local backend; no silent dependency on paid CF Containers in Phase A.
4. Health/smoke checklist for local and Pages deploy.

## Related
- Electron wrapper is a **nice-to-have** (separate PR later); must reuse same client + [CLIENT-SAVE-STATE](./CLIENT-SAVE-STATE.md).

## Acceptance
- [ ] Spec under `docs/product/`
- [ ] `docs/deploy/LOCAL.md` and `docs/deploy/CLOUDFLARE-PAGES.md` stubs with concrete commands discovered from the repo
- [ ] Phase A explicitly does not require paid Containers
- [ ] Feat merges; Joshua approves any paid hosting step
