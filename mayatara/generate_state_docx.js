const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, TabStopType,
  TabStopPosition, LevelFormat,
} = require("docx");
const fs = require("fs");
const path = require("path");

// ── Palette ──────────────────────────────────────────────────────────────
const DARK_BLUE  = "1F4E79";
const MED_BLUE   = "2E75B6";
const LIGHT_BLUE = "EBF3FB";
const ACCENT     = "F0A500";
const WHITE      = "FFFFFF";
const BLACK      = "1A1A1A";
const GREY       = "666666";

// A4 in DXA (1 inch = 1440 DXA)
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1260; // ~0.875 inch
const CONTENT_W = PAGE_W - MARGIN * 2; // 9386 DXA

// ── Helpers ───────────────────────────────────────────────────────────────
const border = (color = "C9D9EC") => ({ style: BorderStyle.SINGLE, size: 4, color });
const cellBorders = {
  top: border(), bottom: border(), left: border(), right: border(),
};
const noBorder = { style: BorderStyle.NONE, size: 0, color: WHITE };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function hCell(text, w, bg = MED_BLUE) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: cellBorders,
    shading: { fill: bg, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, color: WHITE, size: 18, font: "Arial" })],
    })],
  });
}

function dCell(text, w, shade = false, bold = false) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: cellBorders,
    shading: { fill: shade ? LIGHT_BLUE : WHITE, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text, bold, color: BLACK, size: 17, font: "Arial" })],
    })],
  });
}

function makeTable(rows, colWidths) {
  // rows[0] = header row (array of strings)
  // rows[1..] = data rows
  const total = colWidths.reduce((a, b) => a + b, 0);
  const tableRows = rows.map((row, ri) => {
    const isHeader = ri === 0;
    return new TableRow({
      tableHeader: isHeader,
      children: row.map((cell, ci) => {
        if (isHeader) return hCell(cell, colWidths[ci]);
        const shade = ri % 2 === 0;
        const isFirstCol = ci === 0;
        return dCell(cell, colWidths[ci], shade, isFirstCol);
      }),
    });
  });
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: tableRows,
  });
}

function kpiTable(items) {
  // items = [[num, label], ...]
  const w = Math.floor(CONTENT_W / items.length);
  const cells = items.map(([num, lbl]) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      borders: { top: border(MED_BLUE), bottom: border(MED_BLUE), left: border(MED_BLUE), right: border(MED_BLUE) },
      shading: { fill: LIGHT_BLUE, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 80, right: 80 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: num, bold: true, color: DARK_BLUE, size: 36, font: "Arial" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: lbl, color: GREY, size: 15, font: "Arial" })],
        }),
      ],
    })
  );
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: items.map(() => w),
    rows: [new TableRow({ children: cells })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: MED_BLUE, space: 4 } },
    children: [new TextRun({ text, bold: true, color: DARK_BLUE, size: 28, font: "Arial" })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 180, after: 80 },
    children: [new TextRun({ text, bold: true, color: MED_BLUE, size: 22, font: "Arial" })],
  });
}

function body(text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, color: BLACK, size: 19, font: "Arial" })],
  });
}

function spacer(n = 1) {
  return Array.from({ length: n }, () =>
    new Paragraph({ children: [new TextRun("")], spacing: { after: 60 } })
  );
}

function coverTitleBlock(state, tagline) {
  return [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      shading: { fill: DARK_BLUE, type: ShadingType.CLEAR },
      spacing: { before: 0, after: 0 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 0, color: DARK_BLUE },
        bottom: { style: BorderStyle.SINGLE, size: 0, color: DARK_BLUE },
      },
      children: [new TextRun({ text: "", size: 4 })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 480, after: 40 },
      children: [new TextRun({ text: "arka Energy", bold: true, color: ACCENT, size: 26, font: "Arial" })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: `${state} Solar Farm`, bold: true, color: DARK_BLUE, size: 52, font: "Arial" })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: "Site Proposal — Phase 1", color: MED_BLUE, size: 30, font: "Arial" })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 320 },
      children: [new TextRun({ text: tagline, bold: true, color: ACCENT, size: 19, font: "Arial" })],
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: MED_BLUE, space: 4 } },
      children: [new TextRun("")],
      spacing: { after: 240 },
    }),
  ];
}

