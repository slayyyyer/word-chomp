# Word Chomp!

A garden-variety word dig. Unscramble a rack of letters, find 3–7 letter words, and clear every garden word before the 2:20 timer runs out.

The game is a standalone, serverless static site: vanilla HTML, CSS, and JavaScript with no install, build step, runtime dependency, or network request. All artwork, the gopher, fonts, and synthesized sound effects are original to this project.

## Play

Open [index.html](index.html) directly in a modern browser (double-click it), or serve the folder if you prefer a clean origin:

```bash
# If Node.js is installed:
node tools/serve.mjs

# This checkout also has a portable Node build for Windows:
.tools/node/node.exe tools/serve.mjs
```

Then visit <http://127.0.0.1:4173>.

The game does **not** require a build step or a server. The local server is only a convenience for previewing. Any static host can publish the folder as-is, and `pinokio.json` is included so it also works as a static Pinokio web app.

Both display fonts are embedded in `assets/fonts.css`, so the game works fully offline, including when opened from disk.

## Automatic deployment to GitHub Pages

Every push to `main` runs [deploy-pages.yml](.github/workflows/deploy-pages.yml) and publishes the static game. You can also run it manually from the **Actions** tab with **Run workflow**. The workflow uploads only `index.html`, `icon.svg`, `pinokio.json`, `assets/`, and `data/`; the portable toolchain and data builder are not published.

One-time setup in the GitHub repository:

1. Open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

The published site is <https://slayyyyer.github.io/word-chomp/>. After that setting is saved, each push to `main` deploys automatically.

## How to play

- **Build a word** by clicking/tapping the letter tiles or typing on your keyboard. A tile can be used once per word.
- **Plant it** with Enter or the **Plant word** button. Every valid 3–7 letter ENABLE1 word is accepted (blocked terms excluded).
- **Longer words score more**: 3 letters = 30 points, 4 = 40, 5 = 50, 6 = 60, 7 = 70.
- **Garden words** fill the trail and count toward clearing the round. Every other valid word is a **bonus word**: it scores, but does not fill the trail or block the clear.
- **Use every tile** in the rack for a **+100 Chomp bonus**.
- **Clear all garden words** before time runs out to end the round early and earn a time bonus of **5 points per leftover second**.
- **Shuffle** is free (`Space`). **Hint** costs 50 points and digs up one missing garden word.
- The first round uses a 6-letter rack; later rounds use 7 letters. Every rack can make a full-length word.
- Rounds are **2 minutes 20 seconds**. The run is endless — keep clearing gardens for a higher total, then end the run from the menu.

### Keyboard

| Key | Action |
| --- | --- |
| `A`–`Z` | Add an unused matching tile |
| `Backspace` | Put the last letter back |
| `Enter` | Plant the word |
| `Space` | Shuffle the rack |
| `Esc` | Clear the current word, or close a dialog |

Mouse/touch works for everything too. A mouse-clicked button releases focus so Enter always means “plant word.”

## Scoring and progress

- Points are awarded for every valid word, plus the all-tile bonus. Bonus words score at the same per-letter rate.
- The gopher marker and the dirt trail track the **garden words** left in the round; bonus words do not advance it.
- A hint reveals a garden word without awarding its points and deducts 50 from your current score (never below zero).
- Your best total score and sound preference are saved in `localStorage`.
- Mute/unmute is in the top-right corner.

## Project structure

```
index.html              Home screen, game board, mascot SVG symbols, modal shell
icon.svg                App / favicon mark
pinokio.json            Static Pinokio metadata
assets/styles.css       Responsive visual system, animation, and layout
assets/game.js          Game state, timer, validation, scoring, hints, modals, audio
assets/fonts.css       Self-contained Baloo 2 + Nunito WOFF2 font faces
assets/fonts/           Source WOFF2 files + OFL licenses
data/puzzles.js         Generated racks, garden goals, and per-rack bonus words
tools/build-data.mjs    Builds data/puzzles.js from public word sources
tools/serve.mjs         Tiny dependency-free static file server (optional)
```

The checked-in `data/puzzles.js` is all the game needs at runtime. There is no API, account, or external data call while playing. Every URL is relative, so the folder can be opened from disk or dropped on any static host.

## Rebuilding the word data

The garden targets are deliberately limited to familiar English so the clear goal, hints, and missed-word reveals feel fair. Every other 3–7 letter ENABLE1 word formable from the rack is accepted as a bonus word, so ordinary words like `rant`, `gait`, or `gratin` are not rejected just because they fall outside the target list.

1. Make sure Node.js 18+ is available.
2. Run:

   ```bash
   node tools/build-data.mjs
   ```

   (On this checkout: `.tools/node/node.exe tools/build-data.mjs`.)

The builder downloads its sources into `.tools/` (gitignored) and writes a new `data/puzzles.js`.

### Sources

- [ENABLE1 word list](https://github.com/dolph/dictionary) — a broad, proper-noun-free English word list.
- [Peter Norvig's `count_1w.txt`](https://norvig.com/ngrams/) — Google Web Trillion Word Corpus frequencies, used to exclude obscure entries.
- [FrequencyWords English subtitle list](https://github.com/hermitdave/FrequencyWords) — used to keep the “common word” pool, hints, and missed-word lists to everyday English.
- A short curated list of modern words (for example `email`, `online`, and `app`) that predate the ENABLE list.

The puzzle generator uses the accepted vocabulary to choose racks and build the **garden target list** from common words (top 20k subtitle frequency, or modern additions). The wider cutoff includes everyday words such as `grit` that fall just outside shorter frequency lists. It also:

- rejects racks with fewer than 2 distinct vowels, triple letters, or `q` without `u`;
- keeps 14–36 **garden words** per rack;
- ships every other ENABLE1 word formable from the rack as a bonus word (blocked profanity excluded);
- requires at least one full-length word so the +100 bonus is always possible;
- groups racks into easy/medium/hard tiers based on how many words they contain.

The frequency sources are attribution-only dependencies of the generated data; the game does not fetch them.

## Notes

- This is an original game. All artwork, code, and word data are original or built from public word lists; no assets from other games are used.
- The full 3–7 letter ENABLE1 dictionary is accepted, except for a small blocked-terms list used to keep the game family friendly.
- The gopher and all illustrations are inline SVG; sound effects are generated with the Web Audio API.
- No analytics, accounts, network play, or external runtime services. The page makes no network requests.
- Baloo 2 and Nunito are embedded under the SIL Open Font License; the license files are in `assets/fonts/`.
- Best score and mute state live in the browser only. Clearing site data resets them.
