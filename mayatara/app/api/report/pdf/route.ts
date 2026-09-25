import PDFDocument from "pdfkit";
import { SITE_DISPLAY } from "@/lib/seo";
import { rateLimit, getIP, rateLimitResponse, readJsonBody } from "@/lib/security";

interface ReportData {
  personA: string;
  personB: string;
  lookingFor: string;
  overallScore: number;
  scores: Record<string, number>;
  summary: string;
  strengths: string[];
  watchpoints: string[];
  conversationStarters: string[];
  verdict: string;
}

function isValidReportData(d: unknown): d is ReportData {
  if (!d || typeof d !== "object") return false;
  const r = d as Record<string, unknown>;
  return (
    typeof r.personA === "string" && typeof r.personB === "string" &&
    typeof r.lookingFor === "string" && typeof r.overallScore === "number" &&
    typeof r.summary === "string" && typeof r.verdict === "string" &&
    typeof r.scores === "object" && r.scores !== null &&
    Array.isArray(r.strengths) && r.strengths.every((s) => typeof s === "string") &&
    Array.isArray(r.watchpoints) && r.watchpoints.every((s) => typeof s === "string") &&
    Array.isArray(r.conversationStarters) && r.conversationStarters.every((s) => typeof s === "string")
  );
}

export async function POST(req: Request) {
  // No auth: this generates a PDF from data already computed client-side
  // (the compatibility score itself), same trust level as /api/compatibility.
  // But unlike that route it was previously reachable with no rate limit and
  // no size cap — an unmetered PDF-generation loop is a real cost/DoS vector.
  const ip = getIP(req);
  const rl = rateLimit("report-pdf", ip, 20, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const bodyResult = await readJsonBody<unknown>(req, 32_768);
  if (!bodyResult.ok) return bodyResult.error;

  if (!isValidReportData(bodyResult.data)) {
    return Response.json({ error: "Malformed report data." }, { status: 400 });
  }
  const data = bodyResult.data;

  try {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 60, size: "A4" });

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    const SAFFRON = "#D4600A";
    const INK     = "#2C1810";
    const MUTED   = "#6B4C35";
    const BORDER  = "#C4A45A";
    const GREEN   = "#2D5016";
    const MAROON  = "#8B1A1A";

    // Header band
    doc.rect(0, 0, 595, 80).fill("#8B1A1A");
    doc.fillColor("#FAF0D7").fontSize(26).font("Helvetica-Bold")
      .text("THE MAYATARA", 60, 22, { characterSpacing: 4 });
    doc.fillColor("#FAF0D7").fontSize(10).font("Helvetica")
      .text("COMPATIBILITY REPORT", 60, 52, { characterSpacing: 3 });
    doc.fillColor("#FAF0D7").fontSize(10)
      .text(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), 0, 52, { align: "right", width: 535 });

    let y = 100;

    // Names + looking for
    doc.fillColor(INK).fontSize(14).font("Helvetica-Bold")
      .text(`${data.personA}  ·  ${data.personB}`, 60, y, { align: "center", width: 475 });
    y += 22;
    doc.fillColor(MUTED).fontSize(10).font("Helvetica")
      .text(`Context: ${data.lookingFor}`, 60, y, { align: "center", width: 475 });
    y += 30;

    // Big score
    doc.roundedRect(197, y, 200, 70, 4).stroke(BORDER);
    doc.fillColor(SAFFRON).fontSize(40).font("Helvetica-Bold")
      .text(`${data.overallScore}`, 197, y + 8, { align: "center", width: 200 });
    doc.fillColor(MUTED).fontSize(9).font("Helvetica")
      .text("OVERALL COMPATIBILITY", 197, y + 52, { align: "center", width: 200, characterSpacing: 1 });
    y += 90;

    // Verdict
    doc.fillColor(SAFFRON).fontSize(13).font("Helvetica-Bold")
      .text(data.verdict.toUpperCase(), 60, y, { align: "center", width: 475, characterSpacing: 2 });
    y += 30;

    // Score bars
    doc.fillColor(MUTED).fontSize(8).font("Helvetica")
      .text("DETAILED BREAKDOWN", 60, y, { characterSpacing: 2 });
    y += 14;

    for (const [label, score] of Object.entries(data.scores)) {
      const barColor = score >= 80 ? GREEN : score >= 60 ? SAFFRON : MAROON;
      doc.fillColor(MUTED).fontSize(9).font("Helvetica")
        .text(label.toUpperCase().replace(/_/g, " "), 60, y);
      doc.fillColor(barColor).fontSize(9).font("Helvetica-Bold")
        .text(`${score}`, 510, y, { align: "right", width: 25 });
      y += 12;
      doc.rect(60, y, 475, 8).stroke(BORDER);
      doc.rect(60, y, Math.round(475 * score / 100), 8).fill(barColor);
      y += 16;
    }
    y += 10;

    // Summary
    doc.fillColor(MUTED).fontSize(8).font("Helvetica")
      .text("AI SUMMARY", 60, y, { characterSpacing: 2 });
    y += 14;
    doc.fillColor(INK).fontSize(10).font("Helvetica")
      .text(data.summary, 60, y, { width: 475, lineGap: 3 });
    y += doc.heightOfString(data.summary, { width: 475 }) + 16;

    // Strengths
    doc.fillColor(GREEN).fontSize(8).font("Helvetica-Bold")
      .text("• STRENGTHS", 60, y, { characterSpacing: 2 });
    y += 14;
    for (const s of data.strengths) {
      doc.fillColor(INK).fontSize(10).font("Helvetica")
        .text(`•  ${s}`, 60, y, { width: 475 });
      y += doc.heightOfString(s, { width: 460 }) + 6;
    }
    y += 6;

    // Watchpoints
    doc.fillColor(MAROON).fontSize(8).font("Helvetica-Bold")
      .text("! DISCUSS EARLY", 60, y, { characterSpacing: 2 });
    y += 14;
    for (const w of data.watchpoints) {
      doc.fillColor(INK).fontSize(10).font("Helvetica")
        .text(`!  ${w}`, 60, y, { width: 475 });
      y += doc.heightOfString(w, { width: 460 }) + 6;
    }
    y += 10;

    // Conversation starters
    doc.fillColor(SAFFRON).fontSize(8).font("Helvetica-Bold")
      .text("CONVERSATION STARTERS FOR YOUR FIRST MEETING", 60, y, { characterSpacing: 1 });
    y += 14;
    data.conversationStarters.forEach((q, i) => {
      doc.rect(60, y, 475, doc.heightOfString(q, { width: 455 }) + 14).stroke(BORDER);
      doc.fillColor(SAFFRON).fontSize(9).font("Helvetica-Bold").text(`${i + 1}.`, 70, y + 7);
      doc.fillColor(INK).fontSize(10).font("Helvetica").text(q, 86, y + 7, { width: 440 });
      y += doc.heightOfString(q, { width: 440 }) + 20;
    });

    // Footer
    //
    // A4 is 842pt tall and the document margin is 60, so pdfkit's text area
    // ends at 782. Drawing 8pt text at y=775 crossed that line, and pdfkit
    // responds to an overflow by starting a new page and putting the text
    // there — which is why every report came out three pages long with an
    // empty footer band. Dropping the bottom margin for this one call keeps it
    // on the page, and lineBreak:false stops the line wrapping into a second
    // overflow.
    doc.rect(0, 762, 595, 80).fill("#FAF0D7");
    doc.moveTo(0, 762).lineTo(595, 762).stroke(BORDER);

    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor(MUTED).fontSize(8).font("Helvetica")
      .text(`THE MAYATARA · FOR THE REAL ONES · ${SITE_DISPLAY} · Free. Private. No subscription.`, 60, 790, {
        align: "center", width: 475, characterSpacing: 1, lineBreak: false,
      });
    doc.page.margins.bottom = bottomMargin;

    doc.end();
  });

  const pdf = Buffer.concat(chunks);
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="maytara-compatibility-${Date.now()}.pdf"`,
    },
  });
  } catch (e) {
    // Without this, a pdfkit failure mid-stream threw past this handler and
    // Next.js's generic HTML error page came back with a 200-looking blob
    // that the caller happily saved as a .pdf file.
    console.error("[report/pdf]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Failed to generate PDF." }, { status: 500 });
  }
}
