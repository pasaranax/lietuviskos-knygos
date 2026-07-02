(function () {
  var shelf = document.getElementById("bookShelf");
  var wordsPerPage = 250;
  var shelfEntries = [];

  function formatNumber(value) {
    return new Intl.NumberFormat("lt-LT").format(value);
  }

  function estimatePages(wordCount) {
    return Math.max(1, Math.ceil(wordCount / wordsPerPage));
  }

  function countParagraphs(book) {
    var total = 0;
    (book.chapters || []).forEach(function (chapter) {
      (chapter.blocks || []).forEach(function () {
        total += 1;
      });
    });
    return total;
  }

  function readProgress(book, totalParagraphs) {
    try {
      var prefix = "frankReader." + book.id + ".";
      var paragraphIndex = parseInt(window.localStorage.getItem(prefix + "paragraphIndex") || "", 10);
      var ratio = 0;
      if (Number.isFinite(paragraphIndex) && paragraphIndex > 0 && totalParagraphs > 0) {
        ratio = paragraphIndex / totalParagraphs;
      } else {
        ratio = parseFloat(window.localStorage.getItem(prefix + "scrollRatio") || "0");
      }
      if (!Number.isFinite(ratio) || ratio <= 0.003) return 0;
      return Math.max(1, Math.min(100, Math.round(ratio * 100)));
    } catch (error) {
      return 0;
    }
  }

  function setProgress(meta, progress) {
    var existing = meta.querySelector(".book-progress");
    if (progress > 0) {
      if (!existing) {
        existing = document.createElement("span");
        existing.className = "book-progress";
        meta.append(existing);
      }
      existing.textContent = "Perskaityta " + progress + "%";
    } else if (existing) {
      existing.remove();
    }
  }

  function updateShelfProgress() {
    shelfEntries.forEach(function (entry) {
      var card = shelf.querySelector('[data-book-id="' + entry.book.id + '"]');
      if (!card) return;
      var meta = card.querySelector(".book-meta");
      if (!meta) return;
      setProgress(meta, readProgress(entry.book, entry.totalParagraphs));
    });
  }

  function renderBook(book, details) {
    var totalParagraphs = details ? countParagraphs(details) : 0;
    var card = document.createElement("article");
    card.className = "book-slot";
    card.dataset.bookId = book.id;

    var link = document.createElement("a");
    link.className = "book-card";
    link.href = book.href || ("reader.html?book=" + encodeURIComponent(book.id));

    var cover = document.createElement("img");
    cover.className = "book-cover";
    cover.src = book.cover;
    cover.alt = "";
    cover.loading = "lazy";

    var info = document.createElement("span");
    info.className = "book-info";

    var title = document.createElement("span");
    title.className = "book-title";
    title.textContent = book.title;

    var author = document.createElement("span");
    author.className = "book-author";
    author.textContent = book.author;

    var meta = document.createElement("span");
    meta.className = "book-meta";

    var stats = document.createElement("span");
    stats.textContent = formatNumber(book.wordCount) + " žodžiai · " + formatNumber(estimatePages(book.wordCount)) + " psl.";

    meta.append(stats);
    setProgress(meta, readProgress(book, totalParagraphs));
    info.append(title, author, meta);
    link.append(cover, info);

    card.append(link);

    var actions = document.createElement("span");
    actions.className = "book-actions";

    var readLink = document.createElement("a");
    readLink.className = "book-action";
    readLink.href = link.href;
    readLink.textContent = "Skaityti";
    readLink.setAttribute("aria-label", "Skaityti: " + book.title);
    actions.append(readLink);

    if (Array.isArray(book.downloads) && book.downloads.length > 0) {
      book.downloads.forEach(function (download) {
        var downloadLink = document.createElement("a");
        downloadLink.className = "book-action";
        downloadLink.href = download.href;
        downloadLink.textContent = download.label || "Atsisiųsti";
        downloadLink.setAttribute("download", "");
        downloadLink.setAttribute("aria-label", downloadLink.textContent + ": " + book.title);
        actions.append(downloadLink);
      });
    }
    card.append(actions);

    return card;
  }

  fetch("books/catalog.json", { cache: "no-cache" })
    .then(function (response) {
      if (!response.ok) throw new Error("catalog load failed");
      return response.json();
    })
    .then(function (catalog) {
      shelf.textContent = "";
      if (!catalog.books || catalog.books.length === 0) {
        var empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "Knygų dar nėra.";
        shelf.append(empty);
        return;
      }
      Promise.all(catalog.books.map(function (book) {
        return fetch("books/" + encodeURIComponent(book.id) + ".json", { cache: "no-cache" })
          .then(function (response) {
            if (!response.ok) return null;
            return response.json();
          })
          .catch(function () {
            return null;
          })
          .then(function (details) {
            return { book: book, details: details };
          });
      })).then(function (entries) {
        shelfEntries = entries.map(function (entry) {
          return {
            book: entry.book,
            details: entry.details,
            totalParagraphs: entry.details ? countParagraphs(entry.details) : 0
          };
        });
        shelfEntries.forEach(function (entry) {
          shelf.append(renderBook(entry.book, entry.details));
        });
        updateShelfProgress();
      });
    })
    .catch(function () {
      var error = document.createElement("p");
      error.className = "error-state";
      error.textContent = "Nepavyko įkelti katalogo.";
      shelf.replaceChildren(error);
    });

  window.addEventListener("pageshow", updateShelfProgress);
  window.addEventListener("focus", updateShelfProgress);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") updateShelfProgress();
  });
})();
