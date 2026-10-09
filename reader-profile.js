(function () {
  var app = window.Telegram && window.Telegram.WebApp;
  var ready = false;
  var pending = {};
  var writing = null;
  var last = {};
  var pendingSettings = null;
  var settingsWriting = null;
  function call(input, name) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('Profile request timed out')); }, 10000);
      app.Serverless.call(name || 'readingPosition', input, function (error, result) {
        clearTimeout(timer);
        if (error) reject(new Error(error.message || 'Profile unavailable'));
        else resolve(result);
      });
    });
  }
  function saveCall(input, name, attempt) {
    return call(input, name).catch(function (error) {
      if ((attempt || 0) >= 2) throw error;
      return new Promise(function (resolve) { setTimeout(resolve, 1000 * Math.pow(2, attempt || 0)); })
        .then(function () { return saveCall(input, name, (attempt || 0) + 1); });
    });
  }
  function drain() {
    if (writing) return writing;
    var bookId = Object.keys(pending)[0];
    if (!bookId) return Promise.resolve();
    var position = pending[bookId];
    delete pending[bookId];
    writing = saveCall({ action: 'save', bookId: bookId, position: position })
      .then(function () { last[bookId] = JSON.stringify(position); })
      .catch(function (error) { if (!pending[bookId]) pending[bookId] = position; throw error; })
      .finally(function () { writing = null; });
    return writing.then(drain);
  }
  function drainSettings() {
    if (settingsWriting) return settingsWriting;
    if (!pendingSettings) return Promise.resolve();
    var settings = pendingSettings;
    pendingSettings = null;
    settingsWriting = saveCall({ action: 'save', settings: settings }, 'readerSettings')
      .catch(function (error) { if (!pendingSettings) pendingSettings = settings; throw error; })
      .finally(function () { settingsWriting = null; });
    return settingsWriting.then(drainSettings, function (error) {
      if (pendingSettings !== settings) return drainSettings();
      throw error;
    });
  }
  window.ReaderProfile = {
    enabled: !!(app && app.initData),
    load: function () {
      return Promise.all([call({ action: 'load' }), call({ action: 'load' }, 'readerSettings')]).then(function (values) {
        window.ReaderProfile.settings = values[1];
        ready = true;
        return values[0];
      });
    },
    settings: {},
    saveSetting: function (key, value) {
      if (!ready) return Promise.resolve();
      window.ReaderProfile.settings[key] = value;
      pendingSettings = Object.assign({}, window.ReaderProfile.settings);
      return drainSettings();
    },
    save: function (bookId, position) {
      if (!ready) return Promise.resolve();
      var clean = { id: position.id, index: position.index, offset: position.offset, text: position.text || "" };
      if (!clean.id || (!writing && !pending[bookId] && last[bookId] === JSON.stringify(clean))) return Promise.resolve();
      pending[bookId] = clean;
      return drain();
    }
  };
})();
