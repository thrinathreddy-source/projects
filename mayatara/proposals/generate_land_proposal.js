const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak, TabStopType, TabStopPosition,
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

const PAGE_W    = 11906;
const PAGE_H    = 16838;
const MARGIN    = 1260;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── Table helpers ─────────────────────────────────────────────────────────
const b  = (c = "C9D9EC") => ({ style: BorderStyle.SINGLE, size: 4, color: c });
const cb = { top: b(), bottom: b(), left: b(), right: b() };

function hCell(text, w) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: cb,
    shading: { fill: MED_BLUE, type: ShadingType.CLEAR },
    margins: { top: 90, bottom: 90, left: 140, right: 140 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, color: WHITE, size: 18, font: "Arial" })],
    })],
  });
}

function dCell(text, w, shade = false, bold = false) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: cb,
    shading: { fill: shade ? LIGHT_BLUE : WHITE, type: ShadingType.CLEAR },
    margins: { top: 90, bottom: 90, left: 140, right: 140 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text, bold, color: BLACK, size: 17, font: "Arial" })],
    })],
  });
}

function makeTable(rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: rows.map((row, ri) =>
      new TableRow({
        tableHeader: ri === 0,
        children: row.map((cell, ci) =>
          ri === 0
            ? hCell(cell, colWidths[ci])
            : dCell(cell, colWidths[ci], ri % 2 === 0, ci === 0)
        ),
      })
    ),
  });
}

function kpiTable(items) {
  const w = Math.floor(CONTENT_W / items.length);
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: items.map(() => w),
    rows: [new TableRow({
      children: items.map(([num, lbl]) =>
        new TableCell({
          width: { size: w, type: WidthType.DXA },
          borders: { top: b(MED_BLUE), bottom: b(MED_BLUE), left: b(MED_BLUE), right: b(MED_BLUE) },
          shading: { fill: LIGHT_BLUE, type: ShadingType.CLEAR },
          margins: { top: 120, bottom: 120, left: 80, right: 80 },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: num, bold: true, color: DARK_BLUE, size: 36, font: "Arial" })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: lbl, color: GREY, size: 15, font: "Arial" })] }),
          ],
        })
      ),
    })],
  });
}

// ── Text helpers ──────────────────────────────────────────────────────────
const sp = (n = 1) => Array.from({ length: n }, () =>
  new Paragraph({ children: [new TextRun("")], spacing: { after: 60 } })
);

function h1(text) {
  return new Paragraph({
    spacing: { before: 360, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: MED_BLUE, space: 4 } },
    children: [new TextRun({ text, bold: true, color: DARK_BLUE, size: 30, font: "Arial" })],
  });
}

function h2(text) {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, bold: true, color: MED_BLUE, size: 22, font: "Arial" })],
  });
}

function body(text) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text, color: BLACK, size: 19, font: "Arial" })],
  });
}

function note(text) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, italics: true, color: GREY, size: 17, font: "Arial" })],
  });
}

// ── Header / Footer ───────────────────────────────────────────────────────
const docHeader = new Header({
  children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: DARK_BLUE, space: 4 } },
    spacing: { after: 80 },
    children: [
      new TextRun({ text: "Arka Energy", bold: true, color: DARK_BLUE, size: 17, font: "Arial" }),
      new TextRun({ text: "\tLand Request Proposal  |  Confidential", color: GREY, size: 16, font: "Arial" }),
    ],
  })],
});

const docFooter = new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: DARK_BLUE, space: 4 } },
    spacing: { before: 80 },
    children: [
      new TextRun({ text: "Arka Energy  |  Land Request Proposal  |  Confidential   Page ", color: GREY, size: 15, font: "Arial" }),
      new TextRun({ children: [PageNumber.CURRENT], color: GREY, size: 15, font: "Arial" }),
    ],
  })],
});

