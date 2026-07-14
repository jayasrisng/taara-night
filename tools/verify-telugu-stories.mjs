import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'vite';

const TELUGU_PATH = resolve('stories/telugu-bedtime-stories.md');
const bundle = resolve('/tmp/taara-telugu-story-verification.js');

await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    lib: {
      entry: resolve('src/shared/constellationData.ts'),
      formats: ['es'],
      fileName: () => 'taara-telugu-story-verification.js',
    },
    outDir: '/tmp',
    emptyOutDir: false,
    minify: false,
  },
});

const { CONSTELLATION_DATA } = await import(`${pathToFileURL(bundle).href}?v=${Date.now()}`);
const english = CONSTELLATION_DATA.constellations;
const teluguMarkdown = await readFile(TELUGU_PATH, 'utf8');

function parseTelugu(markdown) {
  const headings = [...markdown.matchAll(/^##\s+(\d+)\.\s+(.+?)\s*$/gm)];
  return headings.map((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    const section = markdown.slice(start, end).trim();
    const title = section.match(/^###\s+తెలుగు పేరు:\s*(.+?)\s*$/m)?.[1]?.trim() ?? '';
    const story = section.match(/^###\s+కథ\s*$([\s\S]*?)(?=^###\s+ఆకాశం గురించి ఒక చిన్న విషయం\s*$)/m)?.[1]?.trim() ?? '';
    const fact = section.match(/^###\s+ఆకాశం గురించి ఒక చిన్న విషయం\s*$([\s\S]*?)(?=^---\s*$|\z)/m)?.[1]?.trim() ?? '';
    return { number: Number(heading[1]), iauName: heading[2].trim(), title, story, fact };
  });
}

function duplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function repeatedNonemptyLines(text) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return duplicates(lines);
}

function sha(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const telugu = parseTelugu(teluguMarkdown);
const teluguByNumber = new Map(telugu.map((record) => [record.number, record]));
const issues = [];

if (english.length !== 88) issues.push(`Expected 88 English runtime records; found ${english.length}.`);
if (telugu.length !== 88) issues.push(`Expected 88 Telugu records; found ${telugu.length}.`);

const duplicateEnglishIds = duplicates(english.map((record) => record.id));
const duplicateTeluguNumbers = duplicates(telugu.map((record) => record.number));
if (duplicateEnglishIds.length) issues.push(`Duplicate English constellation IDs: ${duplicateEnglishIds.join(', ')}.`);
if (duplicateTeluguNumbers.length) issues.push(`Duplicate Telugu story numbers: ${duplicateTeluguNumbers.join(', ')}.`);

const expectedNumbers = Array.from({ length: 88 }, (_, index) => index + 1);
const missingNumbers = expectedNumbers.filter((number) => !teluguByNumber.has(number));
if (missingNumbers.length) issues.push(`Missing Telugu story numbers: ${missingNumbers.join(', ')}.`);

for (const record of telugu) {
  const repeated = repeatedNonemptyLines(record.story);
  if (repeated.length) {
    issues.push(
      `Telugu #${record.number} ${record.iauName}: story contains ${repeated.length} duplicated full paragraph${repeated.length === 1 ? '' : 's'}.`
    );
  }
}

const rows = english.map((record, index) => {
  const number = index + 1;
  const te = teluguByNumber.get(number);
  const englishPresent = typeof record.story === 'string' && record.story.trim().length > 0;
  const teluguPresent = Boolean(te?.story && te?.fact && te?.title);
  const nameMatch = te?.iauName === record.name;
  const orderMatch = telugu[index]?.number === number && telugu[index]?.iauName === record.name;
  const repeated = te ? repeatedNonemptyLines(te.story) : [];
  const matched = englishPresent && teluguPresent && nameMatch && orderMatch && repeated.length === 0;
  let notes = 'Mapped by number + exact IAU name + existing ID; translated title was not used as identity.';
  if (!te) notes = 'Missing Telugu record.';
  else if (!nameMatch) notes = `IAU mismatch: expected “${record.name}”, found “${te.iauName}”.`;
  else if (!orderMatch) notes = 'Number/name pair is out of sequence.';
  else if (repeated.length) notes = `Mapping is exact, but the Telugu story repeats a full paragraph ${repeated.length + 1} times.`;
  return { number, id: record.id, enName: record.name, teName: te?.iauName ?? '—', englishPresent, teluguPresent, matched, notes };
});

for (const row of rows) {
  if (!row.matched && !row.notes.startsWith('Mapping is exact')) {
    issues.push(`#${row.number} ${row.id}: ${row.notes}`);
  }
}

const englishStoryHash = sha(english.map(({ id, name, meaning, story }) => ({ id, name, meaning, story })));
const puzzleHash = sha(english.map(({ id, stars, connections }) => ({ id, stars, connections })));
const passed = issues.length === 0;

if (process.argv.includes('--json')) {
  if (!passed) {
    process.stderr.write(`${issues.join('\n')}\n`);
    process.exitCode = 2;
  } else {
    const localized = Object.fromEntries(
      english.map((record, index) => {
        const te = teluguByNumber.get(index + 1);
        return [
          record.id,
          {
            number: index + 1,
            iauName: record.name,
            title: te.title,
            story: te.story,
            fact: te.fact,
          },
        ];
      })
    );
    process.stdout.write(`${JSON.stringify(localized, null, 2)}\n`);
  }
} else {

const lines = [
  '# English–Telugu Story Integration Check',
  '',
  `- **Gate result:** ${passed ? 'PASS — integration may proceed' : 'STOP — integration is not permitted'}`,
  `- **English source:** \`src/shared/constellationData.ts\` → runtime \`CONSTELLATION_DATA.constellations\``,
  `- **Telugu source:** \`stories/telugu-bedtime-stories.md\``,
  `- **English runtime records:** ${english.length}`,
  `- **Telugu manuscript records:** ${telugu.length}`,
  `- **English story baseline SHA-256:** \`${englishStoryHash}\``,
  `- **Puzzle coordinates/connections baseline SHA-256:** \`${puzzleHash}\``,
  '',
  '## Located integration surfaces',
  '',
  '- Puzzle IDs/order and English stories: `src/shared/constellationData.ts`',
  '- Runtime schema and validation: `src/shared/constellations.ts`, `src/shared/constellationLoader.ts`',
  '- Completed-story modal: `src/client/ui/StoryCard.ts`',
  '- Modal callers: `src/client/scenes/Play.ts`, `src/client/scenes/MySky.ts`',
  '- Audio: ambient sound toggle only in `src/client/audio/ambience.ts` and `Play.ts`; story narration/speaker logic does not exist.',
  '- Localization: no existing i18n/localization framework or language preference exists.',
  '',
  '## Verification summary',
  '',
  `- Numbers 1–88 present exactly once: ${missingNumbers.length === 0 && duplicateTeluguNumbers.length === 0 ? 'yes' : 'no'}`,
  `- Duplicate English constellation IDs: ${duplicateEnglishIds.length ? duplicateEnglishIds.join(', ') : 'none'}`,
  `- English/Telugu IAU order identical: ${rows.every((row) => row.enName === row.teName) ? 'yes' : 'no'}`,
  '- Telugu translated titles used for mapping: no',
  '- English runtime stories modified during verification: no',
  '- Puzzle coordinates/connections modified during verification: no',
  '',
  '## Issues',
  '',
  ...(issues.length ? issues.map((issue) => `- ${issue}`) : ['- None.']),
  '',
  '## All 88 records',
  '',
  '| # | Existing ID | English IAU name | Telugu manuscript IAU name | English story | Telugu story | Status | Notes |',
  '|---:|---|---|---|:---:|:---:|---|---|',
  ...rows.map((row) =>
    `| ${row.number} | \`${cell(row.id)}\` | ${cell(row.enName)} | ${cell(row.teName)} | ${row.englishPresent ? 'yes' : 'no'} | ${row.teluguPresent ? 'yes' : 'no'} | ${row.matched ? 'MATCH' : 'ISSUE'} | ${cell(row.notes)} |`
  ),
  '',
  '## Decision',
  '',
  passed
    ? 'All 88 mappings are exact and high-confidence. Phase 2 may proceed.'
    : 'The stop condition is active. Do not change the game or integrate Telugu until every issue above is resolved in the approved manuscript.',
  '',
];

process.stdout.write(lines.join('\n'));
process.exitCode = passed ? 0 : 2;
}
