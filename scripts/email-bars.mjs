#!/usr/bin/env node
// Renders the email header's colour bars (lib/email-layout.ts EMAIL_BARS_URL):
// the rail's five bars (components/ui/RailHeader: amber, orange, red, magenta,
// violet), 28×4 each, as one PNG at 2× (280×8, shown 140×4). An image because
// Gmail's dark mode recolours table cells but never images.
//
//   node scripts/email-bars.mjs <out.png>
//
// Writes a local file only; uploading is a separate step, under a new name.
import sharp from 'sharp';

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/email-bars.mjs <out.png>');
  process.exit(1);
}
const BARS = ['#FDC900', '#FF6500', '#FF002A', '#B200D8', '#4C00B9']; // --color-spectrum-*
const W = 56; // per bar, at 2×
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W * BARS.length}" height="8">` +
  BARS.map((hex, i) => `<rect x="${i * W}" y="0" width="${W}" height="8" fill="${hex}"/>`).join('') +
  `</svg>`;
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
console.log(`wrote ${out} (${W * BARS.length}×8)`);
