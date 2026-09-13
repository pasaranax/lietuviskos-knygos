(function () {
  var params = new URLSearchParams(window.location.search);
  var bookId = params.get("book") || "jokiu-orchideju";
  var storagePrefix = "frankReader." + bookId + ".";
  var state = {
    book: null,
    activePhrase: null,
    activeData: null,
    tooltipPinned: false,
    tooltipTimer: null,
    chapterTimelines: {},
    audioChapterId: null,
    readingPhrase: null,
    pendingSeek: null,
    scrollFrame: null,
    scrollTrack: null,
    scrollLastTime: null,
    scrollPosition: 0,
    scrollVelocity: 0,
    totalParagraphs: 0,
    fontSize: readStore("fontSize", "23"),
    fontFamily: readStore("fontFamily", "serif"),
    theme: readStore("theme", "light"),
    saveTimer: null,
    restored: false
  };

  var content = document.getElementById("content");
  var topbar = document.getElementById("topbar");
  var progressText = document.getElementById("progressText");
  var chapterProgressText = document.getElementById("chapterProgressText");
  var chapterCountText = document.getElementById("chapterCountText");
  var chapterSelect = document.getElementById("chapterSelect");
  var themeButton = document.getElementById("themeButton");
  var fontDownButton = document.getElementById("fontDownButton");
  var fontUpButton = document.getElementById("fontUpButton");
  var familyButton = document.getElementById("familyButton");
  var tooltip = document.getElementById("tooltip");
  var tooltipTranslation = document.getElementById("tooltipTranslation");
  var tooltipNote = document.getElementById("tooltipNote");
  var tooltipAudioButton = document.getElementById("tooltipAudioButton");
  var tooltipAudioError = document.getElementById("tooltipAudioError");
  var phraseAudio = document.getElementById("phraseAudio");
  var chapterAudio = document.getElementById("chapterAudio");
  var chapterPlayButton = document.getElementById("chapterPlayButton");
  var chapterAudioError = document.getElementById("chapterAudioError");

  state.fontSize = normalizeFontSize(parseInt(state.fontSize, 10));
  state.fontFamily = state.fontFamily === "sans" ? "sans" : "serif";
  state.theme = state.theme === "dark" ? "dark" : "light";

  applySettings();
  bindStaticEvents();
  loadBook();

  function readStore(key, fallback) {
    try {
      var value = window.localStorage.getItem(storagePrefix + key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      window.localStorage.setItem(storagePrefix + key, String(value));
    } catch (error) {
    }
  }

  function normalizeFontSize(value) {
    if (Number.isNaN(value)) return 23;
    return Math.max(18, Math.min(32, value));
  }

  function loadBook() {
    fetch("books/" + encodeURIComponent(bookId) + ".json", { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("book load failed");
        return response.json();
      })
      .then(function (book) {
        state.book = book;
        document.title = book.title;
        renderBook(book);
        restorePosition();
        updateProgressAndChapter();
        loadChapterTimelines();
      })
      .catch(function () {
        content.innerHTML = "";
        var error = document.createElement("p");
        error.className = "load-error";
        error.textContent = "Nepavyko įkelti knygos.";
        content.append(error);
      });
  }

  function renderBook(book) {
    content.innerHTML = "";
    chapterSelect.innerHTML = "";

    var textWrap = document.createElement("section");
    textWrap.className = "text " + state.fontFamily;
    textWrap.id = "readerText";

    book.chapters.forEach(function (chapter, chapterIndex) {
      var chapterTitle = chapter.title || ("Skyrius " + (chapterIndex + 1));
      var option = document.createElement("option");
      option.value = chapter.id;
      option.textContent = chapter.title ? (chapterIndex + 1) + ". " + chapter.title : chapterTitle;
      chapterSelect.append(option);

      var title = document.createElement("div");
      title.className = "chapter-title";
      title.id = chapter.id;
      title.dataset.chapterTitle = chapterTitle;
      title.textContent = chapter.label || chapterTitle;
      textWrap.append(title);

      chapter.blocks.forEach(function (block, blockIndex) {
        var paragraph = document.createElement("p");
        var paragraphIndex = textWrap.querySelectorAll(".reader-paragraph").length;
        paragraph.id = makeParagraphId(chapter, chapterIndex, blockIndex);
        paragraph.classList.add("reader-paragraph");
        paragraph.dataset.paragraphIndex = String(paragraphIndex);
        if (block.type === "dialogue") paragraph.classList.add("dialogue");
        block.items.forEach(function (item, itemIndex) {
          if (itemIndex > 0) paragraph.append(document.createTextNode(" "));
          var phrase = renderItem(item);
          if (phrase.nodeType === 1) phrase.dataset.chapterId = chapter.id;
          paragraph.append(phrase);
        });
        textWrap.append(paragraph);
      });
    });

    content.append(textWrap);
    state.totalParagraphs = textWrap.querySelectorAll(".reader-paragraph").length;
    applySettings();
  }

  function renderItem(item) {
    if (!hasTooltip(item)) return document.createTextNode(displayText(item.text));
    return renderPhrase(item);
  }

  function renderPhrase(item) {
    var span = document.createElement("span");
    span.className = "phrase";
    span.tabIndex = 0;
    span.textContent = displayText(item.text);
    span._phraseData = item;
    return span;
  }

  function displayText(value) {
    return String(value || "").normalize("NFC");
  }

  function makeParagraphId(chapter, chapterIndex, blockIndex) {
    var chapterId = chapter.id || ("chapter-" + (chapterIndex + 1));
    return String(chapterId).replace(/[^a-zA-Z0-9_-]/g, "-") + "-p-" + blockIndex;
  }

  function hasTooltip(item) {
    if (!item) return false;
    if (/^[\s\p{P}*]+$/u.test(String(item.text || ""))) return false;
    return Boolean(String(item.translation || "").trim() || String(item.note || "").trim());
  }

  function bindStaticEvents() {
    themeButton.addEventListener("click", function () {
      state.theme = state.theme === "dark" ? "light" : "dark";
      writeStore("theme", state.theme);
      applySettings();
    });

    fontDownButton.addEventListener("click", function () {
      state.fontSize = normalizeFontSize(state.fontSize - 1);
      writeStore("fontSize", state.fontSize);
      applySettings();
      positionTooltip();
    });

    fontUpButton.addEventListener("click", function () {
      state.fontSize = normalizeFontSize(state.fontSize + 1);
      writeStore("fontSize", state.fontSize);
      applySettings();
      positionTooltip();
    });

    familyButton.addEventListener("click", function () {
      state.fontFamily = state.fontFamily === "serif" ? "sans" : "serif";
      writeStore("fontFamily", state.fontFamily);
      applySettings();
      positionTooltip();
    });

    chapterSelect.addEventListener("change", function () {
      stopChapterAudio();
      hideTooltip();
      var target = document.getElementById(chapterSelect.value);
      if (target) {
        target.scrollIntoView({ block: "start" });
        window.scrollBy(0, -topbar.offsetHeight - 8);
        savePosition();
      }
      updateChapterAudioButton();
    });

    chapterPlayButton.addEventListener("click", playChapterAudio);
    chapterAudio.addEventListener("loadedmetadata", function () {
      if (state.pendingSeek !== null) {
        chapterAudio.currentTime = state.pendingSeek;
        state.pendingSeek = null;
      }
    });
    chapterAudio.addEventListener("play", function () {
      updateChapterAudioButton();
      syncChapterPhrase();
    });
    chapterAudio.addEventListener("timeupdate", syncChapterPhrase);
    chapterAudio.addEventListener("playing", startChapterScroll);
    chapterAudio.addEventListener("waiting", stopChapterScroll);
    chapterAudio.addEventListener("seeking", stopChapterScroll);
    chapterAudio.addEventListener("seeked", function () {
      syncChapterPhrase();
      if (!chapterAudio.paused) startChapterScroll();
    });
    chapterAudio.addEventListener("pause", function () {
      stopChapterScroll();
      updateChapterAudioButton();
    });
    chapterAudio.addEventListener("ended", function () {
      stopChapterScroll();
      clearReadingPhrase();
      updateChapterAudioButton();
    });
    chapterAudio.addEventListener("error", showChapterAudioError);

    content.addEventListener("click", function (event) {
      var phrase = closestElement(event.target, ".phrase");
      if (!phrase) {
        hideTooltip();
        return;
      }
      event.preventDefault();
      if (state.activePhrase === phrase && state.tooltipPinned) {
        hideTooltip();
      } else {
        showTooltip(phrase, event);
      }
    });

    content.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      var phrase = closestElement(event.target, ".phrase");
      if (!phrase) return;
      event.preventDefault();
      if (state.activePhrase === phrase) {
        hideTooltip();
      } else {
        showTooltip(phrase, null);
        if (!tooltipAudioButton.hidden) tooltipAudioButton.focus({ preventScroll: true });
      }
    });

    content.addEventListener("mouseover", function (event) {
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      var phrase = closestElement(event.target, ".phrase");
      if (phrase) showTooltip(phrase, event, true);
    });

    content.addEventListener("mouseout", function (event) {
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      var phrase = closestElement(event.target, ".phrase");
      if (!phrase || phrase.contains(event.relatedTarget) || tooltip.contains(event.relatedTarget)) return;
      if (!state.tooltipPinned) scheduleHideTooltip();
    });

    tooltip.addEventListener("mouseenter", function () {
      window.clearTimeout(state.tooltipTimer);
    });
    tooltip.addEventListener("mouseleave", function (event) {
      if (!state.tooltipPinned && !(state.activePhrase && state.activePhrase.contains(event.relatedTarget))) {
        scheduleHideTooltip();
      }
    });
    tooltip.addEventListener("focusin", function () {
      window.clearTimeout(state.tooltipTimer);
      state.tooltipPinned = true;
    });
    tooltipAudioButton.addEventListener("click", playPhraseAudio);
    phraseAudio.addEventListener("ended", resetAudioButton);
    phraseAudio.addEventListener("pause", resetAudioButton);
    phraseAudio.addEventListener("error", showAudioError);
    document.addEventListener("play", function (event) {
      if (event.target.tagName !== "AUDIO") return;
      document.querySelectorAll("audio").forEach(function (audio) {
        if (audio !== event.target) audio.pause();
      });
    }, true);
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || tooltip.hidden) return;
      var phrase = state.activePhrase;
      hideTooltip();
      if (phrase) phrase.focus({ preventScroll: true });
    });

    document.addEventListener("click", function (event) {
      if (closestElement(event.target, ".phrase") || closestElement(event.target, ".tooltip")) return;
      hideTooltip();
    });

    window.addEventListener("resize", function () {
      state.scrollTrack = null;
      positionTooltip();
      updateProgressAndChapter();
    });

    window.addEventListener("scroll", function () {
      if (chapterAudio.paused) updateProgressAndChapter();
      queueSavePosition();
      positionTooltip();
    }, { passive: true });

    window.addEventListener("pagehide", savePosition);
    window.addEventListener("beforeunload", savePosition);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") savePosition();
      else if (!chapterAudio.paused) startChapterScroll();
    });
  }

  function closestElement(target, selector) {
    if (!target) return null;
    var element = target.nodeType === 1 ? target : target.parentElement;
    return element ? element.closest(selector) : null;
  }

  function renderRichText(element, value) {
    element.textContent = "";
    String(value || "").split(/(\*\*[^*]+\*\*)/g).forEach(function (part) {
      if (!part) return;
      if (part.indexOf("**") === 0 && part.lastIndexOf("**") === part.length - 2) {
        var strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        element.append(strong);
      } else {
        element.append(document.createTextNode(part));
      }
    });
  }

  function applySettings() {
    state.scrollTrack = null;
    document.body.classList.toggle("theme-dark", state.theme === "dark");
    document.body.classList.toggle("theme-light", state.theme !== "dark");
    document.documentElement.style.setProperty("--reader-font-size", state.fontSize + "px");
    themeButton.textContent = state.theme === "dark" ? "☀️" : "🌙";
    themeButton.setAttribute("aria-label", state.theme === "dark" ? "Šviesi tema" : "Tamsi tema");
    familyButton.textContent = "A";
    familyButton.setAttribute("aria-label", state.fontFamily === "serif" ? "Šriftas su užraitais" : "Šriftas be užraitų");
    familyButton.classList.toggle("family-serif", state.fontFamily === "serif");
    familyButton.classList.toggle("family-sans", state.fontFamily === "sans");
    fontDownButton.disabled = state.fontSize <= 18;
    fontUpButton.disabled = state.fontSize >= 32;
    var text = document.getElementById("readerText");
    if (text) {
      text.classList.toggle("serif", state.fontFamily === "serif");
      text.classList.toggle("sans", state.fontFamily === "sans");
    }
  }

  function showTooltip(phrase, event, hoverOnly) {
    if (!phrase || !phrase._phraseData) return;
    if (!hasTooltip(phrase._phraseData)) return;
    if (hoverOnly && !chapterAudio.paused) return;
    window.clearTimeout(state.tooltipTimer);
    if (hoverOnly && (state.tooltipPinned || state.activePhrase === phrase)) return;
    if (!hoverOnly) {
      chapterAudio.pause();
      clearReadingPhrase();
      chapterSelect.value = phrase.dataset.chapterId;
      updateChapterAudioButton();
    }
    if (state.activePhrase !== phrase) stopPhraseAudio();
    state.tooltipPinned = !hoverOnly;
    if (!hoverOnly) phrase.focus({ preventScroll: true });
    if (state.activePhrase && state.activePhrase !== phrase) {
      state.activePhrase.classList.remove("is-active");
    }
    state.activePhrase = phrase;
    state.activeData = phrase._phraseData;
    phrase.classList.add("is-active");
    tooltipTranslation.textContent = state.activeData.translation;
    renderRichText(tooltipNote, state.activeData.note);
    tooltipAudioButton.hidden = !state.activeData.audio;
    tooltipAudioError.hidden = true;
    tooltip.hidden = false;
    positionTooltip(event);
  }

  function hideTooltip() {
    window.clearTimeout(state.tooltipTimer);
    stopPhraseAudio();
    state.tooltipPinned = false;
    if (state.activePhrase) state.activePhrase.classList.remove("is-active");
    state.activePhrase = null;
    state.activeData = null;
    tooltip.hidden = true;
  }

  function scheduleHideTooltip() {
    window.clearTimeout(state.tooltipTimer);
    state.tooltipTimer = window.setTimeout(hideTooltip, 300);
  }

  function resetAudioButton() {
    tooltipAudioButton.setAttribute("aria-pressed", "false");
  }

  function stopPhraseAudio() {
    phraseAudio.pause();
    // Abort a pending load/play too, so a closed tooltip cannot start speaking later.
    if (phraseAudio.hasAttribute("src")) {
      phraseAudio.removeAttribute("src");
      phraseAudio.load();
    }
    resetAudioButton();
  }

  function playPhraseAudio() {
    if (!state.activeData || !state.activeData.audio) return;
    window.clearTimeout(state.tooltipTimer);
    state.tooltipPinned = true;
    if (!phraseAudio.paused) {
      stopPhraseAudio();
      return;
    }
    var item = state.activeData;
    tooltipAudioError.hidden = true;
    phraseAudio.src = item.audio;
    tooltipAudioButton.setAttribute("aria-pressed", "true");
    phraseAudio.play().catch(function (error) {
      if (error.name === "AbortError" || state.activeData !== item) return;
      showAudioError();
    });
  }

  function showAudioError() {
    if (!state.activeData || !phraseAudio.hasAttribute("src")) return;
    phraseAudio.pause();
    resetAudioButton();
    tooltipAudioError.hidden = false;
    positionTooltip();
  }

  function loadChapterTimelines() {
    var phrases = {};
    content.querySelectorAll(".phrase").forEach(function (phrase) {
      if (phrase._phraseData.audio) phrases[phrase._phraseData.audio] = phrase;
    });
    state.book.chapters.forEach(function (chapter) {
      if (!chapter.audio) return;
      fetch(new URL("manifest.json", new URL(chapter.audio, document.baseURI)))
        .then(function (response) {
          if (!response.ok) throw new Error("timeline load failed");
          return response.json();
        })
        .then(function (manifest) {
          var cues = manifest.phrases.map(function (cue) {
            var phrase = phrases[cue.audio];
            if (!phrase || phrase.dataset.chapterId !== chapter.id ||
                !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start) {
              throw new Error("invalid timeline");
            }
            return { start: cue.start, end: cue.end, audio: cue.audio, phrase: phrase };
          });
          if (!cues.length) throw new Error("empty timeline");
          state.chapterTimelines[chapter.id] = cues;
          updateChapterAudioButton();
        })
        .catch(function () {
          state.chapterTimelines[chapter.id] = null;
          updateChapterAudioButton();
        });
    });
  }

  function updateChapterAudioButton() {
    var chapter = state.book && state.book.chapters.find(function (item) {
      return item.id === chapterSelect.value;
    });
    var playing = !chapterAudio.paused && !chapterAudio.ended;
    var timeline = chapter && state.chapterTimelines[chapter.id];
    chapterPlayButton.disabled = !timeline;
    chapterPlayButton.setAttribute("aria-pressed", String(playing));
    var label = playing ? "Pristabdyti skaitymą" : "Klausyti skyriaus";
    if (!chapter || !chapter.audio) label = "Šis skyrius dar neįgarsintas";
    else if (timeline === undefined) label = "Kraunama...";
    else if (timeline === null) label = "Nepavyko įkelti garso. Atnaujink puslapį.";
    chapterPlayButton.setAttribute("aria-label", label);
    chapterPlayButton.title = label;
    document.body.classList.toggle("chapter-playing", playing);
  }

  function playChapterAudio() {
    if (!chapterAudio.paused) {
      chapterAudio.pause();
      return;
    }
    var chapter = state.book.chapters.find(function (item) { return item.id === chapterSelect.value; });
    var cues = chapter && state.chapterTimelines[chapter.id];
    if (!cues) return;
    var selectedAudio = state.activePhrase && state.activePhrase._phraseData.audio;
    var selected = cues.find(function (cue) {
      return cue.phrase === state.activePhrase || (selectedAudio && cue.audio === selectedAudio);
    });
    var sameChapter = state.audioChapterId === chapter.id;
    var resumeTime = state.pendingSeek === null ? chapterAudio.currentTime : state.pendingSeek;
    var start = selected ? selected.start : (sameChapter && !chapterAudio.ended ? resumeTime : 0);
    hideTooltip();
    clearReadingPhrase();
    chapterAudioError.hidden = true;
    if (!sameChapter || chapterAudio.error) {
      state.audioChapterId = chapter.id;
      chapterAudio.src = chapter.audio;
    }
    // Keep play() in the click gesture for mobile browsers; seek as soon as metadata is ready.
    state.pendingSeek = start;
    if (chapterAudio.readyState >= 1) {
      chapterAudio.currentTime = start;
      state.pendingSeek = null;
    }
    chapterAudio.play().catch(function (error) {
      if (error.name !== "AbortError" && state.audioChapterId === chapter.id) showChapterAudioError();
    });
  }

  function stopChapterAudio() {
    chapterAudio.pause();
    state.audioChapterId = null;
    state.pendingSeek = null;
    chapterAudio.removeAttribute("src");
    chapterAudio.load();
    clearReadingPhrase();
    chapterAudioError.hidden = true;
    updateChapterAudioButton();
  }

  function showChapterAudioError() {
    if (!state.audioChapterId) return;
    chapterAudio.pause();
    clearReadingPhrase();
    chapterAudioError.hidden = false;
    updateChapterAudioButton();
  }

  function clearReadingPhrase() {
    if (state.readingPhrase) state.readingPhrase.classList.remove("is-reading");
    state.readingPhrase = null;
  }

  function syncChapterPhrase() {
    if (chapterAudio.paused || chapterAudio.ended) return;
    var time = state.pendingSeek === null ? chapterAudio.currentTime : state.pendingSeek;
    var cues = state.chapterTimelines[state.audioChapterId] || [];
    var cue = cues.find(function (item) { return time >= item.start && time < item.end; });
    if (!cue || cue.phrase === state.readingPhrase) return;
    clearReadingPhrase();
    state.readingPhrase = cue.phrase;
    cue.phrase.classList.add("is-reading");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var rect = getPhraseRect(cue.phrase);
      var viewport = getViewport();
      window.scrollTo(0, Math.max(0, window.scrollY + rect.top + rect.height / 2 - viewport.top - viewport.height / 2));
    }
    updateProgressAndChapter();
  }

  function buildScrollTrack() {
    var viewport = getViewport();
    state.scrollTrack = (state.chapterTimelines[state.audioChapterId] || []).map(function (cue) {
      var rect = getPhraseRect(cue.phrase);
      return {
        time: (cue.start + cue.end) / 2,
        position: window.scrollY + rect.top + rect.height / 2 - viewport.top - viewport.height / 2
      };
    });
  }

  function startChapterScroll() {
    stopChapterScroll();
    if (chapterAudio.paused || chapterAudio.readyState < 3 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    buildScrollTrack();
    if (!state.scrollTrack.length) return;
    state.scrollPosition = window.scrollY;
    var target = getScrollTarget(state.scrollTrack, chapterAudio.currentTime);
    // Reposition once after starting/seeking far away; normal playback only adjusts speed.
    if (Math.abs(target.position - state.scrollPosition) > getViewport().height * 0.65) {
      window.scrollTo(0, Math.max(0, target.position));
      state.scrollPosition = window.scrollY;
    }
    state.scrollFrame = window.requestAnimationFrame(scrollChapterFrame);
  }

  function stopChapterScroll() {
    window.cancelAnimationFrame(state.scrollFrame);
    state.scrollFrame = null;
    state.scrollLastTime = null;
    state.scrollVelocity = 0;
  }

  function scrollChapterFrame(timestamp) {
    if (chapterAudio.paused || chapterAudio.ended || chapterAudio.seeking || chapterAudio.readyState < 3) {
      stopChapterScroll();
      return;
    }
    if (!state.scrollTrack) {
      startChapterScroll();
      return;
    }
    var elapsed = state.scrollLastTime === null ? 0 : Math.min(0.05, (timestamp - state.scrollLastTime) / 1000);
    state.scrollLastTime = timestamp;
    // Retain fractional pixels, but absorb manual scrolling and layout changes.
    if (Math.abs(window.scrollY - state.scrollPosition) > 2) state.scrollPosition = window.scrollY;
    var target = getScrollTarget(state.scrollTrack, chapterAudio.currentTime);
    var next = advanceScroll(state.scrollPosition, state.scrollVelocity, target, elapsed);
    state.scrollPosition = Math.max(0, Math.min(document.documentElement.scrollHeight - window.innerHeight, next.position));
    state.scrollVelocity = next.velocity;
    window.scrollTo(0, state.scrollPosition);
    state.scrollFrame = window.requestAnimationFrame(scrollChapterFrame);
  }

  function interpolateScrollPosition(track, time) {
    if (time <= track[0].time) return track[0].position;
    for (var index = 1; index < track.length; index++) {
      if (time <= track[index].time) {
        var left = track[index - 1];
        var right = track[index];
        return left.position + (right.position - left.position) * (time - left.time) / (right.time - left.time);
      }
    }
    return track[track.length - 1].position;
  }

  function getScrollTarget(track, time) {
    // Average six seconds of the known narration path. Both position and speed
    // stay continuous even when several phrases share a line or a paragraph ends.
    var from = time - 3;
    var to = time + 3;
    var start = interpolateScrollPosition(track, from);
    var end = interpolateScrollPosition(track, to);
    var previousTime = from;
    var previousPosition = start;
    var area = 0;
    track.forEach(function (point) {
      if (point.time <= from || point.time >= to) return;
      area += (previousPosition + point.position) / 2 * (point.time - previousTime);
      previousTime = point.time;
      previousPosition = point.position;
    });
    area += (previousPosition + end) / 2 * (to - previousTime);
    return { position: area / 6, velocity: (end - start) / 6 };
  }

  function advanceScroll(position, velocity, target, elapsed) {
    var desiredVelocity = Math.max(0, target.velocity + (target.position - position) * 0.7);
    var nextVelocity = velocity + (desiredVelocity - velocity) * (1 - Math.exp(-elapsed / 0.35));
    return { position: position + nextVelocity * elapsed, velocity: nextVelocity };
  }

  function positionTooltip(event) {
    if (!state.activePhrase || tooltip.hidden) return;

    tooltip.style.left = "-9999px";
    tooltip.style.right = "auto";
    tooltip.style.top = "0";

    var viewport = getViewport();
    var gap = 8;
    var anchor = getPhraseRect(state.activePhrase);
    var mobile = viewport.width <= 700 || window.matchMedia("(pointer: coarse)").matches;

    if (mobile) {
      tooltip.style.left = (viewport.left + 10) + "px";
      tooltip.style.right = "10px";
      tooltip.style.width = "auto";
      tooltip.style.maxWidth = "none";
      var mobileHeight = tooltip.offsetHeight;
      var top = anchor.top - mobileHeight - gap;
      var minTop = viewport.top + 10;
      if (top < minTop) top = Math.min(anchor.bottom + gap, viewport.bottom - mobileHeight - 10);
      tooltip.style.top = Math.max(minTop, top) + "px";
      return;
    }

    tooltip.style.right = "auto";
    tooltip.style.width = "max-content";
    tooltip.style.maxWidth = "380px";

    var width = tooltip.offsetWidth;
    var height = tooltip.offsetHeight;
    var left = anchor.left + anchor.width / 2 - width / 2;
    var topDesktop = anchor.top - height - gap;

    left = Math.max(viewport.left + 12, Math.min(left, viewport.right - width - 12));
    if (topDesktop < viewport.top + 12) topDesktop = anchor.bottom + gap;
    topDesktop = Math.max(viewport.top + 12, Math.min(topDesktop, viewport.bottom - height - 12));

    tooltip.style.left = left + "px";
    tooltip.style.top = topDesktop + "px";
  }

  function getPhraseRect(phrase) {
    var rects = Array.prototype.slice.call(phrase.getClientRects());
    if (!rects.length) return phrase.getBoundingClientRect();
    var top = rects[0].top;
    var right = rects[0].right;
    var bottom = rects[0].bottom;
    var left = rects[0].left;
    rects.forEach(function (rect) {
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
      left = Math.min(left, rect.left);
    });
    return {
      top: top,
      right: right,
      bottom: bottom,
      left: left,
      width: right - left,
      height: bottom - top
    };
  }

  function getViewport() {
    var visual = window.visualViewport;
    if (visual) {
      return {
        left: visual.offsetLeft || 0,
        top: visual.offsetTop || 0,
        right: (visual.offsetLeft || 0) + visual.width,
        bottom: (visual.offsetTop || 0) + visual.height,
        width: visual.width,
        height: visual.height
      };
    }
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  function findChapterAtMarker(chapters, marker) {
    var current = chapters[0] || null;
    chapters.forEach(function (chapter) {
      if (chapter.getBoundingClientRect().top <= marker) current = chapter;
    });
    return current;
  }

  function getChapterPercentAtMarker(chapters, current, marker, contentBottom) {
    var index = chapters.indexOf(current);
    if (index < 0) return 0;
    var start = current.getBoundingClientRect().top;
    var end = index + 1 < chapters.length
      ? chapters[index + 1].getBoundingClientRect().top
      : contentBottom;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return Math.max(0, Math.min(100, Math.round((marker - start) / (end - start) * 100)));
  }

  function updateProgressAndChapter() {
    var position = getCurrentPosition();
    var total = Math.max(1, state.totalParagraphs || 1);
    var percent = Math.max(0, Math.min(100, Math.round(position.index / total * 100)));
    progressText.textContent = percent + "%";

    var viewport = getViewport();
    var marker = viewport.top + viewport.height / 2;
    var chapterTitles = Array.prototype.slice.call(document.querySelectorAll(".chapter-title"));
    var current = findChapterAtMarker(chapterTitles, marker);
    if (!chapterAudio.paused && state.audioChapterId) current = document.getElementById(state.audioChapterId);
    if (current) chapterSelect.value = current.id;
    updateChapterAudioButton();
    if (state.book && current) {
      state.book.chapters.some(function (chapter, index) {
        if (chapter.id === current.id) {
          chapterCountText.textContent = "Skyrius " + (index + 1) + " iš " + state.book.chapters.length;
          return true;
        }
        return false;
      });
    }
    var chapterPercent = getChapterPercentAtMarker(
      chapterTitles, current, marker, content.getBoundingClientRect().bottom
    );
    chapterProgressText.textContent = chapterPercent + "%";
  }

  function queueSavePosition() {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(savePosition, 120);
  }

  function savePosition() {
    var position = getCurrentPosition();
    writeStore("paragraphId", position.id);
    writeStore("paragraphIndex", position.index);
    writeStore("paragraphOffset", position.offset);
    writeStore("paragraphText", position.text);
  }

  function restorePosition() {
    if (state.restored) return;
    state.restored = true;
    var paragraphId = readStore("paragraphId", "");
    var indexValue = readStore("paragraphIndex", "");
    var paragraphIndex = parseInt(indexValue, 10);
    var offset = parseFloat(readStore("paragraphOffset", "0"));
    var paragraphText = readStore("paragraphText", "");
    window.requestAnimationFrame(function () {
      var target = null;
      if (paragraphId) target = document.getElementById(paragraphId);
      if (target && paragraphText && !paragraphMatches(target, paragraphText)) target = null;
      if (!target && paragraphText) target = findParagraphByText(paragraphText);
      if (!target && Number.isFinite(paragraphIndex) && paragraphIndex > 0) {
        target = document.querySelector('.reader-paragraph[data-paragraph-index="' + paragraphIndex + '"]');
      }
      if (target) {
        var top = (window.scrollY || 0) + target.getBoundingClientRect().top + (Number.isFinite(offset) ? offset : 0);
        window.scrollTo(0, Math.max(0, top));
        return;
      }
      restoreLegacyRatio();
    });
  }

  function getCurrentPosition() {
    var marker = topbar.offsetHeight + 18;
    var current = null;
    Array.prototype.forEach.call(document.querySelectorAll(".reader-paragraph"), function (paragraph) {
      if (paragraph.getBoundingClientRect().top <= marker) current = paragraph;
    });
    if (!current) {
      current = document.querySelector(".reader-paragraph");
    }
    if (!chapterAudio.paused && state.readingPhrase) current = state.readingPhrase.closest(".reader-paragraph");
    if (!current) return { id: "", index: 0, offset: 0, text: "" };
    var index = parseInt(current.dataset.paragraphIndex || "0", 10);
    var absoluteTop = (window.scrollY || 0) + current.getBoundingClientRect().top;
    return {
      id: current.id,
      index: Number.isFinite(index) ? index : 0,
      offset: Math.round((window.scrollY || 0) - absoluteTop),
      text: normalizeAnchorText(current.textContent)
    };
  }

  function normalizeAnchorText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function paragraphMatches(paragraph, anchorText) {
    return normalizeAnchorText(paragraph.textContent).indexOf(anchorText) === 0;
  }

  function findParagraphByText(anchorText) {
    var found = null;
    Array.prototype.some.call(document.querySelectorAll(".reader-paragraph"), function (paragraph) {
      if (!paragraphMatches(paragraph, anchorText)) return false;
      found = paragraph;
      return true;
    });
    return found;
  }

  function restoreLegacyRatio() {
    var ratio = parseFloat(readStore("scrollRatio", "0"));
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    var doc = document.documentElement;
    var max = Math.max(1, doc.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.max(0, Math.min(max, max * ratio)));
    savePosition();
  }
})();