// ── Cover ─────────────────────────────────────────────────────────────────
function cover() {
  const metaRows = [
    ["Prepared by", "Arka Energy (proposed incorporation — India)"],
    ["Document type", "Land Request Proposal — Manufacturing & Solar Farm"],
    ["Submitted to", "State Government (Telangana / Andhra Pradesh)"],
    ["Classification", "Confidential — For Government Use Only"],
    ["Date", "July 2026"],
  ];

  return [
    new Paragraph({ spacing: { before: 560, after: 40 },
      children: [new TextRun({ text: "arka Energy", bold: true, color: ACCENT, size: 26, font: "Arial" })] }),
    new Paragraph({ spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: "Land Request Proposal", bold: true, color: DARK_BLUE, size: 52, font: "Arial" })] }),
    new Paragraph({ spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: "Manufacturing Facility  &  Solar Farm", color: MED_BLUE, size: 30, font: "Arial" })] }),
    new Paragraph({
      spacing: { before: 0, after: 360 },
      children: [new TextRun({ text: "Government Land Allocation Request — Phase 1", bold: true, color: ACCENT, size: 19, font: "Arial" })],
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: MED_BLUE, space: 4 } },
      spacing: { after: 300 },
      children: [new TextRun("")],
    }),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [2800, CONTENT_W - 2800],
      rows: metaRows.map(([k, v], i) =>
        new TableRow({ children: [
          new TableCell({
            width: { size: 2800, type: WidthType.DXA }, borders: cb,
            shading: { fill: i % 2 === 0 ? WHITE : LIGHT_BLUE, type: ShadingType.CLEAR },
            margins: { top: 90, bottom: 90, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, color: DARK_BLUE, size: 18, font: "Arial" })] })],
          }),
          new TableCell({
            width: { size: CONTENT_W - 2800, type: WidthType.DXA }, borders: cb,
            shading: { fill: i % 2 === 0 ? WHITE : LIGHT_BLUE, type: ShadingType.CLEAR },
            margins: { top: 90, bottom: 90, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: v, color: BLACK, size: 18, font: "Arial" })] })],
          }),
        ]}),
      ),
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ── Section 1: About Arka ─────────────────────────────────────────────────
function aboutArka() {
  return [
    h1("1. About Arka Energy"),
    body("Arka is an Indian renewable energy company being incorporated to build utility-scale solar farms and distribute affordable solar energy products directly to households and businesses. Arka operates across three revenue streams:"),
    ...sp(),
    makeTable([
      ["Stream", "What We Do", "Who We Serve"],
      ["Stream 1 — Urban Solar Farm", "Build large solar farms on government land. Sell electricity directly to buildings via Open Access at Rs 4.5/unit — 40% below DISCOM rate.", "Housing societies, hospitals, IT parks, malls"],
      ["Stream 2 — Government Grid Sale", "Sell surplus solar generation to SECI (Solar Energy Corporation of India) at Rs 2.5/unit under a 25-year PPA.", "Central government grid (zero payment risk)"],
      ["Stream 3 — Household Solar Kits", "Manufacture and distribute plug-and-use foldable solar panel kits (100-500W) to apartment households and semi-urban homes.", "Urban apartments, semi-urban homes, small businesses"],
    ], [1700, 4200, 3486]),
    ...sp(2),
    body("This proposal requests government land allocation for two distinct but complementary purposes: (1) a manufacturing facility for solar kit assembly, and (2) solar farm land for utility-scale panel installation. Both are core to Arka's Phase 1 launch."),
  ];
}

