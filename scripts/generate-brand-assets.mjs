import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets/logo.png');
const output = path.join(root, 'public');
// Package the supplied artwork for the web. Preserve its full aspect ratio;
// do not crop, trace, recolor, or replace the original source.
const header = await sharp(source).resize({ width: 168 }).png({ compressionLevel: 9 }).toBuffer();
await fs.writeFile(path.join(output, 'brand-logo.png'), header);
for (const [name, size] of [['favicon.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  await sharp(source).resize(size, size, { fit: 'contain', background: '#ffffff' }).png({ compressionLevel: 9 }).toFile(path.join(output, name));
}
// Keep every part of the mark inside the central 80%-diameter safe circle.
const maskable = await sharp(source).resize(288, 288, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#ffffff' } }).composite([{ input: maskable, gravity: 'centre' }]).png({ compressionLevel: 9 }).toFile(path.join(output, 'icon-maskable-512.png'));
const logoData = `data:image/png;base64,${header.toString('base64')}`;
// A self-contained sharing card uses the same logo and approved headline.
const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f5f7fb"/>
  <circle cx="1090" cy="40" r="380" fill="#eeecff"/>
  <image href="${logoData}" x="64" y="54" width="58" height="58" preserveAspectRatio="xMidYMid meet"/>
  <g font-family="DejaVu Sans, sans-serif">
    <text x="138" y="87" font-size="27" font-weight="700" fill="#172036">Jump in the Mix</text>
    <text x="64" y="196" font-size="21" fill="#4837ce">For the people who matter</text>
    <text x="60" y="292" font-size="72" font-weight="700" letter-spacing="-3" fill="#172036">Good relationships</text>
    <text x="60" y="380" font-size="72" font-weight="700" letter-spacing="-3" fill="#4837ce">have a rhythm.</text>
    <text x="64" y="461" font-size="25" fill="#56627a">Your contacts. Thoughtful follow-ups. One simple daily list.</text>
    <path d="M64 512h1072" stroke="#dfe4ee"/>
    <text x="64" y="562" font-size="20" fill="#56627a">Business · Personal · Your network</text>
  </g>
</svg>\n`;
await fs.writeFile(path.join(output, 'relationship-preview.svg'), card);
await sharp(Buffer.from(card)).png({ compressionLevel: 9 }).toFile(path.join(output, 'relationship-preview.png'));
console.log('Prepared header logo, five app icons, and sharing card from assets/logo.png.');