function metaTable(state) {
  const rows = [
    ["Prepared by", "Arka Energy (proposed incorporation — India)"],
    ["Document type", "Site Proposal & Investment Brief"],
    ["Classification", "Confidential — For Government and Investor Use Only"],
    ["Date", "July 2026"],
    ["Phase", "Phase 1 — 10 MW Pilot, Scale to 500 MW by Year 5"],
    ["State", state],
  ];
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [2800, CONTENT_W - 2800],
    rows: rows.map(([k, v], i) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 2800, type: WidthType.DXA },
            borders: cellBorders,
            shading: { fill: i % 2 === 0 ? WHITE : LIGHT_BLUE, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, color: DARK_BLUE, size: 18, font: "Arial" })] })],
          }),
          new TableCell({
            width: { size: CONTENT_W - 2800, type: WidthType.DXA },
            borders: cellBorders,
            shading: { fill: i % 2 === 0 ? WHITE : LIGHT_BLUE, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: v, color: BLACK, size: 18, font: "Arial" })] })],
          }),
        ],
      })
    ),
  });
}

function makeHeader(state) {
  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: DARK_BLUE, space: 4 } },
        spacing: { after: 80 },
        children: [
          new TextRun({ text: "Arka Energy", bold: true, color: DARK_BLUE, size: 17, font: "Arial" }),
          new TextRun({ text: `\tSite Proposal — ${state}  |  Confidential`, color: GREY, size: 16, font: "Arial" }),
        ],
      }),
    ],
  });
}

function makeFooter(state) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: DARK_BLUE, space: 4 } },
        spacing: { before: 80 },
        children: [
          new TextRun({ text: `Arka Energy | ${state} Site Proposal | Confidential   Page `, color: GREY, size: 15, font: "Arial" }),
          new TextRun({ children: [PageNumber.CURRENT], color: GREY, size: 15, font: "Arial" }),
        ],
      }),
    ],
  });
}

