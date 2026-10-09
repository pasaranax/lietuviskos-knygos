(function (root) {
  'use strict';
  function phraseContext(book, location) {
    if (!location || !['chapter', 'block', 'item'].every(function (key) {
      return Number.isInteger(location[key]) && location[key] >= 0;
    })) throw new Error('Invalid phrase location');
    var chapter = book.chapters[location.chapter];
    var block = chapter && chapter.blocks[location.block];
    var phrase = block && block.items[location.item];
    if (!phrase) throw new Error('Invalid phrase location');
    var paragraphs = [];
    for (var c = Math.max(0, location.chapter - 1); c <= location.chapter; c++) {
      var blocks = book.chapters[c].blocks;
      var count = c === location.chapter ? location.block + 1 : blocks.length;
      for (var b = 0; b < count; b++) {
        var items = blocks[b].items;
        if (c === location.chapter && b === location.block) items = items.slice(0, location.item);
        if (items.length) paragraphs.push(items.map(function (item) { return item.text; }).join(' '));
      }
    }
    return { before: paragraphs.join('\n\n'), phrase: {
      text: phrase.text, translation: phrase.translation || '', note: phrase.note || '',
      chapter: { number: location.chapter + 1, title: chapter.title || '' }
    } };
  }
  function readingContext(book, location) {
    phraseContext(book, location); // Validate the boundary before collecting any source text.
    var chapters = [];
    for (var c = Math.max(0, location.chapter - 1); c <= location.chapter; c++) {
      var chapter = book.chapters[c], paragraphs = [];
      var count = c === location.chapter ? location.block + 1 : chapter.blocks.length;
      for (var b = 0; b < count; b++) {
        var items = chapter.blocks[b].items;
        if (c === location.chapter && b === location.block) items = items.slice(0, location.item + 1);
        if (items.length) paragraphs.push(items.map(function (item) { return item.text; }).join(' '));
      }
      chapters.push('Глава ' + (c + 1) + (chapter.title ? ' — ' + chapter.title : '') + '\n' + paragraphs.join('\n\n'));
    }
    return chapters.join('\n\n');
  }
  root.ReaderLearning = { phraseContext: phraseContext, readingContext: readingContext };
})(typeof window === 'undefined' ? globalThis : window);
