// Offline English dictionary built from WordNet (see scripts/prepare-dictionary.mjs).
// Word files are fetched from the app's own bundle, one letter at a time.

const POS_NAMES = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };

// Common irregular forms that suffix rules can't find.
const IRREGULAR = Object.assign(Object.create(null), {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', does: 'do', did: 'do', done: 'do', went: 'go', gone: 'go', goes: 'go',
  ate: 'eat', eaten: 'eat', began: 'begin', begun: 'begin', bit: 'bite', bitten: 'bite',
  blew: 'blow', blown: 'blow', broke: 'break', broken: 'break', brought: 'bring', built: 'build',
  bought: 'buy', caught: 'catch', chose: 'choose', chosen: 'choose', came: 'come', dealt: 'deal',
  dug: 'dig', drew: 'draw', drawn: 'draw', drank: 'drink', drunk: 'drink', drove: 'drive', driven: 'drive',
  fell: 'fall', fallen: 'fall', fed: 'feed', felt: 'feel', fought: 'fight', found: 'find', fled: 'flee',
  flew: 'fly', flown: 'fly', forgot: 'forget', forgotten: 'forget', forgave: 'forgive', forgiven: 'forgive',
  froze: 'freeze', frozen: 'freeze', got: 'get', gotten: 'get', gave: 'give', given: 'give', grew: 'grow',
  grown: 'grow', hung: 'hang', heard: 'hear', hid: 'hide', hidden: 'hide', held: 'hold', kept: 'keep',
  knew: 'know', known: 'know', laid: 'lay', led: 'lead', left: 'leave', lent: 'lend', lay: 'lie', lain: 'lie',
  lost: 'lose', made: 'make', meant: 'mean', met: 'meet', paid: 'pay', rode: 'ride', ridden: 'ride',
  rang: 'ring', rung: 'ring', rose: 'rise', risen: 'rise', ran: 'run', said: 'say', saw: 'see', seen: 'see',
  sought: 'seek', sold: 'sell', sent: 'send', shook: 'shake', shaken: 'shake', shone: 'shine', shot: 'shoot',
  showed: 'show', shown: 'show', shrank: 'shrink', shrunk: 'shrink', sang: 'sing', sung: 'sing', sank: 'sink',
  sunk: 'sink', sat: 'sit', slept: 'sleep', slid: 'slide', spoke: 'speak', spoken: 'speak', spent: 'spend',
  spun: 'spin', stood: 'stand', stole: 'steal', stolen: 'steal', stuck: 'stick', stung: 'sting', struck: 'strike',
  swore: 'swear', sworn: 'swear', swept: 'sweep', swam: 'swim', swum: 'swim', swung: 'swing', took: 'take',
  taken: 'take', taught: 'teach', tore: 'tear', torn: 'tear', told: 'tell', thought: 'think', threw: 'throw',
  thrown: 'throw', understood: 'understand', woke: 'wake', woken: 'wake', wore: 'wear', worn: 'wear',
  won: 'win', wound: 'wind', wrote: 'write', written: 'write',
  children: 'child', men: 'man', women: 'woman', people: 'person', mice: 'mouse', geese: 'goose',
  feet: 'foot', teeth: 'tooth', lives: 'life', wives: 'wife', knives: 'knife', leaves: 'leaf', halves: 'half',
  selves: 'self', shelves: 'shelf', wolves: 'wolf', thieves: 'thief', analyses: 'analysis', crises: 'crisis',
  theses: 'thesis', criteria: 'criterion', phenomena: 'phenomenon', indices: 'index', matrices: 'matrix',
  vertices: 'vertex', appendices: 'appendix', bacteria: 'bacterium', curricula: 'curriculum', media: 'medium',
  better: 'good', best: 'good', worse: 'bad', worst: 'bad', further: 'far', farther: 'far', furthest: 'far',
  less: 'little', least: 'little', more: 'much', most: 'much',
});

// WordNet "morphy" suffix rules, most specific first.
const RULES = [
  ['ies', 'y'], ['ches', 'ch'], ['shes', 'sh'], ['sses', 'ss'], ['ses', 's'], ['xes', 'x'], ['zes', 'z'],
  ['men', 'man'], ['es', 'e'], ['es', ''], ['s', ''],
  ['ied', 'y'], ['ed', 'e'], ['ed', ''], ['ying', 'ie'], ['ing', 'e'], ['ing', ''],
  ['iest', 'y'], ['ier', 'y'], ['est', 'e'], ['est', ''], ['er', 'e'], ['er', ''], ['ly', ''],
];

export const normaliseWord = w => String(w || '').trim().toLowerCase().replace(/[’']/g, "'").replace(/^[^a-z]+|[^a-z]+$/g, '');

/** Base forms to try for a word, in order: the word itself, irregular form, then suffix rules. */
export function candidates(word) {
  const w = normaliseWord(word);
  if (!w) return [];
  const out = [w];
  if (IRREGULAR[w]) out.push(IRREGULAR[w]);
  for (const [suffix, repl] of RULES) {
    if (w.length > suffix.length + 1 && w.endsWith(suffix)) {
      const base = w.slice(0, -suffix.length) + repl;
      out.push(base);
      // stopped → stopp → stop, running → runn → run
      if (!repl && /([bcdfgklmnprstvz])\1$/.test(base)) out.push(base.slice(0, -1));
    }
  }
  return [...new Set(out)];
}

const cache = new Map();
function loadLetter(letter, fetchImpl) {
  const key = /^[a-z]$/.test(letter) ? letter : '_';
  if (!cache.has(key)) {
    const url = new URL(`${import.meta.env?.BASE_URL || '/'}dictionary/${key}.json`, globalThis.location?.origin || 'http://localhost').href;
    cache.set(key, fetchImpl(url).then(r => { if (!r.ok) throw new Error('The dictionary is not available in this build.'); return r.json(); })
      .catch(e => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}

/**
 * Look a word up. Returns { word, lemma, senses: [{pos, definition, example, synonyms}] }
 * or null when nothing matches.
 */
export async function define(word, fetchImpl = globalThis.fetch) {
  for (const lemma of candidates(word)) {
    const entries = await loadLetter(lemma[0], fetchImpl);
    const found = Object.hasOwn(entries, lemma) ? entries[lemma] : null;
    if (found?.length) {
      return {
        word: normaliseWord(word), lemma,
        senses: found.map(([pos, definition, example = '', synonyms = []]) => ({ pos: POS_NAMES[pos] || pos, definition, example, synonyms })),
      };
    }
  }
  return null;
}

/** Is the selection a single word worth looking up? */
export const isSingleWord = text => /^[A-Za-z][A-Za-z'’-]{0,39}$/.test(String(text || '').trim());
