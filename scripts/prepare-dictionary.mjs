// Builds the offline English dictionary from WordNet (Princeton University).
// Output: public/dictionary/<letter>.json, loaded one letter at a time on lookup.
// Each file maps a word to its senses: [part of speech, definition, example, synonyms].
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';

const SRC = 'node_modules/wordnet-db/dict', OUT = 'public/dictionary';
const POS = { noun: 'n', verb: 'v', adj: 'a', adv: 'r' };
const MAX_SENSES = 5, MAX_SYNONYMS = 3;

const marker = `${OUT}/.built`;
const built = await stat(marker).catch(() => null), source = await stat(`${SRC}/data.noun`);
if (built && built.mtimeMs >= source.mtimeMs) { console.log('Offline dictionary already prepared.'); process.exit(0); }

const clean = w => w.replace(/\((a|p|ip)\)$/, '').replace(/_/g, ' ');
const bucketOf = w => (/^[a-z]/.test(w) ? w[0] : '_');
const buckets = {};

for (const [file, pos] of Object.entries(POS)) {
  // Synsets: offset → definition, example and member words.
  const synsets = new Map();
  for (const line of (await readFile(`${SRC}/data.${file}`, 'latin1')).split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const bar = line.indexOf(' | ');
    const fields = line.slice(0, bar).split(' '), gloss = line.slice(bar + 3).trim();
    const count = parseInt(fields[3], 16), words = [];
    for (let i = 0; i < count; i++) words.push(clean(fields[4 + i * 2]));
    const parts = gloss.split(/;\s*(?=")/), definition = parts[0].replace(/;\s*$/, '').trim();
    const example = (parts[1] || '').replace(/^"|"$/g, '').split('"')[0].trim();
    synsets.set(fields[0], { definition, example, words });
  }
  // Index: word → its synsets, most common sense first.
  for (const line of (await readFile(`${SRC}/index.${file}`, 'latin1')).split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const f = line.trim().split(' '), word = clean(f[0]);
    // Lookups are for single selected words, so multi-word phrases are left out.
    if (word.includes(' ')) continue;
    const pointers = parseInt(f[3], 10), senses = parseInt(f[4 + pointers], 10);
    const offsets = f.slice(6 + pointers, 6 + pointers + senses).slice(0, MAX_SENSES);
    const bucket = (buckets[bucketOf(word)] ??= Object.create(null));
    const entry = Object.hasOwn(bucket, word) ? bucket[word] : (bucket[word] = []);
    for (const offset of offsets) {
      const s = synsets.get(offset); if (!s) continue;
      const synonyms = s.words.filter(w => w.toLowerCase() !== word).slice(0, MAX_SYNONYMS);
      entry.push(s.example || synonyms.length ? [pos, s.definition, s.example, synonyms] : [pos, s.definition]);
    }
  }
}

await mkdir(OUT, { recursive: true });
let total = 0, words = 0;
for (const [bucket, entries] of Object.entries(buckets)) {
  const json = JSON.stringify(entries);
  total += json.length; words += Object.keys(entries).length;
  await writeFile(`${OUT}/${bucket}.json`, json);
}
await copyFile('node_modules/wordnet-db/LICENSE', `${OUT}/LICENSE-WordNet.txt`);
await writeFile(marker, new Date().toISOString());
console.log(`Prepared offline dictionary: ${words} words, ${(total / 1048576).toFixed(1)} MB.`);
