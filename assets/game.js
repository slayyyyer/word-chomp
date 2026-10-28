/* ============================================================
   Word Chomp! — game logic
   Classic script, no build step. Data comes from data/puzzles.js.
   ============================================================ */

(function () {
  "use strict";

  const ROUND_SECONDS = 140; // 2:20, just like the original
  const ROUND_MS = ROUND_SECONDS * 1000;
  const POINTS_PER_LETTER = 10;
  const FULL_RACK_BONUS = 100;
  const HINT_COST = 50;
  const TIME_BONUS_PER_SECOND = 5;
  const STORAGE_BEST = "wordChomp.best.v1";
  const STORAGE_MUTED = "wordChomp.muted.v1";

  const $ = (id) => document.getElementById(id);

  const els = {
    screenHome: $("screenHome"),
    screenGame: $("screenGame"),
    playBtn: $("playBtn"),
    howBtn: $("howBtn"),
    soundToggle: $("soundToggle"),
    topBest: $("topBest"),

    roundLabel: $("roundLabel"),
    rackSizeLabel: $("rackSizeLabel"),
    timerBlock: $("timerBlock"),
    timeText: $("timeText"),
    timerFill: $("timerFill"),
    scoreNow: $("scoreNow"),
    quitBtn: $("quitBtn"),

    foundCounter: $("foundCounter"),
    trail: $("trail"),
    trailFill: $("trailFill"),
    trailMarker: $("trailMarker"),
    trailGoal: document.querySelector(".trail-goal"),
    progressFound: $("progressFound"),
    progressTotal: $("progressTotal"),

    wordTray: $("wordTray"),
    rack: $("rack"),
    fxLayer: $("fxLayer"),
    shuffleBtn: $("shuffleBtn"),
    hintBtn: $("hintBtn"),
    clearBtn: $("clearBtn"),
    submitBtn: $("submitBtn"),

    liveMessage: $("liveMessage"),
    foundList: $("foundList"),
    gardenCount: $("gardenCount"),
    speech: $("speech"),
    mascotCard: document.querySelector(".mascot-card"),
    announcer: $("announcer"),

    modalLayer: $("modalLayer"),
    modalBackdrop: $("modalBackdrop"),
    modalPanel: $("modalPanel"),
    modalClose: $("modalClose"),
    modalContent: $("modalContent"),
  };

  const rawData = window.WORD_CHOMP_PUZZLES || {};
  const PUZZLES = {
    6: Array.isArray(rawData["6"]) ? rawData["6"] : [],
    7: Array.isArray(rawData["7"]) ? rawData["7"] : [],
  };

  const state = {
    screen: "home",
    run: null,
    round: null,
    best: readNumber(STORAGE_BEST),
    muted: readBoolean(STORAGE_MUTED, false),
    timer: null,
    modal: null,
    lastFocused: null,
    closeToken: 0,
    messageTimer: null,
    speechTimer: null,
    shakeTimer: null,
    bumpTimer: null,
  };

  let speechIndex = 0;
  let bigSpeechIndex = 0;
  let oopsSpeechIndex = 0;

  /* ----------------------------------------------------------
     Small helpers
     ---------------------------------------------------------- */

  function readNumber(key) {
    try {
      const value = Number(window.localStorage.getItem(key));
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch (error) {
      return 0;
    }
  }

  function readBoolean(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      if (value === null) return fallback;
      return value === "true";
    } catch (error) {
      return fallback;
    }
  }

  function storeValue(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (error) {
      // The garden still works without a cupboard.
    }
  }

  function formatScore(value) {
    return Math.max(0, Math.round(value)).toLocaleString("en-US");
  }

  function formatTime(totalSeconds) {
    const safe = Math.max(0, Math.ceil(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function plural(count, singular, pluralForm) {
    return count === 1 ? singular : pluralForm || `${singular}s`;
  }

  function randomOf(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function announce(text) {
    if (!els.announcer) return;
    els.announcer.textContent = "";
    window.setTimeout(() => {
      els.announcer.textContent = text;
    }, 30);
  }

  function prefersReducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  /* ----------------------------------------------------------
     Sound (tiny synthesized effects, no audio files)
     ---------------------------------------------------------- */

  const Sound = (() => {
    let context = null;

    function ensureContext() {
      if (state.muted) return null;
      try {
        if (!context) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return null;
          context = new AudioContext();
        }
        if (context.state === "suspended") {
          context.resume().catch(() => {});
        }
        return context;
      } catch (error) {
        return null;
      }
    }

    function tone(frequency, delay, duration, type, gain) {
      if (state.muted) return;
      const audio = ensureContext();
      if (!audio) return;
      try {
        const start = audio.currentTime + delay;
        const oscillator = audio.createOscillator();
        const envelope = audio.createGain();
        oscillator.type = type || "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.exponentialRampToValueAtTime(
          Math.max(0.0002, gain || 0.03),
          start + 0.012
        );
        envelope.gain.exponentialRampToValueAtTime(
          0.0001,
          start + Math.max(0.03, duration)
        );
        oscillator.connect(envelope);
        envelope.connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.035);
      } catch (error) {
        // Sound is a garnish, not a requirement.
      }
    }

    function notes(list, type, gain) {
      list.forEach((frequency, index) => {
        tone(frequency, index * 0.065, 0.14, type || "sine", gain || 0.03);
      });
    }

    return {
      unlock() {
        if (!state.muted) ensureContext();
      },
      tap() {
        tone(560, 0, 0.045, "triangle", 0.017);
      },
      wrong() {
        tone(195, 0, 0.13, "square", 0.026);
        tone(147, 0.11, 0.17, "square", 0.021);
      },
      good(longWord) {
        const base = [523.25, 659.25, 783.99];
        if (longWord) base.push(1046.5);
        notes(base, "sine", longWord ? 0.038 : 0.03);
      },
      full() {
        notes([523.25, 659.25, 783.99, 1046.5, 1318.51], "triangle", 0.042);
        tone(196, 0, 0.2, "sine", 0.035);
      },
      shuffle() {
        tone(392, 0, 0.045, "triangle", 0.016);
        tone(466, 0.04, 0.045, "triangle", 0.015);
        tone(349, 0.08, 0.05, "triangle", 0.014);
      },
      hint() {
        notes([880, 1174.66, 1567.98], "sine", 0.027);
      },
      clearRound() {
        notes(
          [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98],
          "sine",
          0.038
        );
      },
      timeUp() {
        tone(392, 0, 0.2, "triangle", 0.03);
        tone(329.63, 0.19, 0.22, "triangle", 0.027);
        tone(261.63, 0.4, 0.32, "triangle", 0.028);
      },
      finish() {
        notes(
          [392, 523.25, 659.25, 783.99, 1046.5],
          "triangle",
          0.035
        );
      },
    };
  })();

  function applySoundState() {
    document.body.classList.toggle("is-muted", state.muted);
    if (els.soundToggle) {
      els.soundToggle.setAttribute("aria-pressed", String(!state.muted));
      els.soundToggle.setAttribute(
        "aria-label",
        state.muted ? "Unmute sound" : "Mute sound"
      );
      els.soundToggle.title = state.muted ? "Unmute sound" : "Mute sound";
    }
  }

  function toggleSound() {
    state.muted = !state.muted;
    storeValue(STORAGE_MUTED, state.muted);
    applySoundState();
    if (!state.muted) {
      Sound.unlock();
      Sound.tap();
    }
  }

  /* ----------------------------------------------------------
     Screens and run setup
     ---------------------------------------------------------- */

  function setScreen(name) {
    state.screen = name;
    document.body.dataset.screen = name;
    els.screenHome.hidden = name !== "home";
    els.screenGame.hidden = name !== "game";
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function updateBestDisplays() {
    if (els.topBest) els.topBest.textContent = formatScore(state.best);
  }

  function hasPlayableData() {
    return PUZZLES[6].length > 0 || PUZZLES[7].length > 0;
  }

  function showHome() {
    stopTimer();
    clearRoundTimeouts();
    closeModal({ instant: true, runOnDismiss: false, restoreFocus: false });
    state.run = null;
    state.round = null;
    state.modal = null;
    setScreen("home");
    updateBestDisplays();
    if (!hasPlayableData()) {
      els.playBtn.disabled = true;
      els.playBtn.textContent = "Word data missing";
    }
  }

  function startNewRun() {
    if (!hasPlayableData()) return;
    Sound.unlock();
    closeModal({ instant: true, runOnDismiss: false, restoreFocus: false });
    state.run = {
      round: 1,
      score: 0,
      wordsFound: 0,
      roundsCleared: 0,
      used: new Set(),
      bestAtStart: state.best,
      newBestAnnounced: false,
    };
    setScreen("game");
    startRound();
  }

  function recipeForRound(roundNumber) {
    if (roundNumber === 1) return { length: 6, tier: 0 };
    if (roundNumber === 2) return { length: 7, tier: 0 };
    if (roundNumber <= 4) return { length: 7, tier: 1 };
    return { length: 7, tier: 2 };
  }

  function pickPuzzle(length, tier) {
    if (!PUZZLES[length] || !PUZZLES[length].length) {
      const otherLength = length === 6 ? 7 : 6;
      if (!PUZZLES[otherLength] || !PUZZLES[otherLength].length) return null;
      return pickPuzzle(otherLength, 0);
    }

    let pool = PUZZLES[length].filter((puzzle) => puzzle.t === tier);
    if (!pool.length) pool = PUZZLES[length];

    const keyFor = (puzzle) => `${length}:${puzzle.l}`;
    let available = pool.filter((puzzle) => !state.run.used.has(keyFor(puzzle)));
    if (!available.length) {
      // A very long dig. Reopen this tier's garden.
      pool.forEach((puzzle) => state.run.used.delete(keyFor(puzzle)));
      available = pool;
    }

    const chosen = randomOf(available);
    state.run.used.add(keyFor(chosen));
    return chosen;
  }

  function startRound() {
    if (!state.run) return;
    closeModal({ instant: true, runOnDismiss: false, restoreFocus: false });
    stopTimer();
    clearRoundTimeouts();

    const recipe = recipeForRound(state.run.round);
    const puzzle = pickPuzzle(recipe.length, recipe.tier);
    if (!puzzle) {
      showHome();
      return;
    }
    const letters = puzzle.l.split("");
    const words = puzzle.w.split(" ").filter(Boolean);
    const bonusWords = (puzzle.b || "").split(" ").filter(Boolean);
    const rack = letters.map((letter, index) => ({
      id: index,
      letter,
    }));

    state.round = {
      number: state.run.round,
      letters,
      words,
      allWords: new Set(words),
      bonusWords: new Set(bonusWords),
      found: new Map(),
      goalsFound: 0,
      bonusFound: 0,
      bonusPoints: 0,
      rack,
      order: shuffle(rack.map((tile) => tile.id)),
      current: [],
      startScore: state.run.score,
      hintCount: 0,
      status: "playing",
      endAt: performance.now() + ROUND_MS,
      timeLeft: ROUND_MS,
      lastSecond: null,
      warned30: false,
      timeBonus: 0,
      finishSeconds: 0,
      completionTimer: null,
    };

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    els.roundLabel.textContent = `Round ${state.run.round}`;
    els.rackSizeLabel.textContent = `${letters.length} letters`;
    els.scoreNow.textContent = formatScore(state.run.score);
    els.foundCounter.textContent = `0 of ${words.length} garden words`;
    els.progressFound.textContent = "0";
    els.progressTotal.textContent = String(words.length);
    els.gardenCount.textContent = "Nothing planted yet";
    els.timeText.textContent = formatTime(ROUND_SECONDS);
    els.timerBlock.classList.remove("is-urgent");
    els.timerFill.classList.remove("is-warn", "is-low");
    els.trailGoal.textContent = "clear the garden for a time bonus";
    els.trailMarker.classList.remove("is-finished");
    setLiveMessage("");
    renderRack();
    renderTray();
    renderFound();
    updateProgress(false);
    updateHintButton();

    // Reset the timer bar without animating from an old round.
    els.timerFill.style.transition = "none";
    els.timerFill.style.width = "100%";
    window.requestAnimationFrame(() => {
      els.timerFill.style.transition = "";
    });

    say(
      state.run.round === 1
        ? "Fresh dirt! Type or tap letters to build a word."
        : randomOf([
            "A fresh patch. Let's dig.",
            "New letters, same appetite.",
            "Round's on. Find those long ones!",
            "Mmm, smells like a seven-letter word.",
          ])
    );

    startTimer();
    announce(
      `Round ${state.run.round}. ${letters.length} letters. Find as many words as you can.`
    );
  }

  function nextRound() {
    if (!state.run) return;
    closeModal({ instant: true, runOnDismiss: false, restoreFocus: false });
    state.run.round += 1;
    startRound();
  }

  /* ----------------------------------------------------------
     Timer
     ---------------------------------------------------------- */

  function clearRoundTimeouts() {
    if (state.round && state.round.completionTimer) {
      window.clearTimeout(state.round.completionTimer);
      state.round.completionTimer = null;
    }
  }

  function startTimer() {
    stopTimer();
    tick();
    state.timer = window.setInterval(tick, 100);
  }

  function stopTimer() {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function paintTimer(remainingMs) {
    const remaining = Math.max(0, remainingMs);
    const seconds = Math.ceil(remaining / 1000);
    els.timeText.textContent = formatTime(seconds);

    const ratio = Math.max(0, Math.min(1, remaining / ROUND_MS));
    els.timerFill.style.width = `${ratio * 100}%`;
    els.timerFill.classList.toggle("is-warn", seconds <= 60 && seconds > 20);
    els.timerFill.classList.toggle("is-low", seconds <= 20);
    els.timerBlock.classList.toggle("is-urgent", seconds <= 20);
  }

  function tick() {
    const round = state.round;
    if (!round || round.status !== "playing") return;

    const remaining = Math.max(0, round.endAt - performance.now());
    round.timeLeft = remaining;
    const seconds = Math.ceil(remaining / 1000);

    if (seconds !== round.lastSecond) {
      round.lastSecond = seconds;
      paintTimer(remaining);
      if (!round.warned30 && seconds <= 30 && seconds > 0) {
        round.warned30 = true;
        say("Thirty seconds! Dig deep!");
      }
    } else {
      // Keep the bar smooth between whole-second text updates.
      const ratio = Math.max(0, Math.min(1, remaining / ROUND_MS));
      els.timerFill.style.width = `${ratio * 100}%`;
    }

    if (remaining <= 0) {
      round.timeLeft = 0;
      paintTimer(0);
      endRound("time");
    }
  }

  function pauseRound() {
    const round = state.round;
    if (!round || round.status !== "playing") return;
    round.timeLeft = Math.max(0, round.endAt - performance.now());
    round.status = "paused";
    round.pausedAt = performance.now();
    stopTimer();
    paintTimer(round.timeLeft);
  }

  function resumeRound() {
    const round = state.round;
    if (!round || round.status !== "paused") return;
    const pausedFor = Math.max(0, performance.now() - round.pausedAt);
    round.endAt += pausedFor;
    round.status = "playing";
    round.pausedAt = 0;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    startTimer();
  }

  /* ----------------------------------------------------------
     Word entry
     ---------------------------------------------------------- */

  function isPlaying() {
    return (
      state.screen === "game" &&
      state.round !== null &&
      state.round.status === "playing"
    );
  }

  function addLetterByChar(character) {
    const round = state.round;
    if (!isPlaying() || !round) return;
    const lower = character.toLowerCase();
    const id = round.order.find(
      (tileId) =>
        !round.current.includes(tileId) &&
        round.rack[tileId].letter.toLowerCase() === lower
    );
    if (id === undefined) return;
    round.current.push(id);
    Sound.tap();
    renderTray();
    renderRack();
  }

  function addLetterByTile(id) {
    const round = state.round;
    if (!isPlaying() || !round) return;
    if (id < 0 || id >= round.rack.length) return;
    if (round.current.includes(id)) {
      removeLetter(id);
      return;
    }
    round.current.push(id);
    Sound.tap();
    renderTray();
    renderRack();
  }

  function removeLetter(id) {
    const round = state.round;
    if (!isPlaying() || !round) return;
    const index = round.current.indexOf(id);
    if (index === -1) return;
    round.current.splice(index, 1);
    Sound.tap();
    renderTray();
    renderRack();
  }

  function removeLastLetter() {
    const round = state.round;
    if (!isPlaying() || !round || !round.current.length) return;
    round.current.pop();
    Sound.tap();
    renderTray();
    renderRack();
  }

  function clearCurrent() {
    const round = state.round;
    if (!isPlaying() || !round || !round.current.length) return;
    round.current = [];
    Sound.tap();
    renderTray();
    renderRack();
  }

  function currentWord() {
    if (!state.round) return "";
    return state.round.current
      .map((id) => state.round.rack[id].letter)
      .join("")
      .toLowerCase();
  }

  function submitCurrent() {
    const round = state.round;
    if (!isPlaying() || !round) return;
    const word = currentWord();

    if (!word) {
      setLiveMessage("Tap a letter to start a word.", "");
      return;
    }

    if (word.length < 3) {
      Sound.wrong();
      setLiveMessage("Words need at least 3 letters.", "bad");
      shakeTray();
      say("Three letters or more, digger!");
      return;
    }

    if (round.found.has(word)) {
      Sound.wrong();
      setLiveMessage(
        `Already found ${word.toUpperCase()}.`,
        "bad"
      );
      shakeTray();
      say(randomOf(["Already planted that one.", "You found that one, pal."]));
      return;
    }

    const isGoal = round.allWords.has(word);
    const isBonus = !isGoal && round.bonusWords.has(word);
    if (!isGoal && !isBonus) {
      Sound.wrong();
      setLiveMessage(`"${word.toUpperCase()}" isn't in this garden.`, "bad");
      shakeTray();
      say(randomOf(oopsSpeech));
      return;
    }

    const isFullRack = word.length === round.letters.length;
    const points = word.length * POINTS_PER_LETTER;
    const bonus = isFullRack ? FULL_RACK_BONUS : 0;
    const total = points + bonus;

    round.found.set(word, {
      points: total,
      basePoints: points,
      bonus,
      hinted: false,
      full: isFullRack,
      bonusWord: isBonus,
    });
    state.run.score += total;
    state.run.wordsFound += 1;
    if (isBonus) {
      round.bonusFound += 1;
      round.bonusPoints += total;
    } else {
      round.goalsFound += 1;
    }
    round.current = [];

    renderTray();
    renderRack();
    renderFound(word);
    updateScore(true);
    updateProgress(true);
    updateHintButton();

    if (isBonus) {
      if (isFullRack) {
        setLiveMessage(
          `${word.toUpperCase()}! +${total} — bonus word + all-letter Chomp bonus`,
          "gold"
        );
        floatPoints(`+${total} CHOMP!`, true);
        Sound.full();
        burstConfetti(48);
        say("WHOA! A full-rack bonus word!");
      } else {
        setLiveMessage(`${word.toUpperCase()} +${total} — bonus word`, "gold");
        floatPoints(`+${total}`, true);
        Sound.good(word.length >= 6);
        say(randomOf(bonusSpeech));
      }
    } else if (isFullRack) {
      setLiveMessage(
        `${word.toUpperCase()}! +${total} — all-letter Chomp bonus`,
        "gold"
      );
      floatPoints(`+${total} CHOMP!`, true);
      Sound.full();
      burstConfetti(48);
      say("WHOA! You used every single letter!");
    } else {
      setLiveMessage(`${word.toUpperCase()} +${total}`, "");
      floatPoints(`+${total}`, false);
      Sound.good(word.length >= 6);
      if (word.length >= 6) {
        say(randomOf(bigSpeech));
      } else {
        say(randomOf(normalSpeech));
      }
    }

    checkRoundComplete();
  }

  function checkRoundComplete() {
    const round = state.round;
    if (!round || round.status !== "playing") return;
    if (round.goalsFound < round.allWords.size) return;

    round.status = "clearing";
    round.timeLeft = Math.max(0, round.endAt - performance.now());
    stopTimer();
    paintTimer(round.timeLeft);
    els.trailGoal.textContent = "garden cleared!";
    els.trailMarker.classList.add("is-finished");
    setLiveMessage("Every garden word found!", "gold");
    say("You cleaned out the whole garden!");
    Sound.clearRound();
    burstConfetti(80);
    updateHintButton();

    round.completionTimer = window.setTimeout(() => {
      round.completionTimer = null;
      endRound("cleared");
    }, 850);
  }

  /* ----------------------------------------------------------
     Hints
     ---------------------------------------------------------- */

  function missingWords() {
    if (!state.round) return [];
    return state.round.words.filter((word) => !state.round.found.has(word));
  }

  function updateHintButton() {
    if (!els.hintBtn) return;
    const round = state.round;
    const canUse =
      !!round &&
      round.status === "playing" &&
      missingWords().length > 0;
    els.hintBtn.disabled = !canUse;
    els.hintBtn.title = canUse
      ? `Dig up one missing word (costs ${HINT_COST} points)`
      : "No words left to dig up";
  }

  function useHint() {
    const round = state.round;
    if (!isPlaying() || !round) return;

    const missing = missingWords();
    if (!missing.length) {
      updateHintButton();
      return;
    }

    // Keep the marquee seven-letter word for the player if possible.
    const notTheLongOne = missing.filter(
      (word) => word.length < round.letters.length
    );
    const hintPool = notTheLongOne.length ? notTheLongOne : missing;
    hintPool.sort(
      (a, b) => a.length - b.length || a.localeCompare(b)
    );
    const shortlist = hintPool.slice(
      0,
      Math.max(1, Math.ceil(hintPool.length * 0.6))
    );
    const word = randomOf(shortlist);

    const cost = Math.min(HINT_COST, state.run.score);
    state.run.score -= cost;
    round.hintCount += 1;
    round.found.set(word, {
      points: 0,
      basePoints: 0,
      bonus: 0,
      hinted: true,
      full: false,
      bonusWord: false,
    });
    state.run.wordsFound += 1;
    round.goalsFound += 1;
    round.current = [];

    renderTray();
    renderRack();
    renderFound(word);
    updateScore(true);
    updateProgress(true);
    updateHintButton();

    const costText = cost > 0 ? ` −${cost}` : "";
    setLiveMessage(`Gus dug up ${word.toUpperCase()}${costText}.`, "gold");
    Sound.hint();
    say(randomOf(hintSpeech));
    checkRoundComplete();
  }

  /* ----------------------------------------------------------
     Rendering
     ---------------------------------------------------------- */

  function renderRack() {
    const round = state.round;
    if (!round) {
      els.rack.innerHTML = "";
      return;
    }
    els.rack.innerHTML = "";
    round.order.forEach((id, index) => {
      const tile = round.rack[id];
      const used = round.current.includes(id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tile${used ? " is-used" : ""}`;
      button.dataset.id = String(id);
      button.style.setProperty("--i", String(index));
      button.textContent = tile.letter.toUpperCase();
      button.setAttribute(
        "aria-label",
        `Letter ${tile.letter.toUpperCase()}${
          used ? ", in your word. Activate to put it back" : ""
        }`
      );
      button.setAttribute("aria-pressed", String(used));
      els.rack.appendChild(button);
    });
  }

  function renderTray() {
    const round = state.round;
    els.wordTray.innerHTML = "";
    if (!round || !round.current.length) {
      const placeholder = document.createElement("span");
      placeholder.className = "tray-placeholder";
      placeholder.innerHTML =
        "Tap tiles or type a word&hellip; <span class=\"tray-caret\" aria-hidden=\"true\"></span>";
      els.wordTray.appendChild(placeholder);
      return;
    }

    round.current.forEach((id) => {
      const tile = round.rack[id];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tray-tile";
      button.dataset.id = String(id);
      button.textContent = tile.letter.toUpperCase();
      button.setAttribute(
        "aria-label",
        `Remove letter ${tile.letter.toUpperCase()} from the word`
      );
      els.wordTray.appendChild(button);
    });
  }

  function renderFound(newWord) {
    const round = state.round;
    if (!round) {
      els.foundList.innerHTML = "";
      return;
    }

    const groups = new Map();
    for (const [word, details] of round.found.entries()) {
      const length = word.length;
      if (!groups.has(length)) groups.set(length, []);
      groups.get(length).push({ word, details });
    }

    if (!groups.size) {
      els.foundList.innerHTML = `
        <div class="empty-garden">
          <svg viewBox="0 0 64 64" aria-hidden="true"><use href="#sprout"></use></svg>
          <div>
            <strong>Your words will sprout here.</strong>
            <span>Make a word of 3 letters or more.</span>
          </div>
        </div>
      `;
      els.gardenCount.textContent = "Nothing planted yet";
      return;
    }

    const lengths = [...groups.keys()].sort((a, b) => b - a);
    const html = lengths
      .map((length) => {
        const entries = groups
          .get(length)
          .sort(
            (a, b) =>
              Number(a.details.bonusWord) - Number(b.details.bonusWord) ||
              a.word.localeCompare(b.word)
          );
        const chips = entries
          .map(({ word, details }) => {
            const classes = ["chip"];
            if (details.hinted) classes.push("is-hinted");
            if (details.bonusWord) classes.push("is-bonus-word");
            if (details.full) classes.push("is-chomp");
            const points = details.hinted ? "hint" : `+${details.points}`;
            const title = details.hinted
              ? "Revealed with a hint"
              : details.bonusWord
                ? `Bonus word — ${details.points} points${
                    details.full
                      ? ` including the +${FULL_RACK_BONUS} all-letter bonus`
                      : ""
                  }; not needed to clear the garden`
                : details.full
                  ? `Includes the +${FULL_RACK_BONUS} all-letter bonus`
                  : `${details.points} points`;
            return `<span class="${classes.join(" ")}" data-word="${word}" title="${title}"><span>${word}</span><span class="chip-points">${points}</span></span>`;
          })
          .join("");
        return `<div class="found-group"><span class="found-len" aria-hidden="true">${length}</span><div class="chips">${chips}</div></div>`;
      })
      .join("");

    els.foundList.innerHTML = html;
    const count = round.found.size;
    els.gardenCount.textContent = round.bonusFound
      ? `${round.goalsFound} garden ${plural(
          round.goalsFound,
          "word"
        )} · ${round.bonusFound} bonus`
      : `${count} ${plural(count, "word")} in the garden`;

    if (newWord) {
      const chip = els.foundList.querySelector(
        `[data-word="${newWord}"]`
      );
      if (chip) {
        chip.classList.add("is-new");
        chip.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function updateScore(animate) {
    els.scoreNow.textContent = formatScore(state.run ? state.run.score : 0);
    if (!animate) return;
    window.clearTimeout(state.bumpTimer);
    els.scoreNow.classList.remove("is-bumping");
    void els.scoreNow.offsetWidth;
    els.scoreNow.classList.add("is-bumping");
    state.bumpTimer = window.setTimeout(() => {
      els.scoreNow.classList.remove("is-bumping");
    }, 320);
  }

  function updateProgress(animateMarker) {
    const round = state.round;
    if (!round) return;
    const total = round.words.length;
    const found = round.goalsFound;
    const percent = total ? (found / total) * 100 : 0;
    const trackLeft = 2.2;
    const trackSpan = 95.6;
    const position = trackLeft + (percent / 100) * trackSpan;

    els.trailFill.style.width = `${(percent / 100) * trackSpan}%`;
    els.trailMarker.style.left = `${position}%`;
    els.progressFound.textContent = String(found);
    els.progressTotal.textContent = String(total);
    const bonusText = round.bonusFound
      ? ` · ${round.bonusFound} bonus`
      : "";
    els.foundCounter.textContent = `${found} of ${total} garden words${bonusText}`;
    els.trail.setAttribute("aria-valuemax", String(total));
    els.trail.setAttribute("aria-valuenow", String(found));
    els.trail.setAttribute(
      "aria-valuetext",
      `${found} of ${total} garden words found${
        round.bonusFound
          ? `, plus ${round.bonusFound} ${plural(
              round.bonusFound,
              "bonus word"
            )}`
          : ""
      }`
    );

    if (percent >= 100) {
      els.trailGoal.textContent = "garden cleared!";
      els.trailMarker.classList.add("is-finished");
    }

    if (animateMarker) {
      els.trailMarker.classList.remove("is-hopping");
      void els.trailMarker.offsetWidth;
      els.trailMarker.classList.add("is-hopping");
      window.setTimeout(() => {
        els.trailMarker.classList.remove("is-hopping");
      }, 380);
    }
  }

  function setLiveMessage(text, tone) {
    window.clearTimeout(state.messageTimer);
    els.liveMessage.textContent = text || "";
    els.liveMessage.className = "live-message";
    if (tone === "bad") els.liveMessage.classList.add("is-bad");
    if (tone === "gold") els.liveMessage.classList.add("is-gold");
    if (text) {
      state.messageTimer = window.setTimeout(() => {
        els.liveMessage.textContent = "";
        els.liveMessage.className = "live-message";
      }, 2800);
    }
  }

  function shakeTray() {
    const tray = els.wordTray.closest(".tray-wrap");
    if (!tray) return;
    window.clearTimeout(state.shakeTimer);
    tray.classList.remove("is-shaking");
    void tray.offsetWidth;
    tray.classList.add("is-shaking");
    state.shakeTimer = window.setTimeout(() => {
      tray.classList.remove("is-shaking");
    }, 380);
  }

  function floatPoints(text, isBonus) {
    const span = document.createElement("span");
    span.className = `float-score${isBonus ? " is-bonus" : ""}`;
    span.textContent = text;
    els.fxLayer.appendChild(span);
    window.setTimeout(() => span.remove(), 1050);
  }

  function say(text) {
    if (!els.speech) return;
    window.clearTimeout(state.speechTimer);
    els.speech.textContent = text;
    els.speech.classList.remove("is-popping");
    if (els.mascotCard) els.mascotCard.classList.remove("is-talking");
    void els.speech.offsetWidth;
    els.speech.classList.add("is-popping");
    if (els.mascotCard) els.mascotCard.classList.add("is-talking");
    state.speechTimer = window.setTimeout(() => {
      els.speech.classList.remove("is-popping");
      if (els.mascotCard) els.mascotCard.classList.remove("is-talking");
    }, 520);
  }

  /* Speech bank */
  const normalSpeech = [
    "Nice one! Keep diggin'.",
    "That's a keeper.",
    "Ooh, tasty word.",
    "Planted! Keep 'em coming.",
    "Look at you go!",
    "Good word. Now find another.",
  ];
  const bigSpeech = [
    "Now THAT'S a word!",
    "Big word energy!",
    "Whoa, look at the size of that one!",
    "Save some words for the rest of us!",
  ];
  const bonusSpeech = [
    "Bonus word! Not in the garden plan, but it still pays.",
    "Ooh, an extra find. Gus approves.",
    "That one's a bonus. Nice dig!",
    "Bonus word! The dirt keeps giving.",
  ];
  const oopsSpeech = [
    "Nope. Try another combo.",
    "Not quite, digger.",
    "That one's still buried.",
    "Hmm, the garden says no.",
  ];
  const hintSpeech = [
    "I dug one up for ya!",
    "Try this one on for size.",
    "Fresh out of the dirt!",
    "Found one hiding over here.",
  ];

  /* ----------------------------------------------------------
     End of round / run
     ---------------------------------------------------------- */

  function endRound(reason) {
    const round = state.round;
    if (!round) return;
    if (!["playing", "clearing"].includes(round.status)) return;
    round.status = "ending";
    stopTimer();
    clearRoundTimeouts();

    if (reason === "time") {
      round.timeLeft = 0;
      paintTimer(0);
    } else {
      paintTimer(round.timeLeft);
    }

    let timeBonus = 0;
    if (reason === "cleared") {
      round.finishSeconds = Math.ceil(round.timeLeft / 1000);
      timeBonus = Math.max(0, round.finishSeconds) * TIME_BONUS_PER_SECOND;
      round.timeBonus = timeBonus;
      state.run.score += timeBonus;
      state.run.roundsCleared += 1;
    }

    updateScore(true);
    updateProgress(false);
    updateHintButton();

    const beatPreviousBest = state.run.score > state.run.bestAtStart;
    const showNewBest =
      beatPreviousBest && !state.run.newBestAnnounced;
    if (showNewBest) state.run.newBestAnnounced = true;
    if (state.run.score > state.best) {
      state.best = state.run.score;
      storeValue(STORAGE_BEST, state.best);
      updateBestDisplays();
    }

    if (reason === "cleared") {
      say("Garden cleared! That's how it's done.");
    } else {
      Sound.timeUp();
      say(
        round.goalsFound === 0
          ? round.bonusFound
            ? "No garden words, but those bonus finds still count."
            : "Oof, the garden got away. Let's dig again."
          : "Time's up! Let's see what we missed."
      );
    }

    const missed = round.words
      .filter((word) => !round.found.has(word))
      .sort(
        (a, b) =>
          b.length - a.length ||
          a.localeCompare(b)
      );

    const roundScore = state.run.score - round.startScore;
    const roundScoreText =
      roundScore < 0
        ? `−${formatScore(Math.abs(roundScore))}`
        : `+${formatScore(roundScore)}`;

    const stats = `
      <div class="summary-stats">
        <div class="summary-stat">
          <b>${round.goalsFound} / ${round.words.length}</b>
          <span>garden words</span>
        </div>
        <div class="summary-stat">
          <b>${roundScoreText}</b>
          <span>this round</span>
        </div>
        <div class="summary-stat ${timeBonus > 0 ? "is-bonus" : "is-good"}">
          <b>${formatScore(state.best)}</b>
          <span>best haul</span>
        </div>
      </div>
    `;

    const summaryTitle =
      reason === "cleared"
        ? "Garden cleared!"
        : round.goalsFound === 0
          ? "The gophers got away!"
          : "Time's up!";

    const spareTime =
      round.finishSeconds > 0
        ? `with ${round.finishSeconds} ${plural(
            round.finishSeconds,
            "second"
          )} to spare`
        : "right at the buzzer";
    const bonusSentence = round.bonusFound
      ? ` ${round.bonusFound} bonus ${plural(
          round.bonusFound,
          "word"
        )} also scored.`
      : "";
    const summarySub =
      reason === "cleared"
        ? `You found all ${round.words.length} garden words ${spareTime}. Time bonus: +${formatScore(timeBonus)}.${bonusSentence}`
        : `You found ${round.goalsFound} of ${round.words.length} garden words.${bonusSentence} The rest are still in the dirt.`;

    const missedMarkup = missed.length
      ? missedGroupsMarkup(missed)
      : `
        <div class="cleared-note">
          <svg viewBox="0 0 64 64" aria-hidden="true"><use href="#sprout"></use></svg>
          <div><b>Not a single garden word left behind.</b> Gus is doing a little dance on the dirt pile.</div>
        </div>
      `;

    const newBestMarkup = showNewBest
      ? `<span class="new-best">★ New personal best!</span>`
      : "";

    const clearedKicker =
      reason === "cleared"
        ? "Every garden word found"
        : `Round ${round.number} complete`;

    const content = `
      <div class="summary-head">
        <p class="modal-kicker">${clearedKicker}</p>
        <h2 id="modalTitle">${summaryTitle}</h2>
        <p class="summary-sub">${summarySub}</p>
      </div>
      ${newBestMarkup}
      ${stats}
      <div class="missed-block">
        <div class="missed-title">
          <h3>${missed.length ? (missed.length === 1 ? "Word you missed" : "Words you missed") : "A clean garden"}</h3>
          <span>${missed.length ? `${missed.length} ${plural(missed.length, "word")}` : "all clear"}</span>
        </div>
        ${missedMarkup}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" data-action="end-run">End run</button>
        <button class="btn btn-primary" type="button" data-action="next-round" data-autofocus>Next garden</button>
      </div>
    `;

    openModal({
      content,
      dismissible: false,
      onDismiss: null,
      className: "summary-modal",
    });
  }

  function missedGroupsMarkup(words) {
    const byLength = new Map();
    for (const word of words) {
      if (!byLength.has(word.length)) byLength.set(word.length, []);
      byLength.get(word.length).push(word);
    }
    const lengths = [...byLength.keys()].sort((a, b) => b - a);
    const groups = lengths
      .map((length) => {
        const chips = byLength
          .get(length)
          .sort()
          .map((word) => `<span class="chip is-missed">${word}</span>`)
          .join("");
        return `<div class="missed-group"><span class="missed-len" aria-hidden="true">${length}</span><div class="chips">${chips}</div></div>`;
      })
      .join("");
    return `<div class="missed-groups">${groups}</div>`;
  }

  function finishRun() {
    const run = state.run;
    stopTimer();
    clearRoundTimeouts();
    closeModal({ instant: true, runOnDismiss: false, restoreFocus: false });

    if (!run) {
      showHome();
      return;
    }

    const isNewBest = run.score > run.bestAtStart;
    if (run.score > state.best) {
      state.best = run.score;
      storeValue(STORAGE_BEST, state.best);
      updateBestDisplays();
    }

    state.screen = "end";
    state.round = null;
    Sound.finish();

    const bestMarkup = isNewBest
      ? `<span class="new-best">★ New personal best!</span>`
      : "";
    const bestLine = isNewBest
      ? "The garden gate is open whenever you're ready for another dig."
      : `Your best haul is ${formatScore(
          state.best
        )}. The worms are getting nervous.`;

    const content = `
      <div class="finish-hero">
        <p class="finish-kicker">That's a wrap</p>
        <h2 id="modalTitle" class="finish-title">Nice diggin'!</h2>
        <p class="finish-number">${formatScore(run.score)}</p>
        <p class="finish-label">points this run</p>
      </div>
      ${bestMarkup}
      <div class="finish-stats">
        <div class="summary-stat">
          <b>${run.roundsCleared}</b>
          <span>${plural(run.roundsCleared, "garden")} cleared</span>
        </div>
        <div class="summary-stat">
          <b>${run.wordsFound}</b>
          <span>${plural(run.wordsFound, "word")} found</span>
        </div>
        <div class="summary-stat is-good">
          <b>${formatScore(state.best)}</b>
          <span>best haul</span>
        </div>
      </div>
      <p class="finish-note">${bestLine}</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" type="button" data-action="go-home">Main menu</button>
        <button class="btn btn-primary" type="button" data-action="play-again" data-autofocus>Dig again</button>
      </div>
    `;

    openModal({
      content,
      dismissible: false,
      onDismiss: null,
      className: "finish-modal",
    });

    if (isNewBest) burstConfetti(65);
  }

  /* ----------------------------------------------------------
     Modals
     ---------------------------------------------------------- */

  function openModal({ content, dismissible, onDismiss, className }) {
    state.closeToken += 1;
    if (!state.modal) {
      state.lastFocused =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }

    state.modal = {
      dismissible: Boolean(dismissible),
      onDismiss: onDismiss || null,
    };

    els.modalContent.innerHTML = content;
    els.modalPanel.className = `modal${className ? ` ${className}` : ""}`;
    els.modalClose.hidden = !dismissible;
    els.modalLayer.hidden = false;
    els.modalLayer.classList.remove("is-open");
    els.modalPanel.scrollTop = 0;

    // Lay the hidden state out first, then reveal immediately. This stays
    // reliable even in a background/occluded tab where rAF is suspended.
    void els.modalLayer.offsetWidth;
    els.modalLayer.classList.add("is-open");
    document.body.classList.add("modal-open");

    const focusTarget =
      els.modalContent.querySelector("[data-autofocus]") ||
      els.modalContent.querySelector("button:not([disabled])") ||
      (!els.modalClose.hidden ? els.modalClose : null);
    if (focusTarget) {
      focusTarget.focus({ preventScroll: true });
    }
  }

  function closeModal({
    instant = false,
    runOnDismiss = false,
    restoreFocus = true,
  } = {}) {
    const modal = state.modal;
    if (!modal) return;
    state.modal = null;
    state.closeToken += 1;
    const token = state.closeToken;

    els.modalLayer.classList.remove("is-open");
    document.body.classList.remove("modal-open");

    const finishClose = () => {
      if (token !== state.closeToken || state.modal) return;
      els.modalLayer.hidden = true;
      els.modalContent.innerHTML = "";
      els.modalPanel.className = "modal";
    };

    if (instant) {
      finishClose();
    } else {
      window.setTimeout(finishClose, 230);
    }

    if (restoreFocus) {
      const previous = state.lastFocused;
      if (previous && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
      state.lastFocused = null;
    }

    if (runOnDismiss && modal.onDismiss) {
      modal.onDismiss();
    }
  }

  function dismissModal() {
    if (!state.modal || !state.modal.dismissible) return;
    const modal = state.modal;
    closeModal({ runOnDismiss: false, restoreFocus: true });
    if (modal.onDismiss) modal.onDismiss();
  }

  function openHowTo() {
    const content = `
      <p class="modal-kicker">Gus's field guide</p>
      <h2 id="modalTitle">How to play</h2>
      <p class="modal-lede">Unscramble the rack and score as many words as you can in two minutes and twenty seconds. Every valid word counts; the listed garden words fill the trail, and clearing them all ends the round early with a time bonus.</p>
      <ol class="rule-list">
        <li class="rule"><span class="rule-num">1</span><div><b>Make a word.</b> Tap letter tiles or type on your keyboard. Every tile can be used once per word.</div></li>
        <li class="rule"><span class="rule-num">2</span><div><b>Plant it.</b> Press <b>Enter</b> or hit <b>Plant word</b>. Every valid 3–7 letter word in the dictionary is accepted.</div></li>
        <li class="rule"><span class="rule-num">3</span><div><b>Dig deeper.</b> Longer words score more. Use every tile in the rack for a <b>+100 Chomp bonus</b>. Valid words outside the garden list are bonus words — they score but don't fill the trail.</div></li>
        <li class="rule"><span class="rule-num">4</span><div><b>Clear the garden.</b> The trail tracks the listed garden words. Find them all before time runs out for a bonus of 5 points per leftover second.</div></li>
        <li class="rule"><span class="rule-num">5</span><div><b>Stuck?</b> Shuffle is free. A hint costs <b>50 points</b> and digs up one missing word.</div></li>
      </ol>
      <div class="score-table" aria-label="Word scores">
        ${[3, 4, 5, 6, 7]
          .map(
            (length) =>
              `<div class="score-cell"><b>${length}</b><span>${length * POINTS_PER_LETTER} pts</span></div>`
          )
          .join("")}
      </div>
      <div class="rule-callout">
        <svg viewBox="0 0 64 64" aria-hidden="true"><use href="#sprout"></use></svg>
        <div><b>The fine print:</b> garden words are curated everyday English; every other valid 3–7 letter word is a bonus word. Offensive terms are excluded. Tap a letter already in your word to put it back, or click a used tile on the rack. Sound can be muted up top.</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" type="button" data-action="close-modal" data-autofocus>Let's dig</button>
      </div>
    `;
    openModal({ content, dismissible: true, onDismiss: null });
  }

  function openQuitDialog() {
    if (!isPlaying()) return;
    pauseRound();
    const content = `
      <p class="modal-kicker">Round ${state.run.round}</p>
      <h2 id="modalTitle">Hang up the shovel?</h2>
      <p class="modal-lede">Your score is safely in the wheelbarrow. Ending the run saves your best haul and takes you back to the garden gate.</p>
      <div class="confirm-score">
        <span>Current haul</span>
        <b>${formatScore(state.run.score)}</b>
      </div>
      <div class="modal-actions">
        <button class="btn btn-hint" type="button" data-action="quit-confirm">End run</button>
        <button class="btn btn-primary" type="button" data-action="close-modal" data-autofocus>Keep diggin'</button>
      </div>
    `;
    openModal({
      content,
      dismissible: true,
      onDismiss: resumeRound,
    });
  }

  /* ----------------------------------------------------------
     Confetti
     ---------------------------------------------------------- */

  function burstConfetti(count) {
    if (prefersReducedMotion()) return;
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    const colors = [
      "#ffd23f",
      "#ff8a3d",
      "#7ed957",
      "#5cc8f2",
      "#f77fbe",
      "#fff3b0",
    ];
    const amount = Math.min(110, Math.max(0, count || 50));
    for (let index = 0; index < amount; index += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[index % colors.length];
      piece.style.width = `${6 + Math.random() * 7}px`;
      piece.style.height = `${8 + Math.random() * 10}px`;
      piece.style.setProperty("--dx", `${(Math.random() - 0.5) * 300}px`);
      piece.style.setProperty("--rot", `${Math.random() * 900 - 450}deg`);
      piece.style.setProperty("--dur", `${1.8 + Math.random() * 1.6}s`);
      piece.style.setProperty("--delay", `${Math.random() * 0.35}s`);
      if (Math.random() < 0.28) piece.style.borderRadius = "50%";
      layer.appendChild(piece);
    }
    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), 3900);
  }

  /* ----------------------------------------------------------
     Keyboard and pointer behavior
     ---------------------------------------------------------- */

  function trapModalFocus(event) {
    const focusables = [
      ...els.modalPanel.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ),
    ].filter((element) => element.offsetParent !== null);

    if (!focusables.length) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleKeydown(event) {
    if (state.modal) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissModal();
        return;
      }
      if (event.key === "Tab") {
        trapModalFocus(event);
      }
      return;
    }

    if (!isPlaying()) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return;
    }

    if (/^[a-zA-Z]$/.test(event.key)) {
      event.preventDefault();
      addLetterByChar(event.key);
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      removeLastLetter();
      return;
    }

    if (event.key === "Enter") {
      const active = document.activeElement;
      if (
        active &&
        active !== document.body &&
        active instanceof HTMLElement &&
        active.closest("button, a, input, select, textarea")
      ) {
        return;
      }
      event.preventDefault();
      submitCurrent();
      return;
    }

    if (event.key === " ") {
      const active = document.activeElement;
      if (
        active &&
        active !== document.body &&
        active instanceof HTMLElement &&
        active.closest("button, a, input, select, textarea")
      ) {
        return;
      }
      event.preventDefault();
      shuffleRack();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      clearCurrent();
    }
  }

  function shuffleRack() {
    const round = state.round;
    if (!isPlaying() || !round) return;
    round.order = shuffle(round.order);
    renderRack();
    els.rack.classList.remove("is-shuffling");
    void els.rack.offsetWidth;
    els.rack.classList.add("is-shuffling");
    window.setTimeout(() => els.rack.classList.remove("is-shuffling"), 520);
    Sound.shuffle();
  }

  function blurControlAfterPointer(event) {
    if (event.detail <= 0) return;
    const button = event.target.closest("button");
    if (!button || button.closest("#modalLayer")) return;
    window.setTimeout(() => {
      if (document.activeElement === button) button.blur();
    }, 0);
  }

  /* ----------------------------------------------------------
     Event wiring
     ---------------------------------------------------------- */

  function wireEvents() {
    els.playBtn.addEventListener("click", () => {
      Sound.unlock();
      startNewRun();
    });

    els.howBtn.addEventListener("click", () => {
      openHowTo();
    });

    els.soundToggle.addEventListener("click", () => {
      toggleSound();
    });

    els.quitBtn.addEventListener("click", () => {
      openQuitDialog();
    });

    els.rack.addEventListener("click", (event) => {
      const button = event.target.closest(".tile");
      if (!button) return;
      addLetterByTile(Number(button.dataset.id));
    });

    els.wordTray.addEventListener("click", (event) => {
      const button = event.target.closest(".tray-tile");
      if (!button) return;
      removeLetter(Number(button.dataset.id));
    });

    els.shuffleBtn.addEventListener("click", shuffleRack);
    els.clearBtn.addEventListener("click", clearCurrent);
    els.submitBtn.addEventListener("click", submitCurrent);
    els.hintBtn.addEventListener("click", useHint);

    els.modalClose.addEventListener("click", () => {
      dismissModal();
    });

    els.modalBackdrop.addEventListener("click", () => {
      dismissModal();
    });

    els.modalContent.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const action = button.dataset.action;

      if (action === "close-modal") {
        dismissModal();
        return;
      }

      if (action === "quit-confirm") {
        closeModal({ instant: true, runOnDismiss: false, restoreFocus: false });
        finishRun();
        return;
      }

      if (action === "next-round") {
        nextRound();
        return;
      }

      if (action === "end-run") {
        closeModal({ instant: true, runOnDismiss: false, restoreFocus: false });
        finishRun();
        return;
      }

      if (action === "play-again") {
        closeModal({ instant: true, runOnDismiss: false, restoreFocus: false });
        startNewRun();
        return;
      }

      if (action === "go-home") {
        closeModal({ instant: true, runOnDismiss: false, restoreFocus: false });
        showHome();
      }
    });

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", blurControlAfterPointer);
  }

  function init() {
    applySoundState();
    updateBestDisplays();
    wireEvents();
    showHome();
    if (!hasPlayableData()) {
      els.playBtn.disabled = true;
      els.playBtn.textContent = "Word data missing";
      setLiveMessage(
        "Puzzle data is missing. Run the data builder and reload.",
        "bad"
      );
    }
  }

  init();
})();
