import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { getTodayCentral } from "@/lib/shows";

interface ShowFrontmatter {
  title: string;
  date: string;
  doorsTime?: string;
  showTime?: string;
  bands?: { name: string }[];
  announced?: boolean;
}

function getShows(): ShowFrontmatter[] {
  const showsDir = path.join(process.cwd(), "content/shows");
  const files = fs.readdirSync(showsDir).filter((f) => f.endsWith(".md"));

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(showsDir, file), "utf-8");
    const { data } = matter(raw);
    return data as ShowFrontmatter;
  });
}

function buildMessage(): string {
  const today = getTodayCentral(); // "2026-04-19" in Central Time
  const shows = getShows().filter((s) => s.announced !== false);

  // Check for a show today
  const tonightShow = shows.find((s) => s.date === today);

  // Find next upcoming show (after today)
  const upcoming = shows
    .filter((s) => s.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  let message = "Thanks for calling the Birdhaus hotline. ";

  if (tonightShow) {
    const bands = tonightShow.bands?.map((b) => b.name).join(", ") ?? tonightShow.title;
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
    const bands = upcoming.bands?.map((b) => b.name).join(", ") ?? upcoming.title;
    message += `The next show is ${formatted}, featuring ${bands}. `;
  }

  message += "Check the-birdhaus.org for full details and tickets. See you soon. I love you.";
  return message;
}

export async function POST() {
  const message = buildMessage();

  // Twilio expects TwiML XML in response
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">${message}</Say>
</Response>`;

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}