import PDFDocument from "pdfkit";
import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

const MAX_BODY = 20_000

function ip(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

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

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY) {
    return new Response(JSON.stringify({ error: 'Request too large.' }), { status: 413 })
  }

  // Unauthenticated, CPU-bound PDF generation from client-supplied text —
  // rate-limited so it can't be hammered as a resource-exhaustion vector.
  const rl = rateLimit(`match-report-pdf:${ip(req)}`, 10 * 60_000, 10, 30 * 60_000)
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
      status: 429, headers: { 'Retry-After': String(rl.retryAfter) },
    })
  }

  const data: ReportData = await req.json();

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
      .text("OPPIDX MATCH", 60, 22, { characterSpacing: 4 });
    doc.fillColor("#FAF0D7").fontSize(10).font("Helvetica")
      .text("COMPATIBILITY REPORT", 60, 52, { characterSpacing: 3 });
    doc.fillColor("#FAF0D7").fontSize(10)
      .text(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), 0, 52, { align: "right", width: 535 });

    let y = 100;

    // Names + looking for
    doc.fillColor(INK).fontSize(14).font("Helvetica-Bold")
      .text(`${data.personA}  ✦  ${data.personB}`, 60, y, { align: "center", width: 475 });
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
      .text("✦ STRENGTHS", 60, y, { characterSpacing: 2 });
    y += 14;
    for (const s of data.strengths) {
      doc.fillColor(INK).fontSize(10).font("Helvetica")
        .text(`✓  ${s}`, 60, y, { width: 475 });
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
    doc.rect(0, 762, 595, 80).fill("#FAF0D7");
    doc.moveTo(0, 762).lineTo(595, 762).stroke(BORDER);
    doc.fillColor(MUTED).fontSize(8).font("Helvetica")
      .text("OPPIDX MATCH · FOR THE REAL ONES · oppidx.com/match · Free. Private. No subscription.", 60, 775, { align: "center", width: 475, characterSpacing: 1 });

    doc.end();
  });

  const pdf = Buffer.concat(chunks);
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="maytara-compatibility-${Date.now()}.pdf"`,
    },
  });
}
