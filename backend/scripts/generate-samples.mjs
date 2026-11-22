/**
 * Generates the sample PDFs in /samples used for testing and the demo.
 *
 *   npm run samples   (from backend/)
 *
 * All organisations, people, sites and values are fictional. Each file
 * targets one or more edge cases:
 *
 * Lab reports (the assignment's example)
 *   01-cbc-10-parameters.pdf            10 parameters, "Report ID", H/L flags
 *   02-lipid-thyroid-8-parameters.pdf   8 parameters, "Sample ID", different header wording
 *   03-metabolic-13-parameters-2-pages  13 parameters, table continues on page 2
 *                                       WITHOUT a repeated header, section titles
 *   04-urine-text-values.pdf            "Positive", "Nil", "<5", missing units/ranges/value
 *   05-no-report-id.pdf                 no report / sample ID anywhere
 *   06-scanned-cbc.pdf                  image-only copy of 01 (needs OCR)
 *   07-corrupted.pdf                    truncated file (should be rejected, 422)
 *   08-not-a-pdf.pdf                    a text file named .pdf (should be rejected, 415)
 *
 * Industrial / SCADA reports
 *   09-scada-daily-process-report.pdf   Tag + Description, separate Lo/Hi limit columns,
 *                                       Status column, "COMM FAIL", 2 pages WITH repeated header
 *   10-transformer-test-report.pdf      S.No column, "Acceptance Criteria" (>=, Min, Max),
 *                                       Pass/Fail column, text value "Dyn11"
 *   11-water-quality-report.pdf         "Permissible Limit", "BDL", "Not Detected",
 *                                       Test Method column to ignore
 *   12-pressure-calibration-cert.pdf    units only in column titles ("Reading (bar)"),
 *                                       Applied / Error columns to ignore, "± 0.025" tolerance
 *
 * Plain JavaScript (not TypeScript) so it runs on any supported Node version
 * without a build step. Note: the built-in PDF fonts cannot draw "Ω", so the
 * industrial samples write "Ohm" / "MOhm".
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'samples');

const ROW_HEIGHT = 18;
const PAGE_BOTTOM = 760;

// -------------------------------------------------------------- page layouts

/** Shared look of the lab reports. */
const LAB = {
  org: ['SUNRISE DIAGNOSTICS', '12 Lake Road, Pune 411001  |  Fictional laboratory for testing'],
  columns: [50, 235, 335, 425],
  fontSize: 10,
  signature: 'Dr. S. Kulkarni, MD (Pathology)',
  repeatHeader: false,
};

const collected = 'Collected: 18-Nov-2026 08:10        Reported: 18-Nov-2026 14:32';

// ------------------------------------------------------------ lab report data

const CBC = {
  ...LAB,
  file: '01-cbc-10-parameters.pdf',
  title: 'COMPLETE BLOOD COUNT (CBC)',
  info: ['Patient Name: Asha Verma        Age/Sex: 34 Y / F', 'Report ID: LR-2026-001042', collected],
  header: ['Test', 'Result', 'Unit', 'Reference Range'],
  rows: [
    ['Hemoglobin', '11.2 L', 'g/dL', '12.0 - 15.5'],
    ['Total RBC Count', '4.3', 'million/µL', '4.0 - 5.2'],
    ['Packed Cell Volume (PCV)', '36.1', '%', '36 - 46'],
    ['Mean Corpuscular Volume (MCV)', '84', 'fL', '80 - 100'],
    ['MCH', '26.0 L', 'pg', '27 - 33'],
    ['MCHC', '31.0 L', 'g/dL', '32 - 36'],
    ['Total WBC Count', '11,800 H', 'cells/µL', '4,000 - 11,000'],
    ['Neutrophils', '72', '%', '40 - 75'],
    ['Lymphocytes', '21', '%', '20 - 45'],
    ['Platelet Count', '2,45,000', '/µL', '1,50,000 - 4,10,000'],
  ],
};