// ── Section 2: Manufacturing Land ────────────────────────────────────────
function manufacturingSection() {
  return [
    h1("Objective 1: Manufacturing Facility"),
    body("Arka requires a dedicated facility for assembly and distribution of its foldable solar panel kits — Arka Lite (100W), Arka Home (200W), and Arka Pro (500W). The facility will assemble imported flexible CIGS thin-film panels, LFP battery packs, micro-inverters, cables, and accessories into finished consumer kits ready for retail and direct sale."),

    ...sp(),
    h2("Land Requested"),
    kpiTable([
      ["5 acres", "Total land requested"],
      ["20,000 sqft", "Assembly floor"],
      ["12,000 sqft", "Warehouse & despatch"],
      ["5,000 sqft", "Quality lab + offices"],
      ["Remaining", "Phase 2 expansion buffer"],
    ]),

    ...sp(2),
    h2("Why This Space Is Needed — Zone-by-Zone"),
    makeTable([
      ["Zone", "Area", "Purpose and Justification"],
      ["Assembly floor", "20,000 sqft", "Three parallel assembly lines: flexible panel unboxing and testing, LFP battery integration, micro-inverter wiring, final packaging. Each line produces ~15 kits/hour. At 1 shift/day, 250 working days = 12,000-15,000 kits/year Phase 1."],
      ["Finished goods warehouse", "12,000 sqft", "60-day safety stock for all three SKUs required to ensure uninterrupted supply to online channels and bulk orders. At 95,000 kits/year (Year 5), warehouse holds ~16,000 kits at any time."],
      ["Incoming materials store", "6,000 sqft", "Buffer stock of imported CIGS panels, LFP cells, micro-inverters, and accessories. 45-90 day import lead time from China/Switzerland means large incoming inventory is structurally necessary."],
      ["Quality control lab", "2,000 sqft", "IV curve tester (panel output verification), battery cycle tester (2000-cycle BIS compliance), IP67 water resistance chamber, electrical safety test bench. BIS certification and PM Surya Ghar empanelment require these on-site."],
      ["Admin and offices", "3,000 sqft", "Management, HR, accounts, customer service, IT infrastructure."],
      ["Phase 2 expansion", "Remaining (~2 acres)", "Reserved for second and third assembly lines as annual output scales from 15,000 kits (Year 1) to 1,00,000 kits (Year 5). No construction until Phase 2 milestone is reached."],
    ], [2200, 1800, CONTENT_W - 4000]),

    ...sp(2),
    h2("What Justifies This Demand — The Market Numbers"),
    makeTable([
      ["Statistic", "Value", "Relevance to Space Need"],
      ["Urban apartments without roof access in India", "5 crore households", "Primary market — cannot use standard solar; foldable kit is the only solution"],
      ["Semi-urban homes with unreliable grid", "8 crore households", "Backup power need drives Arka Home and Pro adoption"],
      ["PM Surya Ghar subsidy scheme", "Rs 75,000 Cr allocated by Government of India", "Government-funded pull — makes kits affordable at Rs 8,000-16,000 net"],
      ["Target kits sold Year 1", "2,000 units", "Requires 20,000 sqft assembly + 12,000 sqft warehouse from Day 1"],
      ["Target kits sold Year 3", "38,000 units", "Requires 2 assembly lines — Phase 2 expansion land needed"],
      ["Target kits sold Year 5", "95,000 units", "Full 5-acre facility at capacity"],
      ["Revenue from facility (Year 5)", "Rs 190 Cr/year", "Assembly facility directly generates this revenue"],
      ["Direct jobs created (Phase 1)", "60-80 assembly workers", "Semi-skilled local employment"],
      ["Direct jobs created (Phase 2)", "200-300 workers", "Full facility utilisation"],
    ], [3200, 2200, CONTENT_W - 5400]),

    ...sp(2),
    h2("Investment Arka Will Make in the Facility"),
    makeTable([
      ["Item", "Investment (at Arka's cost)"],
      ["Civil construction — factory shell, offices, warehouse", "Rs 3.5-5 Cr"],
      ["Assembly line equipment — conveyor, testing rigs, hand tools", "Rs 2-3 Cr"],
      ["Quality lab instruments — IV tester, BIS compliance setup, IP67 chamber", "Rs 0.8-1.2 Cr"],
      ["Power infrastructure — transformer, DG backup, rooftop solar", "Rs 0.5-0.8 Cr"],
      ["IT systems — ERP, inventory management, customer portal", "Rs 0.3-0.5 Cr"],
      ["Total Phase 1 facility investment", "Rs 7-10 Cr (100% at Arka's cost)"],
    ], [5000, CONTENT_W - 5000]),
    ...sp(),
    note("The government provides only the land on long-term lease. All construction, equipment, and operating costs are borne entirely by Arka."),
  ];
}

