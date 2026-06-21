import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import html from 'remark-html';

const showsDirectory = path.join(process.cwd(), 'content/shows');

export interface Show {
  slug: string;
  title: string;
  date: string;
  doorsTime?: string;  
  showTime?: string;
  flyer?: string; 
  bands: Array<{ name: string; instagram?: string }> | string[];
  description?: string;
  photographer?: string | { name: string; instagram?: string };
  rsvpUrl?: string; 
  ticketUrl?: string;
  videos: Array<{ youtube: string; title: string }>;
  audio?: Array<{ bandcamp: string; title: string }>;
  photos?: string[];
  photoFolder?: string;
  photoCredit?: string;
  content: string;
  announced?: boolean;
}

export async function getShowBySlug(slug: string): Promise<Show> {
  const realSlug = slug.replace(/\.md$/, '');
  const fullPath = path.join(showsDirectory, `${realSlug}.md`);
  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(fileContents);

  const processedContent = await remark().use(html).process(content);
  const contentHtml = processedContent.toString();

  return {
    slug: realSlug,
    title: data.title,
    date: data.date,
    doorsTime: data.doorsTime, 
    showTime: data.showTime,
    flyer: data.flyer, 
    bands: data.bands || [],
    description: data.description,
    photographer: data.photographer,
    rsvpUrl: data.rsvpUrl,
    ticketUrl: data.ticketUrl,
    videos: data.videos || [],
    audio: data.audio || [],
    photos: data.photos || [],
    photoFolder: data.photoFolder,
    photoCredit: data.photoCredit,
    content: contentHtml,
    announced: data.announced ?? false,
  };
}

// Today's date in Central Time as "YYYY-MM-DD". Because show.date is also stored
// as "YYYY-MM-DD", these can be compared lexicographically: a show is upcoming while
// show.date >= getTodayCentral(), and flips to past at midnight Central (i.e. right
// after 11:59pm on the day of the show).
export function getTodayCentral(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

export function getAllShowSlugs(): string[] {
  const fileNames = fs.readdirSync(showsDirectory);
  return fileNames.map((fileName) => fileName.replace(/\.md$/, ''));
}