const LIPID_THYROID = {
  ...LAB,
  file: '02-lipid-thyroid-8-parameters.pdf',
  title: 'LIPID PROFILE & THYROID FUNCTION',
  info: ['Patient Name: Rahul Mehta        Age/Sex: 52 Y / M', 'Sample ID: SMP-88213', collected],
  header: ['Investigation', 'Observed Value', 'Units', 'Biological Reference Interval'],
  rows: [
    ['Total Cholesterol', '232', 'mg/dL', '< 200'],
    ['Triglycerides', '180', 'mg/dL', '< 150'],
    ['HDL Cholesterol', '38', 'mg/dL', '> 40'],
    ['LDL Cholesterol', '158', 'mg/dL', 'Up to 100'],
    ['VLDL Cholesterol', '36', 'mg/dL', '5 - 40'],
    ['T3 (Total)', '1.1', 'ng/mL', '0.8 - 2.0'],
    ['T4 (Total)', '7.9', 'µg/dL', '5.1 - 14.1'],
    ['TSH', '5.8', 'µIU/mL', '0.27 - 4.20'],
  ],
};

/** 13 rows split by section titles; page 2 has no repeated header. */
const METABOLIC = {
  ...LAB,
  file: '03-metabolic-13-parameters-2-pages.pdf',
  title: 'COMPREHENSIVE METABOLIC PANEL',
  info: ['Patient Name: Farah Khan        Age/Sex: 61 Y / F', 'Report ID: LR-2026-001077', collected],
  header: ['Test Name', 'Result', 'Unit', 'Reference Range'],
  sections: [
    ['KIDNEY FUNCTION', [
      ['Blood Urea', '48', 'mg/dL', '15 - 40'],
      ['Serum Creatinine', '1.4', 'mg/dL', '0.6 - 1.1'],
      ['Uric Acid', '6.1', 'mg/dL', '2.6 - 6.0'],
      ['eGFR', '42', 'mL/min/1.73m²', '> 60'],
    ]],
    ['ELECTROLYTES', [
      ['Sodium', '138', 'mmol/L', '135 - 145'],
      ['Potassium', '5.4', 'mmol/L', '3.5 - 5.1'],
      ['Chloride', '101', 'mmol/L', '98 - 107'],
    ]],
    ['LIVER FUNCTION', [
      ['Total Bilirubin', '0.8', 'mg/dL', '0.3 - 1.2'],
      ['SGOT (AST)', '34', 'U/L', '< 35'],
      ['SGPT (ALT)', '29', 'U/L', '< 35'],
      ['Alkaline Phosphatase', '96', 'U/L', '30 - 120'],
      ['Total Protein', '6.9', 'g/dL', '6.4 - 8.3'],
      ['Albumin', '3.9', 'g/dL', '3.5 - 5.2'],
    ]],
  ],
  // Leave little room on page 1 so the table must continue on page 2.
  firstPageBottom: 330,
};

const URINE = {
  ...LAB,
  file: '04-urine-text-values.pdf',
  title: 'URINE ROUTINE & SEROLOGY',
  info: ['Patient Name: Kiran Rao        Age/Sex: 28 Y / M', 'Specimen No: UR/2026/4471', collected],
  header: ['Test', 'Result', 'Unit', 'Reference Range'],
  rows: [
    ['Colour', 'Pale Yellow', '', 'Pale Yellow'],
    ['Specific Gravity', '1.020', '', '1.005 - 1.030'],
    ['Urine Protein', 'Nil', '', 'Nil'],
    ['Urine Glucose', 'Positive', '', 'Negative'],
    ['Pus Cells', '2-3', '/hpf', '0 - 5'],
    ['C-Reactive Protein (CRP)', '<5', 'mg/L', '< 6'],
    ['HIV I & II Antibodies', 'Non Reactive', '', ''],
    ['HBsAg', 'Negative', '', ''],
    ['Vitamin D (25-OH)', '', 'ng/mL', '30 - 100'],
  ],
};

