(function () {
  var app = window.Telegram && window.Telegram.WebApp;
  if (!app || !app.initData) return;
  app.ready();
  app.expand();
})();