// ── Section 3: Solar Farm Land ────────────────────────────────────────────
function solarFarmSection() {
  return [
    h1("Objective 2: Solar Farm — Panel Installation"),
    body("Arka requires government-allocated wasteland for ground-mount installation of utility-scale solar panels. The solar farm generates electricity that is sold directly to large urban consumers (housing societies, hospitals, IT parks) via Open Access under the Electricity Amendment Act 2022, and surplus to SECI under a 25-year government-backed PPA."),
    body("This is not a land purchase. Arka requests a long-term government lease on barren / fallow wasteland that currently generates zero revenue for the state."),

    ...sp(),
    h2("Land Requested"),
    kpiTable([
      ["50 acres", "Phase 1 (10 MW) — immediate"],
      ["400 acres", "Phase 2 (90 MW) — Year 2-3 option"],
      ["1,750 acres", "Phase 3 (400 MW) — Year 4-5"],
      ["~2,200 acres", "Total over 5 years (500 MW)"],
    ]),

    ...sp(2),
    h2("Why This Space Is Needed — Per-MW Breakdown"),
    makeTable([
      ["Component", "Area per MW", "Why This Area Is Required"],
      ["Panel array", "8,000 sqm", "Each 545W panel is 2.27m x 1.13m. 1 MW needs ~1,835 panels covering 8,000 sqm of ground."],
      ["Row spacing", "4,500 sqm", "Panels must be spaced to avoid inter-row shading. Shadow-free spacing at 10-degree tilt requires ~1.5x panel width gap between rows."],
      ["Internal roads", "600 sqm", "3m-wide compacted gravel roads between panel rows for O&M vehicles, cleaning equipment, and emergency access."],
      ["Inverter + substation yard", "500 sqm", "String inverter stations (10 per MW), step-up transformer (415V to 33kV), HT switchgear, and metering panel."],
      ["Green belt + perimeter", "400 sqm", "Security fencing (3m chain-link), CCTV perimeter, mandatory vegetation buffer under state environmental norms."],
      ["Total per MW", "~14,000 sqm = 3.46 acres", ""],
    ], [2400, 2000, CONTENT_W - 4400]),

    ...sp(2),
    h2("Phase-wise Land Requirement"),
    makeTable([
      ["Phase", "Capacity", "Land Required", "What Changes"],
      ["Phase 1", "10 MW", "35 acres farm + 15 acres buffer = 50 acres", "Pilot plant, proves unit economics, signs first urban PPAs"],
      ["Phase 2", "90 MW", "315 acres farm + 85 acres buffer = 400 acres", "Adds single-axis trackers and bifacial panels — CUF rises to 24-26%"],
      ["Phase 3", "400 MW", "1,400 acres farm + 350 acres buffer = 1,750 acres", "Full-scale operation; InvIT monetisation becomes viable"],
      ["Total", "500 MW", "~2,200 acres over 5 years", "Phased — only Phase 1 is immediate ask"],
    ], [1400, 1500, 3200, CONTENT_W - 6100]),
    ...sp(),
    note("Phase 2 and Phase 3 land can be held as a government reservation and formally allocated as Arka delivers Phase 1 milestones. Only the 50-acre Phase 1 allocation is the immediate request."),

    ...sp(2),
    h2("What Justifies This Demand — The National and State Context"),
    makeTable([
      ["Statistic", "Value", "Relevance to Land Ask"],
      ["India's 2030 solar target", "500 GW installed", "National mandate — every MW matters. Arka's 500 MW = 0.1% of target."],
      ["Current installed capacity (mid-2025)", "~85 GW", "415 GW gap remains — massive land activation needed"],
      ["Annual addition needed to hit 2030 target", "~55 GW/year", "Utility solar on wasteland is the only way to deliver at this pace"],
      ["Average urban electricity cost", "Rs 7-9/unit", "Arka delivers at Rs 4.5/unit — 40-44% cheaper. Directly benefits urban residents."],
      ["Open-access eligible consumers in India", "3,00,000+ buildings above 100kW", "Every MW Arka builds serves more of these consumers"],
      ["T&D (transmission and distribution) loss", "22% national average", "22% of all electricity generated is wasted in wires. Urban-adjacent solar cuts this."],
      ["Annual generation at 500 MW (21% CUF)", "92 crore units (kWh)", "Powers ~5,000 large buildings or ~10 lakh equivalent households"],
      ["CO2 displaced at 500 MW", "9.5 lakh tonnes/year", "Equivalent to removing 4.1 lakh cars from roads"],
      ["Land productivity: solar vs idle wasteland", "Solar: Rs 4.2 Cr/acre invested, Rs 1.6L/acre/year lease income for state", "Idle wasteland generates zero. Solar lease generates income and taxes."],
    ], [3000, 2200, CONTENT_W - 5200]),

    ...sp(2),
    h2("Revenue and Economic Return to the State"),
    makeTable([
      ["Metric", "Phase 1 (10 MW)", "At 500 MW"],
      ["Total private investment brought in", "Rs 42 Cr", "Rs 1,922 Cr"],
      ["Annual electricity generated", "1.84 Cr units", "92 Cr units"],
      ["Annual revenue (Arka)", "Rs 5.65 Cr", "Rs 283 Cr"],
      ["GST paid per year", "Rs 0.68 Cr", "Rs 34 Cr"],
      ["State land lease income (25 yr total)", "Rs 15-25 L", "Rs 7.5-12.5 Cr"],
      ["Construction jobs (one-time)", "80-120 workers", "3,000-4,000 workers"],
      ["Permanent O&M jobs", "15-20 per site", "500-700 across portfolio"],
      ["Urban electricity cost saving for consumers", "Rs 2.2 Cr/year", "Rs 110 Cr/year"],
    ], [3400, 2400, CONTENT_W - 5800]),

    ...sp(2),
    h2("Land Lease Terms Requested"),
    makeTable([
      ["Term", "Request"],
      ["Lease duration", "25 years, renewable for a further 25 years"],
      ["Lease rate", "Prevailing government wasteland rate as per state solar policy"],
      ["Land use", "Solar power generation only; no permanent residential or commercial structures"],
      ["Agrivoltaic use", "Request permission to grow shade-tolerant crops under and around panels — additional benefit for local farmers"],
      ["Land reversion", "At end of lease, land reverts to government with all panels removed at Arka's cost"],
      ["Phase 1 immediate allocation", "50 acres — formal government order requested"],
      ["Phase 2-3 reservation", "400 + 1,750 acres — government reservation / priority allocation as Arka scales"],
    ], [2800, CONTENT_W - 2800]),
  ];
}