const NO_ID = {
  ...LAB,
  file: '05-no-report-id.pdf',
  title: 'BLOOD SUGAR',
  // null keeps the line's slot empty: no ID is printed anywhere.
  info: ['Patient Name: Meera Iyer        Age/Sex: 45 Y / F', null, collected],
  header: ['Test', 'Result', 'Unit', 'Reference Range'],
  rows: [
    ['Glucose (Fasting)', '126', 'mg/dL', '70 - 100'],
    ['Glucose (Post Prandial)', '182', 'mg/dL', '70 - 140'],
    ['HbA1c', '6.9', '%', '4.0 - 5.6'],
    ['Mean Blood Glucose', '151', 'mg/dL', ''],
    ['Fasting Insulin', '14.2', 'µIU/mL', '2.6 - 24.9'],
    ['HOMA-IR', '4.4', '', '< 2.5'],
  ],
};

// ----------------------------------------------------- industrial report data

/** Industrial sign-off lines are longer, so they start further left. */
const INDUSTRIAL_SIGNATURE_X = 260;

/** SCADA daily summary: Tag + Description, Lo/Hi limit columns, Status column. */
const SCADA_DAILY = {
  file: '09-scada-daily-process-report.pdf',
  org: ['SHIROLI WATER SUPPLY SCHEME - SCADA', 'Booster Pumping Station PS-04  |  Fictional system for testing'],
  info: [
    'Report No: SCADA-DR-20261121-PS04',
    'Station: PS-04 Shiroli Booster        Report Type: Daily Process Summary',
    'Period: 21-Nov-2026 06:00 to 22-Nov-2026 06:00        Generated: 22-Nov-2026 06:05',
  ],
  title: 'DAILY PROCESS REPORT',
  header: ['Tag', 'Description', 'Value', 'Unit', 'Lo Limit', 'Hi Limit', 'Status'],
  columns: [45, 100, 250, 315, 375, 430, 485],
  fontSize: 9,
  sections: [
    ['INLET & RAW WATER', [
      ['FT-101', 'Raw Water Inlet Flow', '182.4', 'm³/h', '120', '250', 'NORMAL'],
      ['PT-101', 'Inlet Header Pressure', '2.8', 'bar', '1.5', '4.0', 'NORMAL'],
      ['AT-102', 'Raw Water Turbidity', '14.6', 'NTU', '', '10', 'HI ALARM'],
      ['AT-103', 'Raw Water pH', '7.6', 'pH', '6.5', '8.5', 'NORMAL'],
    ]],
    ['PUMPING', [
      ['P-201', 'Pump 1 Motor Current', '41.2', 'A', '', '55', 'RUNNING'],
      ['P-202', 'Pump 2 Motor Current', '0.0', 'A', '', '55', 'STANDBY'],
      ['TT-203', 'Pump 1 Bearing Temperature', '68.5', '°C', '', '80', 'NORMAL'],
      ['VT-204', 'Pump 1 Vibration', '7.9', 'mm/s', '', '7.1', 'HI ALARM'],
      ['PT-205', 'Discharge Header Pressure', '5.6', 'bar', '4.5', '6.5', 'NORMAL'],
      ['FT-206', 'Outlet Flow', '176.9', 'm³/h', '100', '250', 'NORMAL'],
    ]],
    ['STORAGE & OUTLET', [
      ['LT-301', 'Clear Water Reservoir Level', '3.42', 'm', '1.00', '4.50', 'NORMAL'],
      ['LT-302', 'Elevated Tank Level', 'COMM FAIL', 'm', '0.50', '6.00', 'COMM FAIL'],
      ['AT-303', 'Residual Chlorine at Outlet', '0.18', 'mg/L', '0.20', '1.00', 'LO ALARM'],
    ]],
    ['POWER & ENERGY', [
      ['EM-401', 'Total Energy Consumed', '2,184.5', 'kWh', '', '', ''],
      ['EM-402', 'Average Power Factor', '0.93', '', '0.90', '', 'NORMAL'],
      ['EM-403', 'Supply Voltage (R-Y)', '418', 'V', '380', '440', 'NORMAL'],
      ['P-201H', 'Pump 1 Running Hours', '21.6', 'h', '', '', ''],
    ]],
  ],
  firstPageBottom: 420,
  repeatHeader: true,
  signature: 'Reviewed by: Shift Engineer (PS-04)',
  signatureX: INDUSTRIAL_SIGNATURE_X,
};

