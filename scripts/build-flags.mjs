// Builds assets/flags/<cc>.webp and src/data/flags.ts: every playable
// country's flag, for the Flags mode, from flag-icons (MIT,
// github.com/lipis/flag-icons). Flags are 4:3, so they all fit the same card.
//
//   node scripts/build-flags.mjs
//
// The SVGs are drawn to WebP in Chromium, through Playwright (not a project
// dependency: run it where `require('playwright')` works). Images keep the
// detailed coats of arms exact on every platform, where react-native-svg
// would have to draw them. Downloads go to scripts/.cache (gitignored).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cache = join(here, '.cache', 'flags');
const outDir = join(root, 'assets', 'flags');
const SRC = 'https://raw.githubusercontent.com/lipis/flag-icons/v7.6.0/flags/4x3/';
// Drawn at twice the size the game shows them, for sharp flags on phones.
const WIDTH = 480;
const HEIGHT = 360;
// Lossy WebP: about half the size of PNG, and the edges stay clean at this size.
const QUALITY = 0.8;

const world = JSON.parse(readFileSync(join(root, 'src', 'data', 'world.json'), 'utf8'));
const codes = world.countries.map((c) => c.iso).sort();

mkdirSync(cache, { recursive: true });
for (const iso of codes) {
  const file = join(cache, `${iso.toLowerCase()}.svg`);
  if (existsSync(file)) continue;
  const res = await fetch(`${SRC}${iso.toLowerCase()}.svg`);
  if (!res.ok) throw new Error(`${iso}: ${res.status}`);
  writeFileSync(file, await res.text());
}

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const iso of codes) {
  const svg = readFileSync(join(cache, `${iso.toLowerCase()}.svg`), 'utf8');
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const webp = await page.evaluate(
    async ({ src, width, height, quality }) => {
      const img = new Image(width, height);
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      return canvas.toDataURL('image/webp', quality);
    },
    { src, width: WIDTH, height: HEIGHT, quality: QUALITY },
  );
  writeFileSync(join(outDir, `${iso.toLowerCase()}.webp`), Buffer.from(webp.split(',')[1], 'base64'));
}
await browser.close();

// Metro bundles only images it sees in a require() with a fixed path.
const lines = codes.map((iso) => `  ${iso}: require('../../assets/flags/${iso.toLowerCase()}.webp'),`);
writeFileSync(
  join(root, 'src', 'data', 'flags.ts'),
  `// Made by scripts/build-flags.mjs; don't edit by hand.\nexport const FLAGS: Record<string, number> = {\n${lines.join('\n')}\n};\n`,
);
console.log(`${codes.length} flags → assets/flags`);
