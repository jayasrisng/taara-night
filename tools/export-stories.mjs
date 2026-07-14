import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'vite';

const bundle = resolve('/tmp/taara-story-export.js');
await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    lib: {
      entry: resolve('src/shared/constellationData.ts'),
      formats: ['es'],
      fileName: () => 'taara-story-export.js',
    },
    outDir: '/tmp',
    emptyOutDir: false,
    minify: false,
  },
});
const { CONSTELLATION_DATA } = await import(`${pathToFileURL(bundle).href}?v=${Date.now()}`);

const lines = [
  '# Taara — all 88 bedtime stories',
  '',
  'Generated from the exact story text shown in the game. Re-run `npm run stories:export` after editing story data.',
  '',
];

for (const [index, constellation] of CONSTELLATION_DATA.constellations.entries()) {
  lines.push(`## ${index + 1}. ${constellation.name} — ${constellation.meaning}`, '', constellation.story, '');
}

writeFileSync(resolve('STORIES.md'), `${lines.join('\n')}\n`);
console.log(`Exported ${CONSTELLATION_DATA.constellations.length} stories to STORIES.md`);
