# Spec: MeF path-forward + print-forms / PDF generator roadmap

**Status:** product roadmap (Joshua / Feat)  
**Owner implementer:** Feat (roadmap); Dev/Cod for engineering follow-through; Joshua for IRS enrollment  
**Review:** Feat merge

## Goal
Durable write-up of the **Modernized e-File (MeF) path-forward** for this fork, plus two related Phase A items:

1. **Print-forms feature** — generate printable IRS tax forms from interview answers.
2. **PDF generator comparison (open question)** — keep upstream PDFBox/Java vs port to a non-Java stack.

This doc does **not** replace or amend [YEAR-TAX-CONFIG](./YEAR-TAX-CONFIG.md), [CLIENT-SAVE-STATE](./CLIENT-SAVE-STATE.md), [HOSTING-AND-LOCAL](./HOSTING-AND-LOCAL.md), or the `docs/tax/` gap specs.

## Normative sources (audit trail)
- Product requirements: Joshua → Feat (Oct 2026) — MeF path-forward research; print-forms + PDF-generator decision rule.
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
- Replacing PDFBox (see §3).
- Running PDF generation on Cloudflare Pages free (needs local or separate backend — same as today).

### Acceptance (when implemented)
- [ ] `pdf/2026/` (or agreed year folder) with refreshed 1040-family packs
- [ ] New packs for Schedules C, D, E, A (at least MVP pages needed by gap specs)
- [ ] Download + print-and-mail still work end-to-end locally
- [ ] Scenario snapshots updated; visual check of new forms

---

## 3. NEW — PDF generator comparison (open question)

**Status:** open question — **Feat recommendation below**  
**Decision rule (Joshua):** If expanding the existing TY2024 template set for 2026 is enough, **stick with PDFBox**. Only port if a non-Java option is **clearly better** for filling IRS AcroForm templates.

### Options

| Option | Stack | Fit for IRS AcroForm fill | Effort vs stick | Notes |
|--------|-------|---------------------------|-----------------|-------|
| **A. Keep PDFBox / Java** (upstream) | JVM backend | **Best** — already fills IRS PDFs via field maps + YAML; PdfToYaml + documented year update process | **Lowest** — expand year folder + new packs | Matches upstream README; 24+ existing packs |
| **B. pdf-lib (JS/TS)** | Node / browser | Good AcroForm support in JS | **High** — rewrite fill engine + re-encode all YAML/field maps; browser fill possible but large PDFs / PII in-client |
| **C. pypdf / PyPDF form (Python)** | Python service | Solid AcroForm fill | **High** — new service language + rewrite mappings; still not Pages-native |
| **D. Jinja → HTML → PDF** | Any | **Poor** for official IRS forms — recreates appearance, not IRS fillable PDFs; a11y / exact form fidelity risk | **Very high** + compliance risk | Fine for statements; wrong tool for f1040*.pdf packs |

### Evidence
- Upstream already invested in PDFBox + per-form `configuration.yml` + PdfToYaml; year updates are a **known process** (pdf README: “Guidelines for updating configurations when IRS updates PDF forms”).
- Porting means reimplementing AcroForm fill **and** migrating **24+** template packs without a clear win for IRS-supplied fillable PDFs.
- Phase A Pages hosting **cannot** run PDFBox **or** a JVM MeF submitter; PDF generation stays **local / separate backend** either way — porting does not unlock Pages-only PDF.

### Feat recommendation

**Stick with PDFBox / Java.** Expand and remap the TY2024 packs into a TY2026 folder; add Schedules C/D/E/A templates. **Do not port** unless a later decision drops the Java backend entirely for a non-JVM stack — revisit only then.

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
- [x] PDF generator comparison + Feat recommendation recorded
- [x] No edits to other product/tax roadmap docs in this change
