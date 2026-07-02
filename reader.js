(function () {
  var params = new URLSearchParams(window.location.search);
  var bookId = params.get("book") || "jokiu-orchideju";
  var storagePrefix = "frankReader." + bookId + ".";
  var state = {
    book: null,
    activePhrase: null,
    activeData: null,
    totalParagraphs: 0,
    fontSize: readStore("fontSize", "23"),
    fontFamily: readStore("fontFamily", "serif"),
    theme: readStore("theme", "light"),
    lastScrollY: window.scrollY || 0,
    saveTimer: null,
    restored: false
  };

  var content = document.getElementById("content");
  var topbar = document.getElementById("topbar");
  var progressText = document.getElementById("progressText");
  var chapterSelect = document.getElementById("chapterSelect");
  var themeButton = document.getElementById("themeButton");
  var fontDownButton = document.getElementById("fontDownButton");
  var fontUpButton = document.getElementById("fontUpButton");
  var familyButton = document.getElementById("familyButton");
  var tooltip = document.getElementById("tooltip");
  var tooltipTranslation = document.getElementById("tooltipTranslation");
  var tooltipNote = document.getElementById("tooltipNote");

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
      var option = document.createElement("option");
      option.value = chapter.id;
      option.textContent = chapter.title || ("Skyrius " + (chapterIndex + 1));
      chapterSelect.append(option);

      var title = document.createElement("div");
      title.className = "chapter-title";
      title.id = chapter.id;
      title.dataset.chapterTitle = option.textContent;
      title.textContent = chapter.label || option.textContent;
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
          paragraph.append(renderItem(item));
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
      hideTooltip();
      var target = document.getElementById(chapterSelect.value);
      if (target) {
        target.scrollIntoView({ block: "start" });
        window.scrollBy(0, -topbar.offsetHeight - 8);
        savePosition();
      }
    });

    content.addEventListener("click", function (event) {
      var phrase = closestElement(event.target, ".phrase");
      if (!phrase) {
        hideTooltip();
        return;
      }
      event.preventDefault();
      if (state.activePhrase === phrase) {
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
      hideTooltip();
    });

    document.addEventListener("click", function (event) {
      if (closestElement(event.target, ".phrase") || closestElement(event.target, ".tooltip")) return;
      hideTooltip();
    });

    window.addEventListener("resize", function () {
      positionTooltip();
      updateProgressAndChapter();
    });

    window.addEventListener("scroll", function () {
      handleTopbar();
      updateProgressAndChapter();
      queueSavePosition();
      positionTooltip();
    }, { passive: true });

    window.addEventListener("pagehide", savePosition);
    window.addEventListener("beforeunload", savePosition);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") savePosition();
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
    if (!hoverOnly) phrase.focus({ preventScroll: true });
    if (state.activePhrase && state.activePhrase !== phrase) {
      state.activePhrase.classList.remove("is-active");
    }
    state.activePhrase = phrase;
    state.activeData = phrase._phraseData;
    phrase.classList.add("is-active");
    tooltipTranslation.textContent = state.activeData.translation;
    renderRichText(tooltipNote, state.activeData.note);
    tooltip.hidden = false;
    positionTooltip(event);
  }

  function hideTooltip() {
    if (state.activePhrase) state.activePhrase.classList.remove("is-active");
    state.activePhrase = null;
    state.activeData = null;
    tooltip.hidden = true;
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

  function handleTopbar() {
    var y = window.scrollY || 0;
    if (y > state.lastScrollY + 8 && y > topbar.offsetHeight + 24) {
      topbar.classList.add("is-hidden");
    } else if (y < state.lastScrollY - 8) {
      topbar.classList.remove("is-hidden");
    }
    state.lastScrollY = y;
  }

  function updateProgressAndChapter() {
    var position = getCurrentPosition();
    var total = Math.max(1, state.totalParagraphs || 1);
    var percent = Math.max(0, Math.min(100, Math.round(position.index / total * 100)));
    progressText.textContent = percent + "%";

    var current = null;
    Array.prototype.forEach.call(document.querySelectorAll(".chapter-title"), function (chapter) {
      if (chapter.getBoundingClientRect().top <= topbar.offsetHeight + 18) {
        current = chapter;
      }
    });
    if (current) chapterSelect.value = current.id;
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
