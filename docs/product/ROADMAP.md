# Master roadmap — Phase A → TY2026 → Phase 2

**Status:** durable product rollup (Joshua / Feat)  
**Owner:** Feat (merge + roadmap); Dev/Cod implement; Rev tax+security; Joshua me-only for paid hosting + IRS enrollment  
**Created:** Oct 2026  
**Target:** Tax Year **2026** returns filed in **2027**

This is the **one big doc** that consolidates product direction from voice + open product PRs. It **links** existing specs; it does **not** delete or supersede them.

| Spec (keep intact) | Role |
|--------------------|------|
| [HOSTING-AND-LOCAL.md](./HOSTING-AND-LOCAL.md) ([PR #7](https://github.com/jz4396/direct-file/pull/7)) | Phase A free hosting + local Docker |
| [MEF-PATH-FORWARD.md](./MEF-PATH-FORWARD.md) ([PR #11](https://github.com/jz4396/direct-file/pull/11)) | MeF enrollment path, print-forms, PDF decision |
| [CLIENT-SAVE-STATE.md](./CLIENT-SAVE-STATE.md) ([PR #6](https://github.com/jz4396/direct-file/pull/6)) | Browser/local save blob; no server return storage |
| [YEAR-TAX-CONFIG.md](./YEAR-TAX-CONFIG.md) ([PR #5](https://github.com/jz4396/direct-file/pull/5)) | Per-year feature flags + cited parameters |

Tax gap specs under `docs/tax/` are owned by Rev/Dev/Cod and are **out of scope** for edits here — only linked from the work queue below.

**Issues note:** GitHub Issues were disabled on this fork at write time. When Joshua turns Issues on, Feat will file task breakdowns / path-forward tickets from this roadmap. Until then, this doc is the durable source of truth.

---

## 1. Near-term priority

**Get the software to tax year 2026 so Joshua can use it for his own taxes in 2026** (returns filed in 2027).

Everything else (public hosting polish, MeF transmission, multi-user liability posture) is secondary until that works for Joshua’s own return: interview + Fact Graph + print/mail PDF for the forms he needs, with TY2026 parameters and gap coverage.

---

## 2. Phase A hosting

**Detail:** [HOSTING-AND-LOCAL.md](./HOSTING-AND-LOCAL.md) · [PR #7](https://github.com/jz4396/direct-file/pull/7)

### 2.1 What is free on Cloudflare Pages

Deploy **`df-client`** and **`df-static-site`** to **Cloudflare Pages** on Joshua’s existing Cloudflare domain.

| Limit (Free, as of Oct 2026 docs) | Value |
|-----------------------------------|-------|
| Static asset requests / bandwidth | Unlimited / free |
| Builds | 500 / month |
| Files per site | ~20,000 |
| Max file size | 25 MiB |
| Custom domains | Supported on existing CF zone |
| Pages Functions | Share **Workers Free**: **100k requests/day** (reset midnight UTC), ~10 ms CPU / invocation |

Pure static stays unlimited. Functions are only for light glue (headers, redirects) — not Spring or PDFBox.

### 2.2 What cannot run on Pages Free

| Piece | Why | Where it goes (Phase A) |
|-------|-----|-------------------------|
| Java Spring: `backend`, `submit`, `state-api`, `email-service`, `status` | Needs JVM / always-on process | **Local Docker** |
| Apache PDFBox PDF generation | Java leaf on the backend | **Local Docker** (same JVM) |
| MeF e-file transmission | Durable backend + IRS connectivity | **Not Phase A** — see §3 |
| Scala fact-graph (JVM) | Server-side graph eval | Local with backends; interview can use **Scala.js** in the client |

### 2.3 Recommended Phase A layout (free where possible)

1. **Cloudflare Pages (free):** public interview UI + static site on Joshua’s domain.
2. **Browser save-state:** in-progress return stays client-side ([CLIENT-SAVE-STATE](./CLIENT-SAVE-STATE.md)).
3. **Local Docker (free):** full JVM stack when Joshua needs API-backed interview or **Download PDF**.

**Phase A does not require** paid Cloudflare Containers.

### 2.4 What breaks if you stay 100% free with no local Docker

- No PDFBox-generated IRS PDFs
- No Spring APIs (`backend` / `submit` / `state-api` / `email-service` / `status`)
- No MeF path
- No durable server-side tax data (by design for privacy — but also no server PDF)

The public Pages site can still be a static demo / client shell if the app degrades gracefully. Full Direct File interview + printable return needs local (or later paid) JVM unless/until print moves to pdf-lib (§4).

### 2.5 Cheapest options later (decide when needed — Joshua me-only for paid)

| Option | Rough monthly | Fits |
|--------|---------------|------|
| Local Docker only | **$0** | Phase A print/local |
| Cloudflare Workers Paid | **~$5/mo** base (+ Containers usage) | Higher Functions limits; JVM via Containers is awkward for full Spring suite |
| Small VPS (Hetzner / DO-class) | **~$4–6/mo** | Clearest always-on Docker + JVM for MeF later |

---

## 3. MeF path-forward

**Detail:** [MEF-PATH-FORWARD.md](./MEF-PATH-FORWARD.md) · [PR #11](https://github.com/jz4396/direct-file/pull/11)

### 3.1 Timing

| Phase | Scope |
|-------|--------|
| **Phase A** | Local Docker + Pages client; **print/local** return PDF; client save-state; **no MeF transmission** |
| **MeF** | Only after Joshua has IRS enrollment readiness (Test ETIN + ATS); durable backend hosting decision is **Joshua me-only** |

### 3.2 Joshua-only enrollment (humans only)

Bots **never** create IRS accounts, complete e-file applications, request Toolkits in Joshua’s name, or submit returns.

Checklist (abbreviated — full table in MEF-PATH-FORWARD): e-Services → IRS e-file application (EFIN/ETIN; allow ≥45 days) → Software Developer / Transmitter role → A2A Toolkit (`mefmailbox@irs.gov`) → X.509 Strong Auth + ASID → download TY2026 schemas from SOR → WSDL R10.A → ATS before production.

### 3.3 Software + hosting for MeF

- Reuse / adapt upstream **submit** service for MeF XML, SOAP A2A, acks.
- MeF needs a **durable always-on backend** — not Pages Free, not laptop-only for real transmission.
- Align MeF form coverage with tax gaps + [YEAR-TAX-CONFIG](./YEAR-TAX-CONFIG.md).

### 3.4 Bot / automation guardrails

- Bots may draft checklists, link IRS pubs, and implement against schemas **after** Joshua provides them.
- Bots must **not** create e-Services accounts, submit e-file applications, request IRS credentials, or e-file taxpayer returns.

---

## 4. Print-forms + PDF decision

**Detail:** [MEF-PATH-FORWARD.md](./MEF-PATH-FORWARD.md) §§2–3 · [PR #11](https://github.com/jz4396/direct-file/pull/11)

### 4.1 Print-forms (Phase A feature)

Generate printable IRS forms from interview / Fact Graph answers, modeled on upstream `PdfService` (Apache PDFBox) + TY2024 packs under `resources/pdf/2024/`.

When Schedules C/SE (and D/E/A) hit print: **expand PDFBox TY2024 templates for TY2026** — new year folder, remap fields, add missing packs, keep Download PDF + print-and-mail UX. Local Docker for generation in Phase A.

### 4.2 Can we delete Java via a PDF library?

**Question (Joshua):** Is there a PDF fill-in library in a language we **already use** (non-Java) that lets us delete Java from the stack? Do **not** add Python or any new language.

| Answer | |
|--------|--|
| Printable forms **without Java on the PDF path**? | **Yes** — **pdf-lib** (TypeScript) can fill IRS AcroForms (text, checkbox, radio, multi-page, flatten). Port `PdfService`; moderate migration cost. |
| Delete Java from the **entire** stack by swapping PDF? | **No** — `backend` / `submit` / `state-api` / `email-service` are Spring. PDFBox is a leaf. |
| TY2026 default | **Stick with PDFBox**; expand templates. Revisit pdf-lib only if Joshua prioritizes no-JVM print. |
| Hosted PDF APIs | **Avoid** — tax PII / FTI leaves the stack. |
| Python PDF libs | **Out of scope** — Python is tooling only in this repo. |

**Languages already in-stack (approx.):** TypeScript ~43%, Java ~41%, Scala ~15%; Python = scripts only.

---

## 5. Phase 2 — Client-side data / no server-side user data retention

**Status:** roadmap item (GitHub Issue deferred until Issues are enabled on the fork)  
**Related:** [CLIENT-SAVE-STATE](./CLIENT-SAVE-STATE.md) ([PR #6](https://github.com/jz4396/direct-file/pull/6)), [HOSTING-AND-LOCAL](./HOSTING-AND-LOCAL.md), [MEF-PATH-FORWARD](./MEF-PATH-FORWARD.md)

### 5.1 Intent (Joshua’s words, paraphrased closely)

Down the line, push as much of the return / interview data to the **client side** as possible so the project is **not** in charge of saving data server-side or handling people’s data. If this is ever hosted for other people, Joshua does **not** want to receive or retain users’ data in any way — that is a **liability / risk** to avoid.

### 5.2 Near-term vs long-term

1. **Near-term (above all):** TY2026 software so Joshua can file **his own** 2026 taxes.
2. **Long-term vision — two endgames** (both about avoiding responsibility for other users’ data):
   - **(A) Local-for-others:** provide it so other people run it themselves on their own machines.
   - **(B) Public host, zero server-side computation on people’s data:** if everything can move client-side, host the static app publicly but with **no** server-side computation / retention of taxpayer data — zero risk of hosting or retaining people’s data.

### 5.3 Dependencies

Phase 2 depends on revisiting:

- **Server-side Fact Graph evaluation** — how much must stay on a JVM backend vs Scala.js in-browser.
- **Session handling** — no server session store of return contents; align with CLIENT-SAVE-STATE blob model.
- Hosting choice (Pages-only client vs any residual API) and whether MeF (which needs a backend) is ever offered as a hosted service vs local-only transmit.

### 5.4 Issue placeholder

When Issues are enabled, Feat will open something like:

> **Phase 2: Client-side data — no server-side user data retention**

with this section’s content, links to HOSTING / MEF / CLIENT-SAVE-STATE, and a `phase-2` label if labels exist. **No issue created in this PR.**

---

## 6. Open product / tax work queue (PRs #2–#11)

Track these as the current related work queue. Feat merges product docs after skim; Rev owns tax+security on gap PRs; Dev/Cod implement.

| PR | Title (short) | Lane |
|----|---------------|------|
| [#2](https://github.com/jz4396/direct-file/pull/2) | TY2026 tax parameters (Rev. Proc. 2025-32 / OBBBA) | Tax gap — Rev |
| [#3](https://github.com/jz4396/direct-file/pull/3) | Schedule C + SE tax (full-return scope) | Tax gap — Rev → Cod |
| [#4](https://github.com/jz4396/direct-file/pull/4) | Schedule D + Form 8949 (capital gains) | Tax gap — Rev |
| [#5](https://github.com/jz4396/direct-file/pull/5) | Per-year tax config (enable/disable/params) | Product — Feat |
| [#6](https://github.com/jz4396/direct-file/pull/6) | Client-side save state (no server storage) | Product — Feat |
| [#7](https://github.com/jz4396/direct-file/pull/7) | Local run + Cloudflare Pages hosting (Phase A free) | Product — Feat |
| [#8](https://github.com/jz4396/direct-file/pull/8) | Schedule E rental/royalties — TY2026 | Tax gap — Rev |
| [#9](https://github.com/jz4396/direct-file/pull/9) | Schedule A itemized — TY2026 SALT | Tax gap — Rev |
| [#10](https://github.com/jz4396/direct-file/pull/10) | Form 2441 child/dependent care — TY2026 | Tax gap — Rev |
| [#11](https://github.com/jz4396/direct-file/pull/11) | MeF path-forward + print-forms / PDF roadmap | Product — Feat |

This ROADMAP PR sits next in the product lane and rolls #5–#7 + #11 (and hosting/PDF voice follow-ups) into one place.

---

## 7. Roles

| Who | Owns |
|-----|------|
| **Feat** | Fork/README, product docs, merge after review; roadmap / Issues (when enabled) |
| **Rev** | Tax-code audit vs current IRS rules; compliance + security review on gap PRs; supplies gap/feature PRs for TY2025/FS2026 |
| **Dev / Cod** | Implementation (Fact Graph, interview, PDFBox template expansion, client save-state, deploy stubs) |
| **Joshua** | **Me-only:** paid hosting decisions; IRS e-Services / e-file enrollment / certs / ATS; any action that creates liability for other users’ data |

---

## 8. Suggested sequence (when Issues land)

Not binding — for Feat to turn into Issues:

1. Land / merge product specs (#5–#7, #11, this ROADMAP).
2. Finish TY2026 parameters + priority gaps Joshua needs for his own return (#2, #3, …).
3. Phase A: Pages deploy stubs + local Docker one-command + client save-state stub.
4. Print: PDFBox TY2026 packs for forms in scope (incl. Sch C/SE when Cod ships).
5. Phase 2 issue: client-only data endgames A/B; Fact Graph / session revisit.
6. MeF only after Joshua enrollment + paid durable backend decision.

---

## Acceptance (this PR)

- [x] `docs/product/ROADMAP.md` consolidates near-term priority, Phase A hosting, MeF, print/PDF, Phase 2 vision, PR queue, roles
- [x] Links existing product specs; does not wipe YEAR-TAX-CONFIG / CLIENT-SAVE-STATE / HOSTING / MEF
- [x] No tax gap doc edits
- [x] No GitHub Issues created (Issues may still be disabled)
- [ ] Feat merges after skim