/** Equipment test report: S.No, Acceptance Criteria, Pass/Fail result column. */
const TRANSFORMER_TEST = {
  file: '10-transformer-test-report.pdf',
  org: ['VOLTLINE TESTING & COMMISSIONING', 'Plot 18, Industrial Area, Kolhapur  |  Fictional company for testing'],
  info: [
    'Test Report No: TR/2026/0457        Work Order No: WO-88121',
    'Equipment: 11/0.433 kV, 1000 kVA Distribution Transformer        Asset ID: TX-11KV-03',
    'Site: Substation 2, Hatkanangale        Test Date: 19-Nov-2026        Ambient: 29 °C',
  ],
  title: 'TRANSFORMER PRE-COMMISSIONING TEST REPORT',
  header: ['S.No', 'Test Parameter', 'Measured Value', 'Unit', 'Acceptance Criteria', 'Result'],
  columns: [45, 75, 270, 355, 405, 505],
  fontSize: 9,
  rows: [
    ['1', 'Insulation Resistance HV-Earth (60 s)', '2,450', 'MOhm', '>= 1000', 'Pass'],
    ['2', 'Insulation Resistance LV-Earth (60 s)', '1,180', 'MOhm', '>= 500', 'Pass'],
    ['3', 'Insulation Resistance HV-LV (60 s)', '3,100', 'MOhm', '>= 1000', 'Pass'],
    ['4', 'Polarisation Index (HV-Earth)', '1.8', '', '>= 2.0', 'Fail'],
    ['5', 'Winding Resistance HV (R-Y)', '1.245', 'Ohm', '', 'Recorded'],
    ['6', 'Winding Resistance LV (r-n)', '0.84', 'mOhm', '', 'Recorded'],
    ['7', 'Turns Ratio (Tap 3)', '25.41', '', '25.27 - 25.53', 'Pass'],
    ['8', 'Vector Group', 'Dyn11', '', 'Dyn11', 'Pass'],
    ['9', 'Oil Breakdown Voltage (BDV)', '62', 'kV', 'Min 50', 'Pass'],
    ['10', 'Moisture Content in Oil', '18', 'ppm', 'Max 20', 'Pass'],
    ['11', 'Tan Delta (HV Winding)', '0.45', '%', '< 0.5', 'Pass'],
    ['12', 'Magnetising Current (R phase)', '2.1', 'mA', '', 'Recorded'],
  ],
  signature: 'Tested by: R. Patil        Approved by: M. Shah',
  signatureX: INDUSTRIAL_SIGNATURE_X,
};

/** Treatment-plant water quality report: Permissible Limit, BDL, Test Method column. */
const WATER_QUALITY = {
  file: '11-water-quality-report.pdf',
  org: ['SHIROLI WATER TREATMENT PLANT - QUALITY LAB', 'Kolhapur  |  Fictional laboratory for testing'],
  info: [
    'Report No.: WTP/LAB/2026/1123',
    'Sample: Treated water, Clear Water Reservoir outlet        Sampled: 20-Nov-2026 07:30',
    'Sample Type: Grab        Analysed: 20-Nov-2026 15:10',
  ],
  title: 'TREATED WATER QUALITY ANALYSIS',
  header: ['Parameter', 'Result', 'Unit', 'Permissible Limit', 'Test Method'],
  columns: [45, 215, 290, 360, 455],
  fontSize: 9,
  rows: [
    ['pH', '7.4', '', '6.5 - 8.5', 'IS 3025 (Part 11)'],
    ['Turbidity', '0.8', 'NTU', 'Max 1', 'IS 3025 (Part 10)'],
    ['Total Dissolved Solids', '412', 'mg/L', 'Max 500', 'IS 3025 (Part 16)'],
    ['Total Hardness (as CaCO3)', '186', 'mg/L', 'Max 200', 'IS 3025 (Part 21)'],
    ['Residual Free Chlorine', '0.12', 'mg/L', '0.2 - 1.0', 'IS 3025 (Part 26)'],
    ['Iron (as Fe)', 'BDL', 'mg/L', 'Max 0.3', 'IS 3025 (Part 53)'],
    ['Fluoride (as F)', '0.6', 'mg/L', 'Max 1.0', 'IS 3025 (Part 60)'],
    ['Nitrate (as NO3)', '12.4', 'mg/L', 'Max 45', 'IS 3025 (Part 34)'],
    ['Chloride (as Cl)', '248', 'mg/L', 'Max 250', 'IS 3025 (Part 32)'],
    ['Arsenic (as As)', '< 0.01', 'mg/L', 'Max 0.01', 'IS 3025 (Part 37)'],
    ['Total Coliform', 'Not Detected', 'MPN/100 mL', 'Absent', 'IS 1622'],
    ['E. coli', 'Absent', '/100 mL', 'Absent', 'IS 1622'],
  ],
  signature: 'Analysed by: Chemist        Verified by: Quality Manager',
  signatureX: INDUSTRIAL_SIGNATURE_X,
};