// ── Section 4: Summary Ask ────────────────────────────────────────────────
function summaryAsk() {
  return [
    h1("Summary — What We Are Asking For"),
    body("Arka requests the Government to allocate the following land under standard long-term lease. Arka bears 100% of all construction, installation, and operational costs. No government capital expenditure is required."),
    ...sp(),
    makeTable([
      ["#", "Objective", "Land Requested", "When", "Arka's Investment"],
      ["1", "Manufacturing facility — solar kit assembly, warehouse, quality lab", "5 acres", "Immediate", "Rs 7-10 Cr at Arka's cost"],
      ["2", "Solar farm Phase 1 — 10 MW panel installation", "50 acres", "Immediate", "Rs 42 Cr (equity + PFC debt)"],
      ["3", "Solar farm Phase 2 — 90 MW (option/reservation)", "400 acres", "Year 2-3 reservation", "Rs 360 Cr"],
      ["4", "Solar farm Phase 3 — 400 MW (future reservation)", "1,750 acres", "Year 4-5", "Rs 1,520 Cr"],
      ["", "Total immediate Phase 1 request", "55 acres", "", "Rs 49-52 Cr total"],
    ], [400, 3200, 1600, 1700, CONTENT_W - 6900]),

    ...sp(2),
    h2("What the State Gets in Return"),
    makeTable([
      ["Benefit to State", "Phase 1 (10 MW + Factory)", "At Full Scale (500 MW + Factory)"],
      ["Private investment attracted", "Rs 49-52 Cr", "Rs 1,930-1,940 Cr"],
      ["Direct jobs created", "95-140 (farm + factory)", "700-1,000 (farm + factory)"],
      ["Indirect jobs (vendors, logistics, construction)", "200-300", "4,000-5,000"],
      ["Annual GST contribution", "Rs 0.68 Cr (farm) + Rs 0.4 Cr (factory)", "Rs 34 Cr (farm) + Rs 23 Cr (factory)"],
      ["Land lease revenue to state (annual)", "Rs 15-25 L", "Rs 7.5-12.5 Cr total over 25 yr"],
      ["Urban electricity cost saving for residents", "Rs 2.2 Cr/year", "Rs 110 Cr/year"],
      ["CO2 displaced per year", "~19,000 tonnes (10 MW)", "9.5 lakh tonnes (500 MW)"],
      ["Idle wasteland converted to productive use", "55 acres", "2,255 acres"],
    ], [3400, 2400, CONTENT_W - 5800]),

    ...sp(2),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: MED_BLUE, space: 4 } },
      spacing: { before: 200 },
      children: [new TextRun({ text: "Arka Energy  |  thrinathreddy@berkeley.edu  |  Confidential — For Government Use Only", color: GREY, size: 15, font: "Arial" })],
    }),
  ];
}

// ── Build ─────────────────────────────────────────────────────────────────
async function main() {
  const children = [
    ...cover(),
    ...aboutArka(),
    ...sp(2),
    ...manufacturingSection(),
    new Paragraph({ children: [new PageBreak()] }),
    ...solarFarmSection(),
    new Paragraph({ children: [new PageBreak()] }),
    ...summaryAsk(),
  ];

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 19, color: BLACK } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: { default: docHeader },
      footers: { default: docFooter },
      children,
    }],
  });

  const desktop = process.env.HOME + "/Desktop";
  const outPath = path.join(desktop, "Arka_Land_Request_Proposal.docx");
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
  console.log("Written: " + outPath);
}

main().catch(e => { console.error(e); process.exit(1); });
