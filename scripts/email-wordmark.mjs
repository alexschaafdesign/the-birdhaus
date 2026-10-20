#!/usr/bin/env node
// Renders the email header wordmark PNGs (lib/email-layout.ts): the 2027
// wordmark from components/ui/BirdhausWordmark.tsx in its medium (primary)
// weight — the `short-tail` artwork — at 2× (480px wide, shown at 240px). The
// thin `horizontal` web export reads scratchy at email size.
//
//   node scripts/email-wordmark.mjs <out.png> [variant] [short-tail|horizontal]
//
// Variants:
//   ink-outline  transparent; ink strokes inside a ~2px (at 2×) paper outline,
//                so it reads on paper and on Gmail's dark ground (Gmail darkens
//                the email but never images) with no box around it
//   red          transparent; accent red, no outline
//   paper        transparent; paper strokes, for clients that honour
//                prefers-color-scheme: dark (Apple Mail, iOS Mail)
//   ink-on-paper the first version: ink on a baked-in paper ground
//
// Writes a local file only. Uploading to images.thebirdhaus.org/email/ is a
// separate, deliberate step, always under a new file name.
import fs from 'node:fs';
import sharp from 'sharp';

const [out, variant = 'ink-outline', layout = 'short-tail'] = process.argv.slice(2);
if (!out) {
  console.error('usage: node scripts/email-wordmark.mjs <out.png> [ink-outline|red|paper|ink-on-paper] [short-tail|horizontal]');
  process.exit(1);
}

const INK = '#16150F';
const PAPER = '#F0EDE4';
const RED = '#D60023';
const STYLES = {
  'ink-outline': { fill: INK, outline: PAPER, ground: null },
  red: { fill: RED, outline: null, ground: null },
  paper: { fill: PAPER, outline: null, ground: null },
  'ink-on-paper': { fill: INK, outline: null, ground: PAPER },
};
const style = STYLES[variant];
if (!style) throw new Error(`unknown variant ${variant}`);

const src = fs.readFileSync(new URL('../components/ui/BirdhausWordmark.tsx', import.meta.url), 'utf8');
// One entry of ART: its viewBox and every { d, evenOdd } path.
const start = layout === 'horizontal' ? src.indexOf('horizontal: {') : src.indexOf("'short-tail': {");
const end = layout === 'horizontal' ? src.indexOf("'short-tail': {") : src.indexOf('export type BirdhausWordmarkProps');
const block = src.slice(start, end);
const viewBox = block.match(/viewBox: '([^']+)'/)[1];
const paths = [...block.matchAll(/\{ d: '([^']+)'(, evenOdd: true)? \}/g)].map((m) => ({ d: m[1], evenOdd: !!m[2] }));
if (paths.length === 0) throw new Error('no wordmark paths found');

const [vbX, vbY, vbW, vbH] = viewBox.split(/\s+/).map(Number);
const W = 480;
// ~2px at 2× in viewBox units. The stroke is centred on the outline, so it's
// drawn at twice that width under the fill; the canvas is padded by the same
// amount so nothing clips.
const unitsPerPx = vbW / W;
const outline = style.outline ? 2 * unitsPerPx : 0;
const pad = outline;
const box = { x: vbX - pad, y: vbY - pad, w: vbW + 2 * pad, h: vbH + 2 * pad };
const H = Math.round((W * box.h) / box.w);
const rule = (p) => (p.evenOdd ? ' fill-rule="evenodd"' : '');

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}">` +
  (style.ground ? `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${style.ground}"/>` : '') +
  (style.outline
    ? paths.map((p) => `<path d="${p.d}" fill="${style.outline}" stroke="${style.outline}" stroke-width="${2 * outline}" stroke-linejoin="round" stroke-linecap="round"${rule(p)}/>`).join('')
    : '') +
  paths.map((p) => `<path d="${p.d}" fill="${style.fill}"${rule(p)}/>`).join('') +
  `</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
console.log(`wrote ${out} (${variant}, ${layout}, ${W}×${H})`);