/** Calibration certificate: units in column titles, several numeric columns. */
const CALIBRATION = {
  file: '12-pressure-calibration-cert.pdf',
  org: ['PRECICAL INSTRUMENT CALIBRATION LAB', 'Ichalkaranji  |  Fictional laboratory for testing'],
  info: [
    'Calibration Certificate No: CC/2026/1187',
    'Instrument: Pressure Transmitter, Tag PT-205        Range: 0 - 10 bar        Output: 4-20 mA',
    'Customer: PS-04 Shiroli Booster        Calibrated: 18-Nov-2026        Due: 17-Nov-2027',
  ],
  title: 'CALIBRATION RESULTS (AS FOUND)',
  header: ['Test Point', 'Applied (bar)', 'Reading (bar)', 'Error (bar)', 'Tolerance (bar)', 'Result'],
  columns: [45, 160, 245, 330, 410, 495],
  fontSize: 9,
  rows: [
    ['Point 1 (0 %, up)', '0.000', '0.012', '+0.012', '± 0.025', 'Pass'],
    ['Point 2 (25 %, up)', '2.500', '2.514', '+0.014', '± 0.025', 'Pass'],
    ['Point 3 (50 %, up)', '5.000', '5.031', '+0.031', '± 0.025', 'Fail'],
    ['Point 4 (75 %, up)', '7.500', '7.519', '+0.019', '± 0.025', 'Pass'],
    ['Point 5 (100 %)', '10.000', '10.022', '+0.022', '± 0.025', 'Pass'],
    ['Point 6 (75 %, down)', '7.500', '7.508', '+0.008', '± 0.025', 'Pass'],
    ['Point 7 (50 %, down)', '5.000', '5.017', '+0.017', '± 0.025', 'Pass'],
    ['Point 8 (25 %, down)', '2.500', '2.509', '+0.009', '± 0.025', 'Pass'],
    ['Point 9 (0 %, down)', '0.000', '0.006', '+0.006', '± 0.025', 'Pass'],
  ],
  signature: 'Calibrated by: S. Jadhav        Authorised by: Lab Manager',
  signatureX: INDUSTRIAL_SIGNATURE_X,
};

// ------------------------------------------------------------------- drawing

/** Builds a PDF in memory with pdfkit and returns its bytes. */
function buildPdf(draw) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: false,
    // Lets us return to earlier pages to stamp "Page x of y".
    bufferPages: true,
    // A fixed date makes the output identical on every run (stable in git).
    info: { CreationDate: new Date('2026-11-18T00:00:00Z'), Producer: 'PDFReader sample generator' },
  });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  draw(doc);
  doc.end();
  return done;
}

/** Writes text at an exact position without pdfkit's automatic wrapping or paging. */
function put(doc, text, x, y, options = {}) {
  doc.text(text, x, y, { lineBreak: false, ...options });
}

/** Organisation banner and the report's info lines (IDs, dates, site...). */
function drawPageTop(doc, report) {
  const [name, subtitle] = report.org;
  doc.font('Helvetica-Bold').fontSize(14);
  put(doc, name, 50, 40);
  doc.font('Helvetica').fontSize(8);
  put(doc, subtitle, 50, 58);
  doc.moveTo(50, 72).lineTo(545, 72).stroke();

  doc.fontSize(10);
  report.info.forEach((line, i) => line && put(doc, line, 50, 84 + i * 16));
}

