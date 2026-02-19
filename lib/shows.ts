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
  flyer?: string; 
  bands: Array<{ name: string; instagram?: string }> | string[];
  description?: string;
  photographer?: string | { name: string; instagram?: string };
  videos?: Array<{ youtube: string; title: string }>;
  audio?: Array<{ bandcamp: string; title: string }>;
  photos?: string[];
  content: string;
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
    flyer: data.flyer, 
    bands: data.bands || [],
    description: data.description,
    photographer: data.photographer,
    videos: data.videos,
    audio: data.audio,
    photos: data.photos,
    content: contentHtml,
  };
}

export function getAllShowSlugs(): string[] {
  const fileNames = fs.readdirSync(showsDirectory);
  return fileNames.map((fileName) => fileName.replace(/\.md$/, ''));
}