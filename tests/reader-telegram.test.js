const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../reader-telegram.js'), 'utf8');

function client({ initData = 'user=%7B%22id%22%3A123%7D&auth_date=1&hash=signed', platform = 'ios', version = '10.1' } = {}) {
  const events = {}, clicks = {}, requests = [];
  const elements = {
    fullscreenRow: { hidden: true },
    fullscreenButton: { textContent: '', disabled: false, setAttribute() {}, addEventListener: (name, fn) => { clicks[name] = fn; } },
    fullscreenStatus: { textContent: '', hidden: true },
    settingsMenu: { matches: () => true, hidePopover() {} }
  };
  const app = { initData, platform, isFullscreen: false,
    isVersionAtLeast: v => Number(version) >= Number(v),
    ready() {}, expand() {},
    requestFullscreen: () => requests.push('enter'), exitFullscreen: () => requests.push('exit'),
    onEvent: (name, fn) => { events[name] = fn; }
  };
  const window = { location: new URL('https://app8558143201.tgcloud.ai/'),
    Telegram: { WebApp: app, WebView: { initParams: { tgWebAppData: initData, tgWebAppVersion: version, tgWebAppPlatform: platform } } } };
  vm.runInNewContext(source, { window, URL, URLSearchParams, document: { getElementById: id => elements[id] || null, querySelectorAll: () => [] } });
  return { window, app, events, clicks, requests, elements };
}

test('book and shelf navigation preserves signed launch data without browser storage', () => {
  const { window, app } = client();
  const book = new URL(window.ReaderTelegram.url('reader.html?book=keliaujanti-biblioteka'));
  assert.equal(book.pathname, '/reader');
  assert.equal(book.searchParams.get('book'), 'keliaujanti-biblioteka');
  const launch = new URLSearchParams(book.hash.slice(1));
  assert.equal(launch.get('tgWebAppData'), app.initData);
  assert.equal(launch.get('tgWebAppPlatform'), 'ios');
  assert.equal(launch.get('tgWebAppVersion'), '10.1');
  const shelf = new URL(window.ReaderTelegram.url('index.html'));
  assert.equal(new URLSearchParams(shelf.hash.slice(1)).get('tgWebAppData'), app.initData);
  assert.equal(book.searchParams.has('tgWebAppData'), false);
});

test('ordinary browser and external links never inherit Telegram launch data', () => {
  const browser = client({ initData: '', platform: 'unknown' });
  assert.equal(browser.window.ReaderTelegram.url('reader.html?book=a'), 'reader.html?book=a');
  const telegram = client();
  assert.equal(telegram.window.ReaderTelegram.url('https://t.me/knygu_lentyna_bot'), 'https://t.me/knygu_lentyna_bot');
  assert.equal(telegram.window.ReaderTelegram.url('//example.com/reader'), '//example.com/reader');
  assert.equal(browser.elements.fullscreenRow.hidden, true);
});

test('fullscreen toggle follows native confirmation rather than assuming request succeeded', () => {
  const { elements, clicks, events, app, requests } = client();
  assert.equal(elements.fullscreenRow.hidden, false);
  assert.equal(elements.fullscreenButton.textContent, 'Развернуть');
  clicks.click();
  assert.deepEqual(requests, ['enter']);
  assert.equal(elements.fullscreenButton.textContent, 'Развернуть');
  app.isFullscreen = true; events.fullscreenChanged();
  assert.equal(elements.fullscreenButton.textContent, 'Свернуть');
  clicks.click();
  assert.deepEqual(requests, ['enter', 'exit']);
  app.isFullscreen = false; events.fullscreenChanged();
  assert.equal(elements.fullscreenButton.textContent, 'Развернуть');
});

test('unsupported Telegram fullscreen is reported without claiming success', () => {
  const { events, clicks, elements } = client();
  clicks.click(); events.fullscreenFailed({ error: 'UNSUPPORTED' });
  assert.equal(elements.fullscreenStatus.hidden, false);
  assert.match(elements.fullscreenStatus.textContent, /не поддерживает/);
  assert.equal(elements.fullscreenButton.textContent, 'Развернуть');
  const old = client({ version: '7.10' });
  assert.equal(old.elements.fullscreenButton.disabled, true);
  assert.equal(old.elements.fullscreenStatus.hidden, false);
});

test('navigation carries current fullscreen state after native expand or collapse', () => {
  const { window, app } = client();
  window.Telegram.WebView.initParams.tgWebAppFullscreen = '1';
  const read = href => new URLSearchParams(new URL(href).hash.slice(1)).get('tgWebAppFullscreen');
  assert.equal(read(window.ReaderTelegram.url('index.html')), null);
  app.isFullscreen = true;
  const entered = window.ReaderTelegram.url('index.html');
  assert.equal(read(entered), '1');
  app.isFullscreen = false;
  assert.equal(read(window.ReaderTelegram.url(entered)), null);
});
