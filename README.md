# PDFReader: Report Data Extraction

[![CI](https://github.com/anyabhatia5/PDFReader/actions/workflows/ci.yml/badge.svg)](https://github.com/anyabhatia5/PDFReader/actions/workflows/ci.yml)

**Demo video:** _add link here_ (3–5 min: uploading PDFs and viewing the extracted data)

Upload a report PDF, and PDFReader reads it (with OCR if it is a scan), extracts every
parameter row (name, result, unit, reference range / limits), stores it in PostgreSQL against
the report / sample ID, and shows it back in a table laid out like the original report.

It handles **lab reports** (the assignment's example) and **industrial / SCADA reports**: daily
process reports with tags and Lo/Hi alarm limits, equipment test reports, water quality reports
and calibration certificates.

**Stack:** NestJS (API) · PostgreSQL 16 · Next.js 16 (UI) · TypeORM · pdfjs · Tesseract (OCR)

---

## Contents

1. [What I built](#1-what-i-built)
2. [Run it locally](#2-run-it-locally)
3. [How the PDF is read](#3-how-the-pdf-is-read)
4. [Database design](#4-database-design)
5. [Edge cases](#5-edge-cases)
6. [API](#6-api)
7. [Project structure](#7-project-structure)
8. [Testing](#8-testing)
9. [Assumptions](#9-assumptions)
10. [Known limitations](#10-known-limitations)
11. [AI tools used](#11-ai-tools-used)

---

## 1. What I built

- **Upload page:** choose a PDF (up to 20 MB) and click *Upload & extract*. You immediately see
  how many parameters were found, or a clear message if the file was a duplicate, not a PDF,
  corrupted or too large.
- **Reports list:** every stored report with its ID, file name, number of parameters, how it
  was read (text or OCR) and when it was uploaded.
- **Report page:** the extracted table in the same columns as the report
  (**Parameter | Result | Unit | Reference Range / Limits**). Out-of-range results (including
  SCADA values outside their alarm limits) are highlighted as
  *High* / *Low*, multi-page tables show where each page starts, and warnings explain anything
  to double-check (e.g. "Page 1 is scanned; read with OCR (90% confidence)"). The original
  PDF can be opened next to it.
- **A NestJS API** that does the extraction and stores everything in PostgreSQL.
- **Sample PDFs** in [`samples/`](samples) (all fictional), plus the script that generates them:

  | File | What it tests |
  |---|---|
  | `01-cbc-10-parameters` | 10 parameters, *Report ID*, H/L flags next to values |
  | `02-lipid-thyroid-8-parameters` | 8 parameters, *Sample ID*, different header wording |
  | `03-metabolic-13-parameters-2-pages` | 13 parameters; table continues on page 2 **without** a repeated header |
  | `04-urine-text-values` | `Positive`, `Nil`, `<5`; missing units, ranges and a value |
  | `05-no-report-id` | no report / sample ID anywhere |
  | `06-scanned-cbc` | image-only copy of 01 (needs OCR) |
  | `07-corrupted`, `08-not-a-pdf` | must be rejected (422 / 415) |
  | `09-scada-daily-process-report` | *Tag* + *Description*, separate *Lo/Hi Limit* columns, *Status* column, `COMM FAIL`, 2 pages **with** a repeated header |
  | `10-transformer-test-report` | *S.No* column, *Acceptance Criteria* (`>= 1000`, `Min 50`, `Max 20`), Pass/Fail column, text value `Dyn11` |
  | `11-water-quality-report` | *Permissible Limit*, `BDL`, `Not Detected`, a *Test Method* column to ignore |
  | `12-pressure-calibration-cert` | unit only in the column title (`Reading (bar)`), *Applied* / *Error* columns to ignore, `± 0.025` tolerance |

## 2. Run it locally

Works the same on **macOS, Linux and Windows**. CI checks Ubuntu and macOS on every push.

**You need:** [Node.js](https://nodejs.org) 20.19 or newer (22 LTS recommended; see `.nvmrc`)
and [Docker](https://www.docker.com/products/docker-desktop/) (running).

```bash
git clone https://github.com/anyabhatia5/PDFReader.git
cd PDFReader
npm run setup     # creates .env files, installs packages, starts Postgres, runs migrations
npm run dev       # starts the API and the UI together
```

Open **http://localhost:3000** and upload any file from [`samples/`](samples).

| What | Where |
|---|---|
| UI (Next.js) | http://localhost:3000 |
| API (NestJS) | http://localhost:4000/api (health check: `/api/health`) |
| PostgreSQL (Docker) | `localhost:5433`, user / password / database: `pdfreader` |

Other commands (from the repo root):

```bash
npm test            # unit tests
npm run test:e2e    # end-to-end API tests (needs Postgres running)
npm run db:down     # stop Postgres (data is kept in a Docker volume)
```

**Troubleshooting**

- *"Docker is not available"*: start Docker Desktop and run `npm run setup` again.
- *Port already in use*: change `DB_PORT` / `PORT` in `backend/.env` (and `NEXT_PUBLIC_API_URL`
  in `frontend/.env` if you change the API port).
- *First scanned PDF is slow*: the OCR engine downloads its English language data once
  (~10 MB, cached in `backend/.cache/`), so this needs internet the first time.

## 3. How the PDF is read

The code lives in [`backend/src/extraction/`](backend/src/extraction), one small file per step.

```
PDF ─► 1. open & validate ─► 2. per page: text layer, or OCR if scanned
    ─► 3. words → lines → cells ─► 4. find the result table
    ─► 5. parse values & ranges ─► 6. find the report ID ─► store
```

1. **Open and validate.** The file must start with the `%PDF-` signature (the file's own bytes
   are checked, not its name). It is opened with **pdfjs** (Mozilla's PDF engine). Corrupted or
   password-protected files are rejected with a clear error.
2. **Text or OCR, per page.** Most PDFs have a *text layer*: the exact characters plus their
   positions. If a page has almost no text (under 20 characters), it is a scanned image. It is
   rendered at about 216 DPI and read with **Tesseract OCR**. Both routes produce the same
   thing (words with x/y positions), so the steps below don't care where the text came from.
   A PDF can mix both (method `mixed`).
3. **Rebuild the layout.** PDFs don't store "rows" or "columns", only positioned text. Words
   whose vertical centres are close form a **line**; within a line, a large horizontal gap
   starts a new **cell** (column).
4. **Find the table.** The **header row** is recognised by its titles, both lab and industrial
   wording:

   | Column | Example titles |
   |---|---|
   | name (may be several, joined) | *Test, Parameter, Investigation, Tag, Description, Test Point* |
   | result | *Result, Observed Value, Value, Reading, Measured Value* |
   | unit | *Unit, Units, Eng. Unit, UOM*, or a unit in the result title: *Reading (bar)* |
   | range | *Reference Range, Biological Reference Interval, Limits, Acceptance Criteria, Permissible Limit, Tolerance* |
   | low / high limits | *Lo Limit / Hi Limit, Min / Max, Low / High Alarm* (combined into one range) |
   | ignored on purpose | *S.No, Status, Alarm, Flag, Remarks, Test Method, Applied, Error, Date / Time* |

   The header fixes where each column starts, and every following line's cells are assigned
   to a column by x position. So when a unit or range is missing, that column is simply empty
   instead of the other values shifting left. A *Tag* and a *Description* column are joined
   into one name (`FT-101 Raw Water Inlet Flow`), and separate *Lo / Hi Limit* columns become
   one range (`120 - 250`, or `<= 10` when only a high limit is set).
   - Section titles ("BIOCHEMISTRY"), page footers and `Label: value` lines are skipped.
   - The column layout **carries over to the next page**, so a table continues even if the
     header is not repeated.
   - "End of report", "Interpretation" and similar lines end the table.
5. **Parse values.** Each result keeps its **raw text** exactly as printed, plus a parsed number
   when there is one:
   `13.2` → 13.2 · `<5` → `<` and 5 · `18.4 H` → 18.4 · `1,50,000` → 150000 ·
   `Positive` / `Nil` / `COMM FAIL` / `BDL` → text only. Reference ranges become low/high
   bounds: `13 - 17`, `< 200`, `> 40`, `Up to 5`, `Max 20`, `Min 50`, `NMT 0.5`. A result is
   marked **High/Low only when that can actually be decided**: both the value and the range
   are numeric.
6. **Find the ID.** Labels like *Report ID, Sample ID, Specimen No, Accession No, Lab No* (lab)
   and *Report No, Batch No, Certificate No, Job No, Work Order No* (industrial) are searched,
   and the value must contain a digit. *Patient ID* and *Asset ID* are deliberately ignored,
   because they identify a person or a piece of equipment, not a report. If nothing is found,
   an ID like `AUTO-20261122-3fa9c1` is generated and clearly flagged.

**Why rules instead of an AI model?** The rules are free, run offline, give the same answer every
time, and every decision can be traced and unit-tested. The trade-off is that a very unusual
layout (for example, a report with no header row at all) needs a new rule.

## 4. Database design

A PDF can have any number of parameters, so parameters are **rows, not columns**:

```
reports  1 ──< report_parameters >── 1  parameter_definitions
(one per PDF)  (one per parameter row)    (catalog: one per kind of test)
```

| Table | Purpose | Key columns |
|---|---|---|
| `reports` | One uploaded PDF | `report_identifier` (indexed), `identifier_source` (`pdf` / `generated`), `file_sha256` (**unique**), `page_count`, `extraction_method`, `status`, `warnings` |
| `report_parameters` | One row of the result table | `position` (PDF order), `page_number`, `name_raw`, `value_raw` + `value_numeric` + `value_comparator`, `unit`, `ref_range_raw` + `ref_low` + `ref_high`, `is_abnormal` |
| `parameter_definitions` | The catalog of distinct tests | `canonical_key` (**unique**), `display_name` |

**Why this design**

- **Rows, not columns:** 8, 10 or 50 parameters all fit without changing the schema, and every
  value is still a proper, queryable column. A JSONB blob would be simpler to write but harder
  to query and validate. A generic key/value (EAV) table would lose the structure of a result
  (value, unit, range).
- **Raw and parsed values side by side:** nothing printed in the PDF is ever lost (`<5`,
  `Positive`), while numeric values can still be compared and range-checked.
- **The parameter catalog** links the same test across reports. Printed names are normalised
  (lowercase, punctuation removed: `Haemoglobin (Hb)` → `haemoglobin hb`), so "all hemoglobin
  results across reports" is a simple join. Bracket text is kept because it changes meaning:
  *Glucose (Fasting)* is not *Glucose (PP)*.
- **The database enforces the rules too:** a unique file hash (no duplicate uploads, even if two
  arrive at the same moment), CHECK constraints on status and comparator values, foreign keys
  (deleting a report deletes its rows; a catalog entry in use cannot be deleted), and a unique
  `(report_id, position)`.
- **`report_identifier` is not unique** on purpose: two different files can carry the same ID
  (for example, a scanned copy of a report). Duplicates are decided by file content instead.
- **Schema changes only through migrations** ([`backend/src/database/migrations`](backend/src/database/migrations)),
  never `synchronize`, so the schema is versioned and reproducible.
- Each report and all its parameters are saved in **one transaction**: a failure never leaves a
  half-saved report. The original PDF is kept on disk, named by its hash.

## 5. Edge cases

| Edge case | How it is handled | Sample |
|---|---|---|
| Different numbers of parameters | One row per parameter; no fixed columns | 01 (10), 02 (8), 03 (13), 04 (9), 05 (6), 09 (17), 10 (12), 11 (12), 12 (9) |
| Different kinds of report (lab, SCADA, test, water, calibration) | Header recognised from lab and industrial wording; extra columns ignored on purpose | 01–05, 09–12 |
| Limits in separate Lo / Hi columns | Combined into one range, so alarm values are flagged | 09 |
| Unit only in a column title | `Reading (bar)` gives the unit `bar` | 12 |
| Scanned (image) PDF | Pages without a text layer are rendered and read with OCR; a confidence warning is shown | 06 |
| Missing values, units or ranges | Cells are placed by column position, so a gap stays a gap; shown as "—" or *not reported*, with a warning | 04 |
| Values like `<5`, `Positive`, `Nil` | Raw text always kept; number and comparator parsed only when unambiguous | 04 |
| Same PDF uploaded twice | SHA-256 of the file is unique in the database; the stored report is returned with `duplicate: true` | 01 twice |
| Report / sample ID missing | Saved with a generated `AUTO-YYYYMMDD-xxxxxx` ID, flagged in the UI | 05 |
| Table continues across pages | Column layout carries over to the next page, with or without a repeated header | 03 (without), 09 (with) |
| Non-PDF file | Rejected by its bytes: **415**, even if named `.pdf` | 08 |
| Corrupted PDF | Rejected: **422** "The PDF is corrupted or incomplete." | 07 |
| Password-protected PDF | Rejected: **422** "The PDF is password-protected." | – |
| File too large / empty / missing | **413** (over 20 MB) / **400** / **400** | – |
| PDF with no recognisable table | Stored with status `no_parameters_found` and a warning | – |
| Two identical uploads at once | The database's unique constraint lets one in; the other gets that report back | – |
| API not running | The UI shows "Cannot reach the API… Is the backend running?" | – |

## 6. API

All routes are under `http://localhost:4000/api`.

| Method | Path | Response |
|---|---|---|
| `POST` | `/reports` (multipart field `file`) | **201** new report · **200** `{ duplicate: true }` · 400 / 413 / 415 / 422 / 503 |
| `GET` | `/reports` | All reports, newest first, with parameter counts |
| `GET` | `/reports/:id` | Report with its parameters in PDF order · 400 malformed id · 404 |
| `GET` | `/reports/:id/file` | The original PDF |
| `GET` | `/health` | `{ status: "ok", database: "up" }` |

## 7. Project structure

```
PDFReader/
├── backend/                     NestJS API
│   ├── src/extraction/          PDF reading, OCR, layout, table and value parsing (+ unit tests)
│   ├── src/reports/             upload / list / detail endpoints, validation, file storage
│   ├── src/catalog/             parameter catalog (canonical names)
│   ├── src/database/            TypeORM config and migrations
│   ├── scripts/generate-samples.mjs   creates the sample PDFs
│   └── test/                    end-to-end API tests
├── frontend/                    Next.js UI (upload, list, report pages)
├── samples/                     sample PDFs used for testing and the demo
├── scripts/setup.mjs            one-command local setup
├── docker-compose.yml           PostgreSQL
└── .github/workflows/ci.yml     CI on Ubuntu and macOS
```

## 8. Testing

- **99 unit tests** (Vitest) for every parsing step: values, ranges, line building, table
  detection (lab and industrial layouts, page continuation, missing cells, limit columns),
  ID detection, catalog keys and upload validation.
- **18 end-to-end tests** run the real API against a real PostgreSQL database with the real
  sample PDFs (lab and industrial), including OCR. They use a separate `pdfreader_test` database, so local data is
  never touched.
- **CI** ([GitHub Actions](.github/workflows/ci.yml)) runs lint, all tests and the frontend
  build on **Ubuntu and macOS**. Ubuntu uses the exact `npm run setup` from this README.

Regenerate the sample PDFs with `npm --prefix backend run samples`. The output is identical on
every run.

## 9. Assumptions

- Reports have **one result table with a header row** containing at least a test-name column
  and a result column. Other columns (e.g. *Flag*, *Method*) are recognised as columns but not
  stored.
- Columns are roughly **left-aligned** with their header titles (true of typical lab and
  industrial reports), and separated by a gap of at least ~0.8× the text height.
- When a report has both a *Tag* and a *Description* column, the parameter name is both joined
  (`FT-101 Raw Water Inlet Flow`), so the same tag at different stations stays distinct.
- Status / alarm / Pass-Fail columns are not stored: High/Low is recomputed from the value
  and the limits, so it stays consistent across all report types.
- A parameter name fits on **one line**. A name that wraps onto a second line with nothing
  beside it is treated as a section title and skipped.
- Numbers use `.` for decimals; `,` is a thousands separator (including Indian grouping like
  `1,50,000`).
- Reference-range bounds are **inclusive** (`13 - 17` accepts 13 and 17).
- A value that is itself a bound (`<5`) is not marked High/Low, because its exact position
  relative to the range is unknown.
- The **report ID** is the first *Report / Sample / Specimen / Accession / Lab* ID on the
  report. *Patient ID* is not a report ID.
- **Duplicates** are identical files (same bytes). A re-scan of the same paper report is a
  different file and is stored separately.
- English-language reports (the OCR language is English).
- The same database design serves every report type: a SCADA tag, a transformer test and a
  blood test are all "a named parameter with a value, unit and range", so no per-type tables
  are needed.
- Uploads are processed **synchronously** (a scanned page takes a few seconds), which is fine
  for single uploads. A job queue would be the next step for bulk uploads.
- No authentication: this is a local tool for the assignment.

## 10. Known limitations

- **OCR is not perfect.** On scans, small characters can be misread. For example, in sample 06
  the RBC range `4.0 - 5.2` is read as `40-52` (decimal points lost), so that row is wrongly
  marked *Low*. Every OCR'd page therefore shows a warning with its confidence score, asking
  the user to verify, and the original PDF is one click away.
- The parser relies on a recognisable header row; a report without one is stored with status
  `no_parameters_found` rather than guessed. New report formats with unusual column titles
  need their words added to the header patterns in
  [`table-parser.ts`](backend/src/extraction/table-parser.ts).
- A **relative tolerance** such as `± 0.025` on a calibration certificate is stored as text but
  not checked, because it is relative to the *applied* value in another column. So
  calibration points are shown with no High/Low verdict, rather than a wrong one.
- Wide **time-series SCADA logs** (one row per timestamp, one column per tag) are a different
  table shape and are not supported; the parser expects one row per parameter.
- Scans that are rotated or skewed are not straightened before OCR.

## 11. AI tools used

- **Claude Code (Anthropic)** was used as a pair programmer throughout: to discuss and compare
  design options before any code was written (extraction approach, schema, duplicate and
  missing-ID handling, tooling), to scaffold the projects, to write code and tests step by step,
  and to debug issues found while testing with real PDFs (for example, OCR splitting rows, and
  a Windows-only path bug in the PDF library setup).
- Every design decision was reviewed and chosen by me, and I can explain each part of the code.
