import { supabaseAdmin } from "@/lib/platform/supabase";

function escapeIcs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function toIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!supabaseAdmin) return new Response("Server error.", { status: 500 });

  const { slug } = await params;

  const { data: event, error } = await supabaseAdmin
    .from("events")
    .select("slug, title, description, location, event_time, is_published, is_cancelled")
    .eq("slug", slug)
    .single();

  if (error || !event || !event.is_published) {
    return new Response("Event not found.", { status: 404 });
  }

  const start = new Date(event.event_time);
  const end = new Date(start.getTime() + 2 * 60 * 60_000); // 2h default duration — no end time is collected
  const origin = new URL(req.url).origin;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OppIDX//Events//EN",
    "BEGIN:VEVENT",
    `UID:${event.slug}@oppidx.com`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcs(event.is_cancelled ? `CANCELLED: ${event.title}` : event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    `URL:${origin}/events/${event.slug}`,
    ...(event.is_cancelled ? ["STATUS:CANCELLED"] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
    },
  });
}
