/* Service worker mínimo: só para mostrar e abrir as notificações da agenda (sem cache offline). */
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = new URL("#agenda", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (janelas) {
      for (var i = 0; i < janelas.length; i++) {
        var janela = janelas[i];
        if (janela.url.indexOf(self.registration.scope) === 0 && "focus" in janela) {
          janela.postMessage({ tipo: "abrir-agenda" });
          return janela.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    })
  );
});