// ── Telangana Sections ────────────────────────────────────────────────────
function telanganaChildren() {
  return [
    // Cover
    ...coverTitleBlock("Telangana", "Government land offer received  |  60-80 km from Hyderabad  |  TSREDCO single-window clearance"),
    metaTable("Telangana"),
    new Paragraph({ children: [new PageBreak()] }),

    // 1. Executive Summary
    h1("1. Executive Summary"),
    body("Arka proposes to develop a 10 MW utility-scale solar farm on government-allocated wasteland in the Nalgonda / Mahbubnagar district of Telangana. The plant will sell electricity directly to urban consumers in Hyderabad via Open Access under the Electricity Amendment Act 2022 at Rs 4.5/unit — a 40% saving versus TSSPDCL rates. Surplus generation will be sold to SECI at Rs 2.5/unit under a 25-year PPA."),
    ...spacer(),
    kpiTable([
      ["10 MW", "Phase 1 Capacity"],
      ["21-23%", "Expected CUF"],
      ["5.5-5.8", "kWh/m2/day Irradiation"],
      ["Rs 56.5L", "Revenue/MW/yr"],
      ["75.6%", "EBITDA Margin"],
    ]),
    ...spacer(2),

    // 2. Site Details
    h1("2. Site Details"),
    makeTable([
      ["Parameter", "Detail"],
      ["Proposed site", "Nalgonda / Mahbubnagar district wasteland (TSREDCO designated zones)"],
      ["Distance from Hyderabad", "60-80 km"],
      ["Solar irradiation", "5.5-5.8 kWh/m2/day (annual average)"],
      ["CUF expected", "21-23% (base case 21%)"],
      ["Land area (Phase 1)", "35 acres wasteland; 50 acres with buffer"],
      ["Land status", "Government wasteland — TSREDCO land offer received"],
      ["Terrain", "Flat to gently sloping (<3 degrees gradient)"],
      ["Grid connection", "132kV Nagarjunasagar / Wanaparthy substation within 10 km"],
      ["Grid evacuation", "10 km 33kV line to nearest TSTRANSCO feeder"],
      ["Road access", "All-weather SH within 2 km"],
      ["Water for cleaning", "Borewell + 50,000L storage tank on-site"],
      ["Forest / tribal land", "None — designated wasteland, MOEF clearance not required"],
    ], [3600, CONTENT_W - 3600]),
    ...spacer(2),

    // 3. Urban Demand
    h1("3. Urban Demand: Hyderabad Open Access Market"),
    body("Hyderabad is India's fourth-largest urban economy. The IT corridor (HITEC City, Gachibowli, Madhapur), pharma clusters (Genome Valley), and 200+ large housing societies create a high-density open-access customer pool within our wheeling radius."),
    ...spacer(),
    makeTable([
      ["Customer Type", "Est. Count", "Monthly Bill", "Our Rate", "Saving"],
      ["Large housing society (200+ flats)", "12,000+", "Rs 2-8L", "Rs 4.5/unit", "40-44%"],
      ["IT park / office complex", "500+", "Rs 20-100L", "Rs 5.0/unit", "38-50%"],
      ["Private hospital (100+ beds)", "800+", "Rs 5-20L", "Rs 4.75/unit", "32-47%"],
      ["Pharma / biotech unit", "400+", "Rs 10-50L", "Rs 4.5/unit", "35-48%"],
      ["Commercial mall / retail", "200+", "Rs 10-50L", "Rs 5.0/unit", "38-50%"],
    ], [3400, 1400, 1500, 1600, 1486]),
    ...spacer(2),

    // 4. Regulatory
    h1("4. Regulatory Framework — Telangana"),
    makeTable([
      ["Item", "Status / Detail"],
      ["Open access regulator", "TSERC (Telangana State Electricity Regulatory Commission)"],
      ["EA 2022 compliance", "TSERC notified open access regulations — fully compliant"],
      ["CSS (Cross-Subsidy Surcharge)", "Rs 0.35/unit — among the lowest in India"],
      ["Wheeling charges", "Rs 0.55/unit (TSTRANSCO)"],
      ["Net deduction from Rs 4.5", "Rs 0.90/unit total — Arka net: Rs 3.60/unit"],
      ["Land allocation authority", "TSREDCO — single-window clearance"],
      ["Land lease rate", "Rs 2-4/sqft/year (government wasteland)"],
      ["CSS waiver (first 2 years)", "Telangana Solar Policy 2023 — CSS waived 24 months post-COD"],
      ["Statutory approvals", "CEA connectivity, TSTRANSCO evacuation, TSERC OAC, environmental clearance"],
      ["Timeline (land to COD)", "12-14 months (Phase 1, 10 MW)"],
    ], [3200, CONTENT_W - 3200]),
    ...spacer(2),

    // 5. Financial
    h1("5. Financial Snapshot"),
    makeTable([
      ["Metric", "Value", "Basis"],
      ["Total capex (10 MW Phase 1)", "Rs 42 Cr", "Rs 4.2 Cr/MW all-in"],
      ["Equity (30%)", "Rs 12.6 Cr", "Funded from Series A raise"],
      ["PFC debt (70%, 9%, 15yr)", "Rs 29.4 Cr", "Green energy project finance"],
      ["Annual revenue (10 MW)", "Rs 5.65 Cr", "Rs 56.5L/MW at 21% CUF"],
      ["EBITDA/MW/year", "Rs 42.7L", "75.6% EBITDA margin"],
      ["Debt service/MW/year", "Rs 27L", "EMI on 15-year PFC loan"],
      ["Free cash flow/MW/year", "Rs 15.7L", "After debt service"],
      ["Equity IRR", "22-28%", "Base case; upside at CUF 23%"],
      ["Break-even CUF", "18.1%", "vs 21% target — 3% cushion"],
      ["Phase 1 payback (equity)", "4-5 years", "Conservative"],
    ], [3400, 1900, CONTENT_W - 5300]),
    ...spacer(2),

    // 6. Timeline
    h1("6. Phase 1 Implementation Timeline"),
    makeTable([
      ["Month", "Milestone"],
      ["Month 1-2",  "Land allocation order from TSREDCO; MoU signing with Telangana government"],
      ["Month 2-3",  "DPR submission; PFC project loan application; EPC tender floating"],
      ["Month 3-4",  "TSERC open access certificate; CEA connectivity approval"],
      ["Month 4-6",  "EPC contract award (Tata Power Solar / Sterling Wilson); civil mobilisation"],
      ["Month 6-9",  "Panel procurement (Waaree OEM contract); inverter and transformer supply"],
      ["Month 8-11", "Panel installation; inverter commissioning; 33kV line stringing"],
      ["Month 11-12","Grid synchronisation test; TSTRANSCO acceptance; commissioning"],
      ["Month 12",   "Commercial Operations Date (COD) — first power delivered to Hyderabad consumers"],
      ["Month 12-18","Urban PPA pipeline: 50+ housing societies and IT parks signed up"],
    ], [1800, CONTENT_W - 1800]),
    ...spacer(2),

    // 7. Government Ask
    h1("7. Government Ask"),
    body("Arka requests the following from the Government of Telangana / TSREDCO to proceed with Phase 1:"),
    ...spacer(),
    makeTable([
      ["#", "Request", "Details"],
      ["1", "Land allocation — 50 acres", "Nalgonda / Mahbubnagar wasteland; 25-year lease at standard TSREDCO rate"],
      ["2", "TSTRANSCO grid connectivity", "33kV evacuation line + bay at nearest 132kV substation"],
      ["3", "Single-window clearance", "TSREDCO coordination of all state-level approvals"],
      ["4", "CSS waiver (24 months)", "As per Telangana Solar Policy 2023"],
      ["5", "Phase 2 land reservation", "350 acres held in reserve for 90 MW Phase 2 (Year 2-3)"],
    ], [480, 2800, CONTENT_W - 3280]),
    ...spacer(2),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: MED_BLUE, space: 4 } },
      spacing: { before: 160 },
      children: [new TextRun({ text: "Arka Energy  |  thrinathreddy@berkeley.edu  |  Confidential — Not for distribution", color: GREY, size: 15, font: "Arial" })],
    }),
  ];
}

