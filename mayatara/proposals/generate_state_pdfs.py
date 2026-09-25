"""
Generate two state-specific site proposal PDFs for Arka Energy.
One for Telangana, one for Andhra Pradesh.
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# ── Palette ────────────────────────────────────────────────────────────────
DARK_BLUE   = colors.HexColor("#1F4E79")
MED_BLUE    = colors.HexColor("#2E75B6")
LIGHT_BLUE  = colors.HexColor("#EBF3FB")
ACCENT      = colors.HexColor("#F0A500")
WHITE       = colors.white
BLACK       = colors.HexColor("#1A1A1A")
GREY        = colors.HexColor("#666666")

W, H = A4

# ── Styles ─────────────────────────────────────────────────────────────────
def build_styles():
    base = getSampleStyleSheet()

    def S(name, parent="Normal", **kw):
        return ParagraphStyle(name, parent=base[parent], **kw)

    return {
        "cover_company": S("cc", fontSize=13, textColor=ACCENT,
                           fontName="Helvetica-Bold", leading=16),
        "cover_title":   S("ct", fontSize=26, textColor=WHITE,
                           fontName="Helvetica-Bold", leading=32, spaceAfter=6),
        "cover_sub":     S("cs", fontSize=14, textColor=LIGHT_BLUE,
                           fontName="Helvetica", leading=18),
        "cover_tag":     S("ctg", fontSize=10, textColor=ACCENT,
                           fontName="Helvetica-Bold", leading=14),
        "h1":   S("h1", fontSize=14, textColor=DARK_BLUE,
                  fontName="Helvetica-Bold", spaceBefore=16, spaceAfter=6, leading=18),
        "h2":   S("h2", fontSize=11, textColor=MED_BLUE,
                  fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=4, leading=14),
        "body": S("body", fontSize=9.5, textColor=BLACK,
                  fontName="Helvetica", leading=14, spaceAfter=4),
        "bold": S("bold", fontSize=9.5, textColor=BLACK,
                  fontName="Helvetica-Bold", leading=14),
        "small":S("small", fontSize=8.5, textColor=GREY,
                  fontName="Helvetica", leading=12),
        "footer":S("footer", fontSize=8, textColor=GREY,
                   fontName="Helvetica", alignment=TA_CENTER),
        "kpi_num": S("kpi_num", fontSize=20, textColor=DARK_BLUE,
                     fontName="Helvetica-Bold", alignment=TA_CENTER, leading=24),
        "kpi_lbl": S("kpi_lbl", fontSize=8, textColor=GREY,
                     fontName="Helvetica", alignment=TA_CENTER, leading=11),
    }

# ── Helpers ────────────────────────────────────────────────────────────────
def rule(width=None):
    return HRFlowable(width=width or "100%", thickness=1,
                      color=MED_BLUE, spaceAfter=6, spaceBefore=4)

def table(data, col_widths, header=True,
          alt_color=LIGHT_BLUE, header_bg=MED_BLUE):
    TS = [
        ("FONTNAME",  (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE",  (0,0), (-1,-1), 9),
        ("LEADING",   (0,0), (-1,-1), 12),
        ("TEXTCOLOR", (0,0), (-1,-1), BLACK),
        ("VALIGN",    (0,0), (-1,-1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, alt_color]),
        ("GRID",      (0,0), (-1,-1), 0.4, colors.HexColor("#C9D9EC")),
        ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING",(0,0),(-1,-1), 7),
        ("RIGHTPADDING",(0,0),(-1,-1), 7),
    ]
    if header:
        TS += [
            ("BACKGROUND",  (0,0), (-1,0), header_bg),
            ("TEXTCOLOR",   (0,0), (-1,0), WHITE),
            ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
        ]
    return Table(data, colWidths=col_widths, style=TableStyle(TS),
                 repeatRows=1 if header else 0)

def kpi_row(items, styles):
    """items = list of (number_str, label_str)"""
    cells = []
    for num, lbl in items:
        cells.append([
            Paragraph(num, styles["kpi_num"]),
            Paragraph(lbl, styles["kpi_lbl"]),
        ])
    t = Table([cells], colWidths=[W/len(items) - 2*cm]*len(items))
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), LIGHT_BLUE),
        ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("BOX",        (0,0), (-1,-1), 1, MED_BLUE),
        ("INNERGRID",  (0,0), (-1,-1), 0.5, MED_BLUE),
    ]))
    return t


# ── Header / Footer ────────────────────────────────────────────────────────
def make_page_fns(state_name):
    def on_page(canvas, doc):
        canvas.saveState()
        # Top bar
        canvas.setFillColor(DARK_BLUE)
        canvas.rect(0, H - 1*cm, W, 1*cm, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(WHITE)
        canvas.drawString(1.5*cm, H - 0.7*cm, "Arka Energy")
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(W - 1.5*cm, H - 0.7*cm,
                               f"Site Proposal — {state_name}  |  Confidential")
        # Bottom bar
        canvas.setFillColor(DARK_BLUE)
        canvas.rect(0, 0, W, 0.8*cm, fill=1, stroke=0)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(WHITE)
        canvas.drawCentredString(W/2, 0.25*cm,
                                 f"Arka Energy | {state_name} Site Proposal | Page {doc.page}")
        canvas.restoreState()
    return on_page


# ── Cover Page ─────────────────────────────────────────────────────────────
def cover(state_name, state_color, tagline, styles):
    story = []

    # Full-bleed dark background block (simulate with a wide table)
    bg = Table([[""]], colWidths=[W - 4*cm], rowHeights=[5*cm])
    bg.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), DARK_BLUE),
                             ("BOX", (0,0), (-1,-1), 0, DARK_BLUE)]))
    story.append(Spacer(1, 1.8*cm))
    story.append(bg)

    # Overlay text (positioned via spacers — reportlab platypus is flow-based)
    story.append(Spacer(1, -4.5*cm))  # pull up into the blue block

    story.append(Paragraph("ārka Energy", styles["cover_company"]))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(f"{state_name} Solar Farm", styles["cover_title"]))
    story.append(Paragraph("Site Proposal — Phase 1", styles["cover_sub"]))
    story.append(Spacer(1, 0.6*cm))
    story.append(Paragraph(tagline, styles["cover_tag"]))
    story.append(Spacer(1, 3.5*cm))

    # Divider
    story.append(rule())
    story.append(Spacer(1, 0.3*cm))

    # Summary box
    meta = [
        ["Prepared by", "Arka Energy (proposed incorporation — India)"],
        ["Document type", "Site Proposal & Investment Brief"],
        ["Classification", "Confidential — For Government and Investor Use Only"],
        ["Date", "July 2026"],
        ["Phase", "Phase 1 — 10 MW Pilot, Scale to 500 MW by Year 5"],
    ]
    t = Table(meta, colWidths=[4.5*cm, 11*cm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("TEXTCOLOR",(0,0), (0,-1), DARK_BLUE),
        ("TEXTCOLOR",(1,0), (1,-1), BLACK),
        ("ROWBACKGROUNDS",(0,0),(-1,-1),[WHITE, LIGHT_BLUE]),
        ("TOPPADDING",(0,0),(-1,-1),5),
        ("BOTTOMPADDING",(0,0),(-1,-1),5),
        ("LEFTPADDING",(0,0),(-1,-1),7),
        ("RIGHTPADDING",(0,0),(-1,-1),7),
        ("BOX",(0,0),(-1,-1),0.5, MED_BLUE),
    ]))
    story.append(t)
    story.append(PageBreak())
    return story


# ── Telangana Content ──────────────────────────────────────────────────────
def telangana_content(styles):
    S = styles
    story = []

    story.append(Paragraph("1. Executive Summary", S["h1"]))
    story.append(rule())
    story.append(Paragraph(
        "Arka proposes to develop a 10 MW utility-scale solar farm on government-allocated "
        "wasteland in the Nalgonda / Mahbubnagar district of Telangana. The plant will sell "
        "electricity directly to urban consumers in Hyderabad via Open Access under the "
        "Electricity Amendment Act 2022 at Rs 4.5/unit — a 40% saving versus TSSPDCL rates. "
        "Surplus generation will be sold to SECI at Rs 2.5/unit under a 25-year PPA.",
        S["body"]))
    story.append(Spacer(1, 0.3*cm))
    story.append(kpi_row([
        ("10 MW", "Phase 1 Capacity"),
        ("21-23%", "Expected CUF"),
        ("5.5-5.8", "kWh/m2/day Irradiation"),
        ("Rs 56.5L", "Revenue/MW/yr"),
        ("75.6%", "EBITDA Margin"),
    ], S))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("2. Site Details", S["h1"]))
    story.append(rule())

    site_data = [
        ["Parameter", "Detail"],
        ["Proposed site", "Nalgonda / Mahbubnagar district wasteland (TSREDCO designated zones)"],
        ["Distance from Hyderabad", "60-80 km"],
        ["Solar irradiation", "5.5-5.8 kWh/m2/day (annual average)"],
        ["CUF expected", "21-23% (base case 21%)"],
        ["Land area (Phase 1)", "35 acres wasteland; 50 acres with buffer"],
        ["Land status", "Government wasteland — TSREDCO land offer received"],
        ["Terrain", "Flat to gently sloping (<3 degrees gradient)"],
        ["Grid connection", "132kV Nagarjunasagar / Wanaparthy substation within 10 km"],
        ["Grid evacuation", "10 km 33kV line to nearest PGCIL/TSTRANSCO feeder"],
        ["Road access", "All-weather SH within 2 km"],
        ["Water for cleaning", "Borewell + 50,000L storage tank on-site"],
        ["Forest / tribal land", "None — designated wasteland, MOEF clearance not required"],
    ]
    story.append(table(site_data, [5.5*cm, 10*cm]))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("3. Urban Demand: Hyderabad Open Access Market", S["h1"]))
    story.append(rule())
    story.append(Paragraph(
        "Hyderabad is India's fourth-largest urban economy and the anchor demand centre for "
        "this project. The IT corridor (HITEC City, Gachibowli, Madhapur), pharma clusters "
        "(Genome Valley), and 200+ large housing societies create a high-density open-access "
        "customer pool within our wheeling radius.", S["body"]))
    story.append(Spacer(1, 0.2*cm))

    demand_data = [
        ["Customer Type", "Est. Count (Hyderabad)", "Monthly Bill", "Our Rate", "Saving"],
        ["Large housing society (200+ flats)", "12,000+", "Rs 2-8L", "Rs 4.5/unit", "40-44%"],
        ["IT park / office complex", "500+", "Rs 20-100L", "Rs 5.0/unit", "38-50%"],
        ["Private hospital (100+ beds)", "800+", "Rs 5-20L", "Rs 4.75/unit", "32-47%"],
        ["Pharma / biotech unit", "400+", "Rs 10-50L", "Rs 4.5/unit", "35-48%"],
        ["Commercial mall / retail", "200+", "Rs 10-50L", "Rs 5.0/unit", "38-50%"],
    ]
    story.append(table(demand_data, [5*cm, 3*cm, 2.5*cm, 2.5*cm, 2.5*cm]))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("4. Regulatory Framework — Telangana", S["h1"]))
    story.append(rule())

    reg_data = [
        ["Item", "Status / Detail"],
        ["Open access regulator", "TSERC (Telangana State Electricity Regulatory Commission)"],
        ["EA 2022 compliance", "TSERC notified open access regulations — fully compliant"],
        ["CSS (Cross-Subsidy Surcharge)", "Rs 0.35/unit — among the lowest in India"],
        ["Wheeling charges", "Rs 0.55/unit (TSTRANSCO)"],
        ["Net deduction from Rs 4.5", "Rs 0.90/unit total → Arka net: Rs 3.60/unit"],
        ["Land allocation authority", "TSREDCO — single-window clearance"],
        ["Land lease rate", "Rs 2-4/sqft/year (government wasteland)"],
        ["CSS waiver (first 2 years)", "Telangana Solar Policy 2023 — CSS waived for 24 months post-COD"],
        ["Statutory approvals", "CEA connectivity, TSTRANSCO evacuation, TSERC OA certificate, EPC environmental clearance"],
        ["Timeline (land to COD)", "12-14 months (Phase 1, 10MW)"],
    ]
    story.append(table(reg_data, [6*cm, 9.5*cm]))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("5. Financial Snapshot", S["h1"]))
    story.append(rule())

    fin_data = [
        ["Metric", "Value", "Basis"],
        ["Total capex (10MW Phase 1)", "Rs 42Cr", "Rs 4.2Cr/MW all-in"],
        ["Equity (30%)", "Rs 12.6Cr", "Funded from Series A raise"],
        ["PFC debt (70%, 9%, 15yr)", "Rs 29.4Cr", "Green energy project finance"],
        ["Annual revenue (10MW)", "Rs 5.65Cr", "Rs 56.5L/MW at 21% CUF"],
        ["EBITDA/MW/year", "Rs 42.7L", "75.6% EBITDA margin"],
        ["Debt service/MW/year", "Rs 27L", "EMI on 15-year PFC loan"],
        ["Free cash flow/MW/year", "Rs 15.7L", "After debt service"],
        ["Equity IRR", "22-28%", "Base case; upside in Telangana given CUF 23%"],
        ["Break-even CUF", "18.1%", "vs 21% target — 3% cushion"],
        ["Phase 1 payback (equity)", "4-5 years", "Conservative"],
    ]
    story.append(table(fin_data, [5.5*cm, 3.5*cm, 6.5*cm]))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("6. Phase 1 Implementation Timeline", S["h1"]))
    story.append(rule())

    tl_data = [
        ["Month", "Milestone"],
        ["Month 1-2", "Land allocation order from TSREDCO; MoU signing with Telangana government"],
        ["Month 2-3", "DPR submission; PFC project loan application; EPC tender floating"],
        ["Month 3-4", "TSERC open access certificate (OAC); CEA connectivity approval"],
        ["Month 4-6", "EPC contract award (Tata Power Solar / Sterling Wilson); civil mobilisation"],
        ["Month 6-9", "Panel procurement (Waaree OEM contract); inverter and transformer supply"],
        ["Month 8-11", "Panel installation; inverter commissioning; 33kV line stringing"],
        ["Month 11-12", "Grid synchronisation test; TSTRANSCO acceptance; commissioning"],
        ["Month 12", "Commercial Operations Date (COD) — first power delivered to Hyderabad consumers"],
        ["Month 12-18", "Urban PPA pipeline: 50+ housing societies and IT parks signed up"],
    ]
    story.append(table(tl_data, [3*cm, 12.5*cm]))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("7. Government Ask", S["h1"]))
    story.append(rule())
    story.append(Paragraph(
        "Arka requests the following from the Government of Telangana / TSREDCO to proceed "
        "with Phase 1:", S["body"]))
    story.append(Spacer(1, 0.2*cm))

    ask_data = [
        ["#", "Request", "Details"],
        ["1", "Land allocation — 50 acres", "Nalgonda / Mahbubnagar wasteland; 25-year lease at standard TSREDCO rate"],
        ["2", "TSTRANSCO grid connectivity", "33kV evacuation line + bay at nearest 132kV substation"],
        ["3", "Single-window clearance", "TSREDCO coordination of all state-level approvals"],
        ["4", "CSS waiver (24 months)", "As per Telangana Solar Policy 2023"],
        ["5", "Phase 2 land reservation", "350 acres held in reserve for 90MW Phase 2 (Year 2-3)"],
    ]
    story.append(table(ask_data, [1*cm, 5*cm, 9.5*cm]))

    story.append(Spacer(1, 0.3*cm))
    story.append(rule())
    story.append(Paragraph(
        "Arka Energy | Contact: thrinathreddy@berkeley.edu | Confidential — Not for distribution",
        styles["footer"]))

    return story


# ── Andhra Pradesh Content ─────────────────────────────────────────────────
def ap_content(styles):
    S = styles
    story = []

    story.append(Paragraph("1. Executive Summary", S["h1"]))
    story.append(rule())
    story.append(Paragraph(
        "Arka proposes to develop a 10 MW utility-scale solar farm in the Kurnool / Anantapur "
        "solar corridor of Andhra Pradesh — one of the highest-irradiation zones in India at "
        "5.8-6.2 kWh/m2/day. The plant will sell electricity directly to urban consumers in "
        "Vijayawada, Tirupati, and Visakhapatnam via Open Access at Rs 4.5/unit. Surplus "
        "generation will be sold to SECI at Rs 2.5/unit under a 25-year PPA. The AP government "
        "has offered land in the Kurnool solar park zone — India's proven large-scale solar hub.",
        S["body"]))
    story.append(Spacer(1, 0.3*cm))
    story.append(kpi_row([
        ("10 MW", "Phase 1 Capacity"),
        ("22-25%", "Expected CUF"),
        ("5.8-6.2", "kWh/m2/day Irradiation"),
        ("Rs 59.5L", "Revenue/MW/yr"),
        ("76.4%", "EBITDA Margin"),
    ], S))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("2. Site Details", S["h1"]))
    story.append(rule())

    site_data = [
        ["Parameter", "Detail"],
        ["Proposed site", "Kurnool / Anantapur district wasteland (AP Solar Park zone)"],
        ["Distance to urban centres", "50-80 km to Vijayawada / Tirupati / Nellore"],
        ["Solar irradiation", "5.8-6.2 kWh/m2/day (among highest in peninsular India)"],
        ["CUF expected", "22-25% (base case 22%) — best CUF in our portfolio"],
        ["Land area (Phase 1)", "35 acres wasteland; 50 acres with buffer"],
        ["Land status", "AP government land offer received — Kurnool Solar Park designation"],
        ["Terrain", "Flat semi-arid terrain, ideal for large ground-mount arrays"],
        ["Grid connection", "220kV Kurnool substation within 8 km; dedicated AP Transco solar feeder"],
        ["Grid evacuation", "8 km 33kV line to AP Transco feeder (shared infrastructure in solar park)"],
        ["Road access", "All-weather NH/SH within 1.5 km"],
        ["Water for cleaning", "Borewell + 50,000L storage tank; Tungabhadra canal within 15 km"],
        ["Ecosystem advantage", "Kurnool Solar Park: ReNew, Greenko, SoftBank already operating — grid, roads, O&M vendors proven"],
    ]
    story.append(table(site_data, [5.5*cm, 10*cm]))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("3. Urban Demand: Andhra Pradesh Open Access Market", S["h1"]))
    story.append(rule())
    story.append(Paragraph(
        "Andhra Pradesh's three major urban centres — Vijayawada (capital region + industrial), "
        "Visakhapatnam (port + pharma + IT), and Tirupati (institutional + tourism) — "
        "collectively represent a large and underserved open-access market. APERC has "
        "operationalised EA 2022 open access with an active CSS waiver scheme.", S["body"]))
    story.append(Spacer(1, 0.2*cm))

    demand_data = [
        ["Customer Type", "Est. Count (AP Urban)", "Monthly Bill", "Our Rate", "Saving"],
        ["Large housing society (200+ flats)", "8,000+", "Rs 2-8L", "Rs 4.5/unit", "40-44%"],
        ["Industrial / SME unit", "15,000+", "Rs 5-50L", "Rs 4.25/unit", "30-47%"],
        ["Private hospital (100+ beds)", "600+", "Rs 5-20L", "Rs 4.75/unit", "32-47%"],
        ["IT / BPO campus (Vizag)", "300+", "Rs 20-80L", "Rs 5.0/unit", "38-50%"],
        ["Institutional / education (Tirupati)", "200+", "Rs 5-30L", "Rs 4.5/unit", "35-48%"],
    ]
    story.append(table(demand_data, [5*cm, 3*cm, 2.5*cm, 2.5*cm, 2.5*cm]))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("4. Regulatory Framework — Andhra Pradesh", S["h1"]))
    story.append(rule())

    reg_data = [
        ["Item", "Status / Detail"],
        ["Open access regulator", "APERC (Andhra Pradesh Electricity Regulatory Commission)"],
        ["EA 2022 compliance", "APERC open access regulations notified and operational"],
        ["CSS (Cross-Subsidy Surcharge)", "Rs 0.30/unit — very competitive"],
        ["Wheeling charges", "Rs 0.50/unit (AP Transco)"],
        ["Net deduction from Rs 4.5", "Rs 0.80/unit total → Arka net: Rs 3.70/unit (best in portfolio)"],
        ["Land allocation authority", "AP Solar Power Corporation / NREDCAP — designated solar park"],
        ["Land premium", "Rs 0 land premium for first 500MW — AP Solar Policy 2023"],
        ["Lease rate", "Rs 2-3/sqft/year on government wasteland"],
        ["CSS waiver scheme", "APERC CSS waiver for open access renewable projects — active"],
        ["Statutory approvals", "CEA connectivity, AP Transco evacuation, APERC OAC, environmental clearance"],
        ["Timeline (land to COD)", "11-13 months (Phase 1, 10MW; established solar park ecosystem)"],
    ]
    story.append(table(reg_data, [6*cm, 9.5*cm]))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("5. Financial Snapshot", S["h1"]))
    story.append(rule())
    story.append(Paragraph(
        "Andhra Pradesh is the highest-yield site in our portfolio. The 22-25% CUF (vs. 21% "
        "base case) and lowest open access charges (Rs 0.80/unit vs. Rs 1.05/unit national "
        "average) produce the best unit economics of our two Phase 1 sites.", S["body"]))
    story.append(Spacer(1, 0.2*cm))

    fin_data = [
        ["Metric", "Value", "Notes"],
        ["Total capex (10MW Phase 1)", "Rs 42Cr", "Rs 4.2Cr/MW all-in"],
        ["Equity (30%)", "Rs 12.6Cr", "Funded from Series A raise"],
        ["PFC debt (70%, 9%, 15yr)", "Rs 29.4Cr", "Green energy project finance"],
        ["Annual generation (22% CUF)", "19.27L units/MW/yr", "+4.7% over base case"],
        ["Annual revenue (10MW)", "Rs 5.95Cr", "Rs 59.5L/MW — highest in portfolio"],
        ["EBITDA/MW/year", "Rs 45.5L", "76.4% margin (higher net due to lower charges)"],
        ["Debt service/MW/year", "Rs 27L", "EMI on 15-year PFC loan"],
        ["Free cash flow/MW/year", "Rs 18.5L", "After debt service — 18% higher than base case"],
        ["Equity IRR", "24-30%", "Upside vs. base case from CUF + lower charges"],
        ["Break-even CUF", "17.8%", "vs 22% target — 4.2% cushion"],
    ]
    story.append(table(fin_data, [5.5*cm, 3.5*cm, 6.5*cm]))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("6. Phase 1 Implementation Timeline", S["h1"]))
    story.append(rule())

    tl_data = [
        ["Month", "Milestone"],
        ["Month 1-2", "Land allocation from AP Solar Power Corp; MoU signing with Andhra Pradesh government"],
        ["Month 2-3", "DPR submission; PFC project loan application; EPC tender (leveraging Kurnool park ecosystem)"],
        ["Month 3-4", "APERC open access certificate; CEA connectivity approval; AP Transco bay allocation"],
        ["Month 4-6", "EPC contract award; civil mobilisation (existing O&M contractors in Kurnool park available)"],
        ["Month 6-9", "Panel procurement (Waaree OEM contract); inverter and transformer delivery"],
        ["Month 8-11", "Panel installation; inverter commissioning; 33kV line stringing to AP Transco feeder"],
        ["Month 11-12", "Grid synchronisation test; AP Transco acceptance; commissioning"],
        ["Month 12", "Commercial Operations Date (COD) — first power delivered to Vijayawada / Tirupati consumers"],
        ["Month 12-18", "Urban PPA pipeline: 50+ housing societies, industrial units, and hospitals signed up"],
    ]
    story.append(table(tl_data, [3*cm, 12.5*cm]))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("7. Government Ask", S["h1"]))
    story.append(rule())
    story.append(Paragraph(
        "Arka requests the following from the Government of Andhra Pradesh / AP Solar Power "
        "Corporation to proceed with Phase 1:", S["body"]))
    story.append(Spacer(1, 0.2*cm))

    ask_data = [
        ["#", "Request", "Details"],
        ["1", "Land allocation — 50 acres", "Kurnool Solar Park zone; 25-year lease at AP Solar Policy rate (Rs 0 premium)"],
        ["2", "AP Transco grid connectivity", "33kV bay at 220kV Kurnool substation; shared feeder where available"],
        ["3", "NREDCAP single-window clearance", "Coordination of all state-level approvals through AP Solar Power Corp"],
        ["4", "CSS waiver (APERC scheme)", "Activate CSS waiver for our OA certificate as per APERC notification"],
        ["5", "Phase 2 land reservation", "350 acres held in reserve for 90MW Phase 2 (Year 2-3) in same zone"],
    ]
    story.append(table(ask_data, [1*cm, 5*cm, 9.5*cm]))

    story.append(Spacer(1, 0.3*cm))
    story.append(rule())
    story.append(Paragraph(
        "Arka Energy | Contact: thrinathreddy@berkeley.edu | Confidential — Not for distribution",
        styles["footer"]))

    return story


# ── Build PDFs ─────────────────────────────────────────────────────────────
def build_pdf(filename, state_name, state_color, tagline, content_fn, styles):
    desktop = os.path.expanduser("~/Desktop")
    path = os.path.join(desktop, filename)

    doc = SimpleDocTemplate(
        path,
        pagesize=A4,
        leftMargin=1.8*cm, rightMargin=1.8*cm,
        topMargin=1.6*cm, bottomMargin=1.4*cm,
        title=f"Arka Energy — {state_name} Site Proposal",
        author="Arka Energy",
    )

    on_page = make_page_fns(state_name)
    story = cover(state_name, state_color, tagline, styles)
    story += content_fn(styles)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"  Written: {path}")


if __name__ == "__main__":
    styles = build_styles()

    print("Generating Arka state-specific PDFs...")

    build_pdf(
        "Arka_Telangana_Site_Proposal.pdf",
        "Telangana",
        colors.HexColor("#E31E24"),  # Telangana pink/red
        "Government land offer received | 60-80 km from Hyderabad | TSREDCO single-window clearance",
        telangana_content,
        styles,
    )

    build_pdf(
        "Arka_AndhraPradesh_Site_Proposal.pdf",
        "Andhra Pradesh",
        colors.HexColor("#00923F"),  # AP green
        "Government land offer received | Kurnool Solar Corridor | Highest CUF in portfolio: 22-25%",
        ap_content,
        styles,
    )

    print("Done — both PDFs on Desktop.")