function drawHeader(doc, report, y) {
  doc.font('Helvetica-Bold').fontSize(report.fontSize);
  report.header.forEach((title, i) => put(doc, title, report.columns[i], y));
  doc.moveTo(50, y + 14).lineTo(545, y + 14).stroke();
  doc.font('Helvetica');
  return y + 22;
}

function drawRow(doc, report, row, y) {
  row.forEach((cell, i) => cell && put(doc, cell, report.columns[i], y));
}

function drawFooters(doc, pageCount) {
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8);
    put(doc, `Page ${i + 1} of ${pageCount}`, 270, 805);
  }
}

/** A report with a banner, info lines and one result table (paged if needed). */
function renderReport(report) {
  return buildPdf((doc) => {
    // Flatten sections into a list of [kind, content] lines.
    const lines = report.sections
      ? report.sections.flatMap(([title, rows]) => [['section', title], ...rows.map((r) => ['row', r])])
      : report.rows.map((r) => ['row', r]);

    doc.addPage();
    drawPageTop(doc, report);
    doc.font('Helvetica-Bold').fontSize(12);
    put(doc, report.title, 50, 145);
    let y = drawHeader(doc, report, 170);
    let pageBottom = report.firstPageBottom ?? PAGE_BOTTOM;
    let pages = 1;

    for (const [kind, content] of lines) {
      if (y > pageBottom) {
        // Continue on a new page, repeating the column header only if asked.
        doc.addPage();
        pages++;
        drawPageTop(doc, report);
        y = report.repeatHeader ? drawHeader(doc, report, 150) : 150;
        pageBottom = PAGE_BOTTOM;
      }
      doc.fontSize(report.fontSize);
      if (kind === 'section') {
        doc.font('Helvetica-Bold');
        put(doc, content, 50, y);
        doc.font('Helvetica');
      } else {
        drawRow(doc, report, content, y);
      }
      y += ROW_HEIGHT;
    }

    doc.font('Helvetica-Oblique').fontSize(9);
    put(doc, '*** End of Report ***', 240, y + 20);
    put(doc, report.signature, report.signatureX ?? 380, y + 60);
    drawFooters(doc, pages);
  });
}

/**
 * Simulates a scanner: renders every page to an image and builds a new PDF
 * containing only those images (no text layer), so it can only be read by OCR.
 */
async function toScannedPdf(pdfBytes, dpi = 200) {
  const scale = dpi / 72;
  const source = await getDocument({ data: new Uint8Array(pdfBytes), verbosity: VerbosityLevel.ERRORS })
    .promise;
  const images = [];
  for (let n = 1; n <= source.numPages; n++) {
    const page = await source.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas, viewport }).promise;
    images.push({ png: canvas.toBuffer('image/png'), width: viewport.width / scale, height: viewport.height / scale });
  }
  await source.loadingTask.destroy();

  return buildPdf((doc) => {
    for (const image of images) {
      doc.addPage({ size: [image.width, image.height] });
      doc.image(image.png, 0, 0, { width: image.width, height: image.height });
    }
  });
}

// ---------------------------------------------------------------------- main

await mkdir(OUT_DIR, { recursive: true });

const outputs = {};
for (const report of [CBC, LIPID_THYROID, METABOLIC, URINE, NO_ID]) {
  outputs[report.file] = await renderReport(report);
}
outputs['06-scanned-cbc.pdf'] = await toScannedPdf(outputs[CBC.file]);
// Keep only the first 40%: the header is valid but the structure is cut off.
outputs['07-corrupted.pdf'] = outputs[CBC.file].subarray(0, Math.floor(outputs[CBC.file].length * 0.4));
outputs['08-not-a-pdf.pdf'] = Buffer.from('This is a plain text file pretending to be a PDF.\n');

for (const report of [SCADA_DAILY, TRANSFORMER_TEST, WATER_QUALITY, CALIBRATION]) {
  outputs[report.file] = await renderReport(report);
}

for (const [file, bytes] of Object.entries(outputs)) {
  await writeFile(path.join(OUT_DIR, file), bytes);
  console.log(`wrote samples/${file} (${(bytes.length / 1024).toFixed(1)} KB)`);
}
