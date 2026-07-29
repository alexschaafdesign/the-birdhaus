import { NextResponse } from "next/server";
import { getAllShows, getTodayCentral } from "@/lib/shows";

// The message is dropped into a TwiML <Say> element, so any XML metacharacters
// in DB-sourced text (band names and titles routinely contain "&", e.g.
// "Nina & the Wolves") must be escaped — otherwise the TwiML is malformed and
// Twilio fails to parse it, silently killing the hotline for that lineup.
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function buildMessage(): Promise<string> {
  const today = getTodayCentral(); // "2026-04-19" in Central Time
  const shows = (await getAllShows()).filter((s) => s.announced !== false);

  // Check for a show today
  const tonightShow = shows.find((s) => s.date === today);

  // Find next upcoming show (after today)
  const upcoming = shows
    .filter((s) => s.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  let message = "Thanks for calling the Birdhaus hotline. ";

  if (tonightShow) {
    const bands =
      tonightShow.bands.map((b) => (typeof b === "string" ? b : b.name)).join(", ") ||
      tonightShow.title;
    message += `There IS a show tonight. `;
    if (tonightShow.doorsTime) message += `Doors are at ${tonightShow.doorsTime}. `;
    if (tonightShow.showTime) message += `Music starts at ${tonightShow.showTime}. `;
    message += `Tonight's lineup is: ${bands}. `;
  } else {
    message += `There is no show at the Birdhaus tonight. `;
  }

  if (upcoming) {
    const upcomingDate = new Date(upcoming.date + "T12:00:00");
    const formatted = upcomingDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const bands =
      upcoming.bands.map((b) => (typeof b === "string" ? b : b.name)).join(", ") ||
      upcoming.title;
    message += `The next show is ${formatted}, featuring ${bands}. `;
  }

  message += "Check the-birdhaus.org for full details and tickets. See you soon. I love you.";
  return message;
}

export async function POST() {
  const message = await buildMessage();

  // Twilio expects TwiML XML in response
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">${escapeXml(message)}</Say>
</Response>`;

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}