// Builds data/puzzles.js for Word Chomp.
//
// Sources (downloaded once into .tools/):
//   - Norvig's count_1w.txt (word frequencies from the Google Web Trillion Word Corpus)
//   - ENABLE1 word list (no proper nouns; Scrabble-style vocabulary)
//
// Accepted word = ENABLE1 word with a real-world frequency of at least 100k,
// plus a small list of modern words that predate the ENABLE list.
// "Common" words (used for hints, missed-word reveals, and puzzle difficulty)
// must be in the 20k most-used words of everyday English (OpenSubtitles list).
// That keeps junk tokens like "sae" and "bas" out of the friendly word pool
// even though a very large web corpus would technically count them.
//
// Bonus words: every other 3-7 letter ENABLE1 word that can be formed from a
// rack is shipped with that rack. Bonus words score points but do not count
// toward clearing the garden; blocked terms are still excluded.
//
// Run with: .tools/node/node.exe tools/build-data.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = path.join(ROOT, ".tools");
const OUT = path.join(ROOT, "data", "puzzles.js");

const MIN_ACCEPTED_COUNT = 100_000;
const MAX_COMMON_RANK = 20_000;
const MIN_COMMON_WORDS = { 6: 14, 7: 16 };
const MAX_COMMON_WORDS = 36;
const PUZZLES_PER_TIER = { 6: [85, 85, 70], 7: [85, 90, 80] };

const MODERN_WORDS = `
  app apps email emails online website internet wifi blog blogs blogger bloggers
  podcast podcasts selfie selfies meme memes vlog vlogs emoji emojis hashtag
  hashtags tweet tweets tweeted retweet username usernames login logins upload
  uploads laptop laptops browser browsers webcam webcams texting texted gamer
  gamers gaming webinar webinars
`
  .trim()
  .split(/\s+/);

// Keep the reveal list family friendly. Slurs and strong profanity only.
const BLOCKED = new Set(
  `
  arse ass asses bastard bastards bitch bitches blowjob blowjobs chink chinks
  cock cocks coon coons cum cunt cunts dick dicks dildo dildos dyke dykes fag
  faggot faggots fags fuck fucked fucker fuckers fuckin fucking fucks gook gooks
  handjob handjobs hoe hoes jizz kike kikes nazi nazis negro negroes nigga
  niggas nigger niggers piss pissed pisses pissing porn porno pornos rape raped
  rapes raping rapist rapists retard retards shit shits shitting shitty slut
  sluts slutty spic spics tit tits titties titty twat twats wetback wetbacks
  whore whores wop wops
`
    .trim()
    .split(/\s+/)
);

const ANAGRAM_INDEX = new Map();
const ENABLE_INDEX = new Map();
const FREQ = new Map();
const RANK = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadIfMissing(filename, url) {
  const target = path.join(TOOLS, filename);
  try {
    const existing = await fs.readFile(target, "utf8");
    if (existing.length > 0) return existing;
  } catch {
    // Download below.
  }
  console.log(`Downloading ${url}`);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      await fs.writeFile(target, text);
      return text;
    } catch (error) {
      lastError = error;
      await sleep(800 * (attempt + 1));
    }
  }
  throw new Error(`Could not download ${url}: ${lastError.message}`);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function keyFor(word) {
  return [...word].sort().join("");
}

function buildAnagramIndex(words, index = ANAGRAM_INDEX) {
  for (const word of words) {
    const key = keyFor(word);
    const bucket = index.get(key);
    if (bucket) bucket.push(word);
    else index.set(key, [word]);
  }
}

// Every sorted sub-multiset of at least three letters. At most ~120 lookups.
function subKeys(letters) {
  const counts = new Map();
  for (const letter of letters) counts.set(letter, (counts.get(letter) || 0) + 1);
  const unique = [...counts.keys()].sort();
  const keys = [];
  function walk(index, prefix, length) {
    if (index === unique.length) {
      if (length >= 3) keys.push(prefix);
      return;
    }
    const letter = unique[index];
    for (let n = 0; n <= counts.get(letter); n += 1) {
      walk(index + 1, prefix + letter.repeat(n), length + n);
    }
  }
  walk(0, "", 0);
  return keys;
}

function findWords(letterKey, index = ANAGRAM_INDEX) {
  const found = new Set();
  for (const key of subKeys(letterKey)) {
    const bucket = index.get(key);
    if (bucket) for (const word of bucket) found.add(word);
  }
  return [...found];
}

function tierFor(commonCount, rank, total) {
  // Rank 0 is the richest rack. Rich racks are the easiest.
  const fraction = rank / Math.max(1, total - 1);
  if (fraction < 0.34) return 0; // easy
  if (fraction < 0.76) return 1; // medium
  return 2; // hard
}