// ── Andhra Pradesh Sections ───────────────────────────────────────────────
function apChildren() {
  return [
    // Cover
    ...coverTitleBlock("Andhra Pradesh", "Government land offer received  |  Kurnool Solar Corridor  |  Highest CUF in portfolio: 22-25%"),
    metaTable("Andhra Pradesh"),
    new Paragraph({ children: [new PageBreak()] }),

    // 1. Executive Summary
    h1("1. Executive Summary"),
    body("Arka proposes to develop a 10 MW utility-scale solar farm in the Kurnool / Anantapur solar corridor of Andhra Pradesh — one of the highest-irradiation zones in India at 5.8-6.2 kWh/m2/day. The plant will sell electricity directly to urban consumers in Vijayawada, Tirupati, and Visakhapatnam via Open Access at Rs 4.5/unit. Surplus generation will be sold to SECI at Rs 2.5/unit under a 25-year PPA. The AP government has offered land in the Kurnool Solar Park zone — India's proven large-scale solar hub."),
    ...spacer(),
    kpiTable([
      ["10 MW", "Phase 1 Capacity"],
      ["22-25%", "Expected CUF"],
      ["5.8-6.2", "kWh/m2/day Irradiation"],
      ["Rs 59.5L", "Revenue/MW/yr"],
      ["76.4%", "EBITDA Margin"],
    ]),
    ...spacer(2),

    // 2. Site Details
    h1("2. Site Details"),
    makeTable([
      ["Parameter", "Detail"],
      ["Proposed site", "Kurnool / Anantapur district wasteland (AP Solar Park zone)"],
      ["Distance to urban centres", "50-80 km to Vijayawada / Tirupati / Nellore"],
      ["Solar irradiation", "5.8-6.2 kWh/m2/day — highest in peninsular India"],
      ["CUF expected", "22-25% (base case 22%) — best CUF in our portfolio"],
      ["Land area (Phase 1)", "35 acres wasteland; 50 acres with buffer"],
      ["Land status", "AP government land offer received — Kurnool Solar Park designation"],
      ["Terrain", "Flat semi-arid terrain, ideal for large ground-mount arrays"],
      ["Grid connection", "220kV Kurnool substation within 8 km; dedicated AP Transco solar feeder"],
      ["Grid evacuation", "8 km 33kV line to AP Transco feeder (shared solar park infrastructure)"],
      ["Road access", "All-weather NH/SH within 1.5 km"],
      ["Water for cleaning", "Borewell + 50,000L storage; Tungabhadra canal within 15 km"],
      ["Ecosystem advantage", "ReNew, Greenko, SoftBank already in Kurnool park — grid, roads, O&M vendors proven"],
    ], [3600, CONTENT_W - 3600]),
    ...spacer(2),

    // 3. Urban Demand
    h1("3. Urban Demand: Andhra Pradesh Open Access Market"),
    body("Andhra Pradesh's three major urban centres — Vijayawada (capital region + industrial), Visakhapatnam (port + pharma + IT), and Tirupati (institutional + tourism) — collectively represent a large and underserved open-access market. APERC has operationalised EA 2022 open access with an active CSS waiver scheme."),
    ...spacer(),
    makeTable([
      ["Customer Type", "Est. Count (AP)", "Monthly Bill", "Our Rate", "Saving"],
      ["Large housing society (200+ flats)", "8,000+", "Rs 2-8L", "Rs 4.5/unit", "40-44%"],
      ["Industrial / SME unit", "15,000+", "Rs 5-50L", "Rs 4.25/unit", "30-47%"],
      ["Private hospital (100+ beds)", "600+", "Rs 5-20L", "Rs 4.75/unit", "32-47%"],
      ["IT / BPO campus (Vizag)", "300+", "Rs 20-80L", "Rs 5.0/unit", "38-50%"],
      ["Institutional / education (Tirupati)", "200+", "Rs 5-30L", "Rs 4.5/unit", "35-48%"],
    ], [3400, 1400, 1500, 1600, 1486]),
    ...spacer(2),

    // 4. Regulatory
    h1("4. Regulatory Framework — Andhra Pradesh"),
    makeTable([
      ["Item", "Status / Detail"],
      ["Open access regulator", "APERC (Andhra Pradesh Electricity Regulatory Commission)"],
      ["EA 2022 compliance", "APERC open access regulations notified and operational"],
      ["CSS (Cross-Subsidy Surcharge)", "Rs 0.30/unit — very competitive"],
      ["Wheeling charges", "Rs 0.50/unit (AP Transco)"],
      ["Net deduction from Rs 4.5", "Rs 0.80/unit total — Arka net: Rs 3.70/unit (best in portfolio)"],
      ["Land allocation authority", "AP Solar Power Corporation / NREDCAP — designated solar park"],
      ["Land premium", "Rs 0 land premium for first 500 MW — AP Solar Policy 2023"],
      ["Lease rate", "Rs 2-3/sqft/year on government wasteland"],
      ["CSS waiver scheme", "APERC CSS waiver for open access renewable projects — active"],
      ["Statutory approvals", "CEA connectivity, AP Transco evacuation, APERC OAC, environmental clearance"],
      ["Timeline (land to COD)", "11-13 months (established solar park ecosystem accelerates approvals)"],
    ], [3200, CONTENT_W - 3200]),
    ...spacer(2),

    // 5. Financial
    h1("5. Financial Snapshot"),
    body("Andhra Pradesh is the highest-yield site in our portfolio. The 22-25% CUF and lowest open access charges (Rs 0.80/unit vs Rs 1.05/unit national average) produce the best unit economics of our two Phase 1 sites."),
    ...spacer(),
    makeTable([
      ["Metric", "Value", "Notes"],
      ["Total capex (10 MW Phase 1)", "Rs 42 Cr", "Rs 4.2 Cr/MW all-in"],
      ["Equity (30%)", "Rs 12.6 Cr", "Funded from Series A raise"],
      ["PFC debt (70%, 9%, 15yr)", "Rs 29.4 Cr", "Green energy project finance"],
      ["Annual generation (22% CUF)", "19.27L units/MW/yr", "+4.7% over base case"],
      ["Annual revenue (10 MW)", "Rs 5.95 Cr", "Rs 59.5L/MW — highest in portfolio"],
      ["EBITDA/MW/year", "Rs 45.5L", "76.4% margin (lower open access charges)"],
      ["Debt service/MW/year", "Rs 27L", "EMI on 15-year PFC loan"],
      ["Free cash flow/MW/year", "Rs 18.5L", "After debt service — 18% higher than base case"],
      ["Equity IRR", "24-30%", "Upside vs base case from CUF + lower charges"],
      ["Break-even CUF", "17.8%", "vs 22% target — 4.2% cushion"],
    ], [3400, 1900, CONTENT_W - 5300]),
    ...spacer(2),

    // 6. Timeline
    h1("6. Phase 1 Implementation Timeline"),
    makeTable([
      ["Month", "Milestone"],
      ["Month 1-2",  "Land allocation from AP Solar Power Corp; MoU signing with Andhra Pradesh government"],
      ["Month 2-3",  "DPR submission; PFC project loan application; EPC tender (Kurnool park ecosystem)"],
      ["Month 3-4",  "APERC open access certificate; CEA connectivity approval; AP Transco bay allocation"],
      ["Month 4-6",  "EPC contract award; civil mobilisation (existing O&M contractors in Kurnool available)"],
      ["Month 6-9",  "Panel procurement (Waaree OEM contract); inverter and transformer delivery"],
      ["Month 8-11", "Panel installation; inverter commissioning; 33kV line to AP Transco feeder"],
      ["Month 11-12","Grid synchronisation test; AP Transco acceptance; commissioning"],
      ["Month 12",   "Commercial Operations Date (COD) — first power to Vijayawada / Tirupati consumers"],
      ["Month 12-18","Urban PPA pipeline: 50+ housing societies, industrial units, and hospitals signed"],
    ], [1800, CONTENT_W - 1800]),
    ...spacer(2),

    // 7. Government Ask
    h1("7. Government Ask"),
    body("Arka requests the following from the Government of Andhra Pradesh / AP Solar Power Corporation to proceed with Phase 1:"),
    ...spacer(),
    makeTable([
      ["#", "Request", "Details"],
      ["1", "Land allocation — 50 acres", "Kurnool Solar Park zone; 25-year lease at AP Solar Policy rate (Rs 0 premium)"],
      ["2", "AP Transco grid connectivity", "33kV bay at 220kV Kurnool substation; shared feeder where available"],
      ["3", "NREDCAP single-window clearance", "Coordination of all state-level approvals through AP Solar Power Corp"],
      ["4", "CSS waiver (APERC scheme)", "Activate CSS waiver for our OA certificate as per APERC notification"],
      ["5", "Phase 2 land reservation", "350 acres held in reserve for 90 MW Phase 2 (Year 2-3) in same zone"],
    ], [480, 2800, CONTENT_W - 3280]),
    ...spacer(2),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: MED_BLUE, space: 4 } },
      spacing: { before: 160 },
      children: [new TextRun({ text: "Arka Energy  |  thrinathreddy@berkeley.edu  |  Confidential — Not for distribution", color: GREY, size: 15, font: "Arial" })],
    }),
  ];
}

// ── Build ─────────────────────────────────────────────────────────────────
function buildDoc(state, children) {
  return new Document({
    styles: {
      default: {
        document: { run: { font: "Arial", size: 19, color: BLACK } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: { default: makeHeader(state) },
      footers: { default: makeFooter(state) },
      children,
    }],
  });
}

async function main() {
  const desktop = process.env.HOME + "/Desktop";

  const tsDOC = buildDoc("Telangana", telanganaChildren());
  const tsBuffer = await Packer.toBuffer(tsDOC);
  fs.writeFileSync(path.join(desktop, "Arka_Telangana_Site_Proposal.docx"), tsBuffer);
  console.log("  Written: Arka_Telangana_Site_Proposal.docx");

  const apDOC = buildDoc("Andhra Pradesh", apChildren());
  const apBuffer = await Packer.toBuffer(apDOC);
  fs.writeFileSync(path.join(desktop, "Arka_AndhraPradesh_Site_Proposal.docx"), apBuffer);
  console.log("  Written: Arka_AndhraPradesh_Site_Proposal.docx");

  console.log("Done — both .docx files on Desktop.");
}

main().catch(err => { console.error(err); process.exit(1); });
