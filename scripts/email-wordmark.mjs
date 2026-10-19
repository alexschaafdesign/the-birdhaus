#!/usr/bin/env node
// Renders the email header wordmark (lib/email-layout.ts EMAIL_WORDMARK_URL):
// the 2027 horizontal wordmark from components/ui/BirdhausWordmark.tsx, ink on
// a baked-in paper ground, at 2× (400px wide, shown at 200px). The paper ground
// keeps it legible in mail clients that invert colours but not images.
//
//   node scripts/email-wordmark.mjs <out.png>
//
// Writes a local file only. Uploading it to images.thebirdhaus.org/email/ is a
// separate, deliberate step.
import fs from 'node:fs';
import sharp from 'sharp';

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/email-wordmark.mjs <out.png>');
  process.exit(1);
}

const src = fs.readFileSync(new URL('../components/ui/BirdhausWordmark.tsx', import.meta.url), 'utf8');
// The `horizontal` entry of ART: its viewBox and every { d, evenOdd } path.
const block = src.slice(src.indexOf('horizontal: {'), src.indexOf("'short-tail': {"));
const viewBox = block.match(/viewBox: '([^']+)'/)[1];
const paths = [...block.matchAll(/\{ d: '([^']+)'(, evenOdd: true)? \}/g)].map((m) => ({ d: m[1], evenOdd: !!m[2] }));
if (paths.length === 0) throw new Error('no wordmark paths found');

const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);
const INK = '#16150F';
const PAPER = '#F0EDE4';
const W = 400;
const H = Math.round((W * vbH) / vbW);

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${viewBox}">` +
  `<rect x="0" y="0" width="${vbW}" height="${vbH}" fill="${PAPER}"/>` +
  paths.map((p) => `<path d="${p.d}" fill="${INK}"${p.evenOdd ? ' fill-rule="evenodd"' : ''}/>`).join('') +
  `</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
console.log(`wrote ${out} (${W}×${H}, ${paths.length} paths)`);