async function main() {
  const frequencyText = await downloadIfMissing(
    "count_1w.txt",
    "https://norvig.com/ngrams/count_1w.txt"
  );
  const enableText = await downloadIfMissing(
    "enable1.txt",
    "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt"
  );
  const rankText = await downloadIfMissing(
    "en_50k.txt",
    "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt"
  );

  for (const line of frequencyText.trim().split("\n")) {
    const [word, count] = line.split("\t");
    if (/^[a-z]{3,7}$/.test(word)) FREQ.set(word, Number(count));
  }

  rankText
    .trim()
    .split("\n")
    .forEach((line, index) => {
      const [word] = line.split(" ");
      if (!RANK.has(word)) RANK.set(word, index + 1);
    });

  const enable = enableText
    .trim()
    .split(/\r?\n/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => /^[a-z]{3,7}$/.test(word) && !BLOCKED.has(word));

  const modern = MODERN_WORDS.filter(
    (word) => /^[a-z]{3,7}$/.test(word) && !BLOCKED.has(word)
  );

  const accepted = [
    ...new Set([
      ...enable.filter((word) => (FREQ.get(word) || 0) >= MIN_ACCEPTED_COUNT),
      ...modern,
    ]),
  ].sort();

  const common = new Set(
    accepted.filter(
      (word) =>
        (RANK.get(word) || Number.POSITIVE_INFINITY) <= MAX_COMMON_RANK ||
        modern.includes(word)
    )
  );

  buildAnagramIndex(accepted);
  buildAnagramIndex(enable, ENABLE_INDEX);
  console.log(
    `Dictionary: ${accepted.length} accepted words, ${common.size} common words, ${enable.length} bonus-capable ENABLE1 words`
  );

  const result = { 6: [], 7: [] };
  const poolStats = {};

  for (const length of [6, 7]) {
    const seenKeys = new Set();
    const eligible = [];

    for (const word of accepted) {
      if (word.length !== length) continue;
      const letterKey = keyFor(word);
      if (seenKeys.has(letterKey)) continue;
      seenKeys.add(letterKey);

      const counts = new Map();
      for (const letter of letterKey) {
        counts.set(letter, (counts.get(letter) || 0) + 1);
      }
      const vowels = new Set([...letterKey].filter((c) => "aeiou".includes(c)));
      if (vowels.size < 2) continue;
      if (Math.max(...counts.values()) > 2) continue;
      if (letterKey.includes("q") && !letterKey.includes("u")) continue;

      const words = findWords(letterKey);
      const commonWords = words.filter((item) => common.has(item));
      if (commonWords.length < MIN_COMMON_WORDS[length]) continue;
      if (commonWords.length > MAX_COMMON_WORDS) continue;
      if (commonWords.filter((item) => item.length >= 5).length < 4) continue;
      if (commonWords.filter((item) => item.length === 3).length < 5) continue;
      // Make sure every rack can earn the all-letter bonus.
      if (!commonWords.some((item) => item.length === length)) continue;

      const rareLetters = [...letterKey].filter((c) => "jkqvwxz".includes(c)).length;

      eligible.push({
        letterKey,
        commonWords: commonWords.sort(),
        rareLetters,
      });
    }

    eligible.sort(
      (a, b) =>
        b.commonWords.length - a.commonWords.length ||
        a.letterKey.localeCompare(b.letterKey)
    );

    const total = eligible.length;
    const byTier = [[], [], []];
    eligible.forEach((puzzle, rank) => {
      let tier = tierFor(puzzle.commonWords.length, rank, total);
      // Very rare-letter racks are not first-round material.
      if (puzzle.rareLetters >= 3 && tier === 0) tier = 1;
      byTier[tier].push(puzzle);
    });

    poolStats[length] = {
      eligible: total,
      tiers: byTier.map((bucket) => bucket.length),
    };

    const random = mulberry32(length * 8675309 + 41);
    const picked = [];
    const caps = PUZZLES_PER_TIER[length];

    byTier.forEach((bucket, tier) => {
      const shuffled = shuffle(bucket, random);
      for (const puzzle of shuffled.slice(0, caps[tier])) {
        const goalWords = new Set(puzzle.commonWords);
        const bonusWords = findWords(puzzle.letterKey, ENABLE_INDEX)
          .filter((word) => !goalWords.has(word))
          .sort();
        picked.push({
          t: tier,
          l: puzzle.letterKey,
          w: puzzle.commonWords.join(" "),
          b: bonusWords.join(" "),
        });
      }
    });

    // Present each tier in a stable, arbitrary order. The game randomizes again.
    picked.sort((a, b) => a.t - b.t || a.l.localeCompare(b.l));
    result[length] = picked;
  }

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  const header = `// Generated by tools/build-data.mjs - do not edit by hand.\n// Sources: ENABLE1 word list + Google/Norvig word frequency list.\n`;
  const body = `window.WORD_CHOMP_PUZZLES = ${JSON.stringify(result)};\n`;
  await fs.writeFile(OUT, header + body);

  const size = Buffer.byteLength(header + body);
  const bonusCount = [...result[6], ...result[7]].reduce(
    (total, puzzle) =>
      total + puzzle.b.split(" ").filter(Boolean).length,
    0
  );
  console.log("Pool stats:", poolStats);
  console.log("Bonus words shipped:", bonusCount);
  console.log(
    "Generated:",
    result[6].length,
    "six-letter racks,",
    result[7].length,
    "seven-letter racks"
  );
  console.log(`Wrote ${OUT} (${(size / 1024).toFixed(1)} KB)`);

  for (const length of [6, 7]) {
    console.log(`\nSample ${length}-letter racks:`);
    for (const tier of [0, 1, 2]) {
      const puzzle = result[length].find((item) => item.t === tier);
      if (puzzle) {
        console.log(
          `  tier ${tier}: ${puzzle.l.toUpperCase()} (${puzzle.w.split(" ").length} words) -> ${puzzle.w
            .split(" ")
            .join(", ")}`
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
