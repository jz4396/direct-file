# Spec: MeF path-forward + print-forms / PDF generator roadmap

**Status:** product roadmap (Joshua / Feat)  
**Owner implementer:** Feat (roadmap); Dev/Cod for engineering follow-through; Joshua for IRS enrollment  
**Review:** Feat merge

## Goal
Durable write-up of the **Modernized e-File (MeF) path-forward** for this fork, plus two related Phase A items:

1. **Print-forms feature** — generate printable IRS tax forms from interview answers.
2. **PDF generator comparison** — can an **existing non-Java** language in this repo fill IRS AcroForms well enough to drop Java from the stack?

This doc does **not** replace or amend [YEAR-TAX-CONFIG](./YEAR-TAX-CONFIG.md), [CLIENT-SAVE-STATE](./CLIENT-SAVE-STATE.md), [HOSTING-AND-LOCAL](./HOSTING-AND-LOCAL.md), or the `docs/tax/` gap specs.

## Normative sources (audit trail)
- Product requirements: Joshua → Feat (Oct 2026) — MeF path-forward research; print-forms + PDF-generator decision (reframed: remove Java via in-stack library?).
- IRS MeF / e-file:
  - [Publication 3112 — IRS e-File Application and Participation](https://www.irs.gov/pub/irs-pdf/p3112.pdf)
  - [Publication 4164 — MeF Guide for Software Developers and Transmitters](https://www.irs.gov/pub/irs-pdf/p4164.pdf)
  - [Publication 1436 — ATS Guidelines for MeF Individual Tax Returns](https://www.irs.gov/pub/irs-pdf/p1436.pdf)
  - [MeF schemas and business rules](https://www.irs.gov/e-file-providers/modernized-e-file-mef-schemas-and-business-rules) (via e-Services SOR mailbox)
  - [MeF status / WSDLs](https://www.irs.gov/e-file-providers/modernized-e-file-mef-status) (TY2026 / PY2027 WSDL R10.A; ATS install target noted on that page)
  - [MeF user guides and publications](https://www.irs.gov/e-file-providers/modernized-e-file-mef-user-guides-and-publications) (A2A Toolkit request: email mefmailbox@irs.gov with subject “A2A Toolkit”; Strong Authentication certs)
- Upstream Direct File PDF output:
  - `direct-file/backend/.../api/pdf/` — `PdfService` (Apache PDFBox) + [pdf README](../../direct-file/backend/src/main/java/gov/irs/directfile/api/pdf/README.md)
  - Templates: `direct-file/backend/src/main/resources/pdf/2024/`
  - Client: `DownloadPDFButton` + `PrintAndMailSubcategory` (print-and-mail / paper path)
  - ADR: `docs/adr/adr_user_supplied_info.md` (file via MeF **or** mail a PDF)
- Hosting constraint: [HOSTING-AND-LOCAL](./HOSTING-AND-LOCAL.md) — Phase A = Cloudflare Pages (no JVM on free plan).

---

## 1. MeF path-forward (existing items)

Phased plan: **print/local first (Phase A)**; MeF transmission only after Joshua completes IRS enrollment and has a Test ETIN / ATS access.

### 1.1 You (Joshua) — IRS enrollment (humans only)

Bots **never** create IRS accounts, complete e-file applications, request Toolkits in Joshua’s name, or submit returns.

| Step | What | Notes / sources |
|------|------|-----------------|
| e-Services | Register an active e-Services account | Required before SOR mailbox / schemas ([MeF status](https://www.irs.gov/e-file-providers/modernized-e-file-mef-status)) |
| IRS e-file application | Apply as e-file provider; obtain EFIN / ETIN as applicable | [Pub 3112](https://www.irs.gov/pub/irs-pdf/p3112.pdf); allow **≥45 days** for processing before relying on Test ETIN / ATS |
| Provider role | Choose **Software Developer** (schemas/WSDLs/ATS) vs also **Transmitter** / **Online Provider** if transmitting or offering online filing | Role choice drives MeF authorities and who may pull SOR packages |
| A2A Toolkit | Request Application-to-Application SDK from IRS | Email `mefmailbox@irs.gov`, subject **A2A Toolkit** ([MeF publications page](https://www.irs.gov/e-file-providers/modernized-e-file-mef-user-guides-and-publications)) |
| Strong auth | Purchase / install X.509 Strong Authentication certificates; register system(s) for **System ID (ASID)** | Cert issuers listed on MeF publications page; A2A systems must be registered ([Pub 1436](https://www.irs.gov/pub/irs-pdf/p1436.pdf)) |
| Schemas | Download TY2026 MeF XML schemas + business rules from **SOR** mailbox | Messages purged after ~60 days — download promptly |
| WSDLs | TY2026 / PY2027 WSDL **R10.A** for A2A | Use ATS URL `la.alt.www4`; production `la.www4` ([MeF status](https://www.irs.gov/e-file-providers/modernized-e-file-mef-status)) |
| ATS | Complete Assurance Testing System scenarios before production | [Pub 1436](https://www.irs.gov/pub/irs-pdf/p1436.pdf); Test ETIN required |

### 1.2 Software — MeF XML / SOAP / acks

- Reuse / adapt upstream **submit service** patterns for MeF XML composition, SOAP A2A calls, and acknowledgements ([Pub 4164](https://www.irs.gov/pub/irs-pdf/p4164.pdf), [Pub 5446](https://www.irs.gov/pub/irs-pdf/p5446.pdf)).
- MeF requires a **separate backend** (JVM or other always-on service). It will **not** run on Cloudflare Pages free static hosting alone — see [HOSTING-AND-LOCAL](./HOSTING-AND-LOCAL.md) Phase B.
- Align MeF form coverage with tax gap work (Schedules C/D/E/A, etc.) and year config ([YEAR-TAX-CONFIG](./YEAR-TAX-CONFIG.md)).

### 1.3 Phase A vs MeF timing

| Phase | Scope |
|-------|--------|
| **Phase A** | Local Docker + Cloudflare Pages client; **print/local** return PDF; client save-state; no MeF transmission |
| **MeF** | After Joshua has Test ETIN + ATS readiness; backend hosting decision (Joshua me-only for paid) |

### 1.4 Bot / automation guardrails

- Bots may draft checklists, link IRS pubs, and implement software against published schemas **after** Joshua provides them.
- Bots must **not** create e-Services accounts, submit e-file applications, request IRS credentials, or e-file taxpayer returns.

---

## 2. NEW — Print-forms feature

**Status:** roadmap item (implement after / alongside Phase A client hosting)  
**Blast radius:** medium (backend PDF path + new templates)

### Goal
Generate **printable IRS tax forms** from interview / Fact Graph answers, modeled on upstream Direct File’s existing PDF output.

### Upstream baseline (reuse)
- Engine: Java `PdfService` (Apache PDFBox) under `direct-file/backend/src/main/java/gov/irs/directfile/api/pdf/`.
- Process: [pdf README](../../direct-file/backend/src/main/java/gov/irs/directfile/api/pdf/README.md) — IRS AcroForm PDFs + per-form `configuration.yml` + `PdfToYaml` utility.
- Client: `DownloadPDFButton`; keep **`PrintAndMailSubcategory`** / print-and-mail flow.
- TY2024 packs already cover (among others): IRS1040, IRS1040SR, Schedules 1/2/3/B/R/EIC/8812/LEP; Forms 2441 (+ due diligence), 8862, 8880, 8889, 8962, 9000; W-2 / DF1099-R; dependent/CDCC/CTC/ODC statements.
- **Not** in current PDF packs: Schedules **C, D, E, A** (and other full-return gaps).

### Scope
1. Add a **TY2026** year folder under `resources/pdf/` (copy/adapt from `2024/` per upstream year-transition guidance in the pdf README).
2. Remap / refresh IRS fillable PDFs for TY2026 field renumbers.
3. Add **new templates** for Schedules **C, D, E, A** and any other forms the MeF path / full-return gaps require.
4. Wire `application.yaml` + `PdfTemplate` list; keep en/es where upstream does.
5. Preserve Download PDF + **print-and-mail** UX.
6. Run PDF scenario tests / visual spot-check; security review if any document store is introduced.

### Out of scope for this item
- Replacing PDFBox (see §3) unless a separate decision ports print to pdf-lib.
- Running PDF generation on Cloudflare Pages free (needs local or separate backend — same as today for PDFBox; pdf-lib could run in Node or even client-side).

### Acceptance (when implemented)
- [ ] `pdf/2026/` (or agreed year folder) with refreshed 1040-family packs
- [ ] New packs for Schedules C, D, E, A (at least MVP pages needed by gap specs)
- [ ] Download + print-and-mail still work end-to-end locally
- [ ] Scenario snapshots updated; visual check of new forms

---

## 3. PDF generator — can we delete Java?

**Status:** answered (Oct 2026)  
**Real question (Joshua):** Is there a PDF fill-in library in a language we **already use** (non-Java) that would let us **delete Java from the stack entirely**? Do **not** add Python or any new language. Jinja optional / skippable.

### 3.1 Languages already in this repo

Rough share of application code (Java + TS/TSX + Scala ≈ 1,750 source files; excludes node_modules / build):

| Language | ~share | Where |
|----------|--------|--------|
| TypeScript / TSX | ~43% | `df-client/` (React app, static site, packages) |
| Java | ~41% | `backend`, `submit`, `state-api`, `email-service`, `status`, `libs/*`, `utils/pdf-to-yaml` (Maven / Spring Boot) |
| Scala | ~15% | `fact-graph-scala` (JVM + Scala.js) |
| Python | tooling only | `utils/csp-simulator`, `scripts/*.py` — **not** a runtime language for PDF |
| YAML / JSON / Docker / Shell | infra | config, compose, CI, PDF field maps |

### 3.2 In-stack PDF fill options (no new languages)

| Option | Lang | Can fill IRS AcroForms? | Notes |
|--------|------|-------------------------|-------|
| **Apache PDFBox** (current) | Java | **Yes** — proven in-repo | Lowest risk for TY2026 template expansion |
| **pdf-lib** | TypeScript / JS | **Yes** — text, checkbox, radio, multi-page, flatten; fontkit for non-Latin | Best non-Java option already in-stack |
| Scala PDF libs | Scala | No mature AcroForm filler we’d bet IRS print on | Don’t invent one |
| Python (pypdf, reportlab, …) | Python | Capable, but **out of scope** — would add a language we refuse to add for this | Skip |
| pdfmake / Jinja→HTML→PDF | JS / any | Generate / recreate layout — **not** fill official IRS PDFs | Wrong tool |
| Hosted PDF APIs | SaaS | Possible fill, but tax PII / FTI leaves the stack | Avoid |

### 3.3 Direct answers

1. **Can we produce printable IRS forms without Java on the PDF path?**  
   **Yes.** Port `PdfService` to **pdf-lib** (TypeScript): load IRS templates → map fact paths (reuse YAML field maps) → set fields → flatten → bytes. Works in Node (or potentially client-side for Phase A local/print). Migration cost: rewrite of `api/pdf` wiring + field-by-field validation of ~24 packs vs current PDFBox output — **moderate** (weeks, not a weekend), no new language.

2. **Can we remove Java from the entire stack just by swapping the PDF library?**  
   **No.** PDFBox is a leaf. `backend` / `submit` / `state-api` / `email-service` are Java Spring. Deleting Java means rewriting those services — a full backend migration, not a PDF decision.

3. **TY2026 / Phase A recommendation**  
   - **Default:** keep **PDFBox**, expand TY2024 packs → TY2026 (incl. Schedules C/D/E/A). Lowest risk while Dev/Cod ship tax gaps.  
   - **If the goal is “no JVM for print”** (e.g. Pages-adjacent or pure Node print): port print to **pdf-lib**; keep Java backends until a deliberate backend rewrite.  
   - Cloudflare Pages still cannot host MeF; PDF stays local / separate service either way for mail-ready production flows that need a backend.

### Feat recommendation

**Stick with PDFBox for TY2026 template expansion** unless Joshua prioritizes removing the JVM from the **print** path — then choose **pdf-lib** only. Do **not** treat a PDF port as deleting Java from the project.

---

## Related product / tax work
- Hosting: [HOSTING-AND-LOCAL](./HOSTING-AND-LOCAL.md)
- Client persistence: [CLIENT-SAVE-STATE](./CLIENT-SAVE-STATE.md)
- Year modules: [YEAR-TAX-CONFIG](./YEAR-TAX-CONFIG.md)
- Tax gaps driving new PDF packs: `docs/tax/GAP-SCHEDULE-C.md`, `GAP-SCHEDULE-D.md`, `GAP-SCHEDULE-E.md`, `GAP-SCHEDULE-A.md` (open PRs)

## Acceptance (this roadmap PR)
- [x] Spec under `docs/product/MEF-PATH-FORWARD.md`
- [x] MeF path-forward items captured (enrollment, software, Phase A timing, bot guardrails)
- [x] Print-forms feature scoped
- [x] PDF comparison reframed: in-stack non-Java (pdf-lib) vs deleting Java; Feat recommendation recorded
- [x] No edits to other product/tax roadmap docs in this change
