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
    for (var c = 0; c <= location.chapter; c++) {
      var blocks = book.chapters[c].blocks;
      var count = c === location.chapter ? location.block + 1 : blocks.length;
      for (var b = 0; b < count; b++) {
        var items = blocks[b].items;
        if (c === location.chapter && b === location.block) items = items.slice(0, location.item);
        if (items.length) paragraphs.push(items.map(function (item) { return item.text; }).join(' '));
      }
    }
    return { before: paragraphs.join('\n\n'), phrase: {
      text: phrase.text, translation: phrase.translation || '', note: phrase.note || ''
    } };
  }
  function readingContext(book, location) {
    var context = phraseContext(book, location);
    return context.before + (context.before ? (location.item > 0 ? ' ' : '\n\n') : '') + context.phrase.text;
  }
  root.ReaderLearning = { phraseContext: phraseContext, readingContext: readingContext };
})(typeof window === 'undefined' ? globalThis : window);
