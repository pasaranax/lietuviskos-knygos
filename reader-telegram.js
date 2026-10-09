(function () {
  var app = window.Telegram && window.Telegram.WebApp;
  var isMiniApp = !!(app && (app.initData || app.platform && app.platform !== 'unknown'));
  window.ReaderTelegram = {
    isMiniApp: isMiniApp,
    url: function (href) {
      if (!app || !app.initData) return href;
      var url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return href;
      // New documents need launch data even when WebView storage is unavailable.
      // Fragments stay in the client; Serverless still validates the original signature.
      var params = new URLSearchParams(url.hash.slice(1));
      var launch = window.Telegram.WebView && window.Telegram.WebView.initParams || {};
      Object.keys(launch).forEach(function (key) {
        if (key.indexOf('tgWebApp') === 0) params.set(key, launch[key]);
      });
      params.set('tgWebAppData', app.initData);
      params.set('tgWebAppPlatform', app.platform);
      params.set('tgWebAppVersion', app.version || launch.tgWebAppVersion);
      if (app.isFullscreen) params.set('tgWebAppFullscreen', '1');
      else params.delete('tgWebAppFullscreen');
      url.hash = params.toString();
      if (/^app\d+\.tgcloud\.ai$/.test(url.hostname)) url.pathname = url.pathname.replace(/\.html$/, '');
      return url.href;
    }
  };
  if (!isMiniApp) return;
  document.querySelectorAll('.home-link').forEach(function (link) {
    link.href = window.ReaderTelegram.url(link.getAttribute('href'));
    link.addEventListener('click', function () { link.href = window.ReaderTelegram.url(link.href); });
  });
  app.ready();
  app.expand();
  var row = document.getElementById('fullscreenRow');
  if (!row) return;
  var button = document.getElementById('fullscreenButton');
  var status = document.getElementById('fullscreenStatus');
  row.hidden = false;
  function updateFullscreen() {
    button.textContent = app.isFullscreen ? 'Свернуть' : 'Развернуть';
    button.setAttribute('aria-pressed', String(!!app.isFullscreen));
  }
  function showError(message) { status.textContent = message; status.hidden = false; }
  updateFullscreen();
  if (!app.isVersionAtLeast('8.0') || !app.requestFullscreen || !app.exitFullscreen) {
    button.disabled = true;
    showError('Обнови Telegram, чтобы развернуть на весь экран.');
    return;
  }
  app.onEvent('fullscreenChanged', function () { status.hidden = true; updateFullscreen(); });
  app.onEvent('fullscreenFailed', function (event) {
    updateFullscreen();
    if (event.error !== 'ALREADY_FULLSCREEN') showError('Telegram на этом устройстве не поддерживает полный экран.');
  });
  button.addEventListener('click', function () {
    status.hidden = true;
    try {
      if (app.isFullscreen) app.exitFullscreen();
      else app.requestFullscreen();
    } catch (_) { showError('Не удалось изменить размер окна. Попробуй ещё раз.'); }
  });
})();
