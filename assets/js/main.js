/* Corridor Intelligence theme — minimal progressive enhancement */
(function () {
  "use strict";

  // Close the mobile nav after tapping a link
  document.addEventListener("click", function (e) {
    var link = e.target.closest(".navlinks a");
    if (!link) return;
    var open = document.querySelector(".navlinks.open");
    if (open) open.classList.remove("open");
  });

  // Native Ghost members form feedback (data-members-form)
  document.addEventListener("submit", function (e) {
    var form = e.target.closest("form[data-members-form]");
    if (!form) return;
    var btn = form.querySelector("button[type=submit]");
    if (btn) {
      btn.dataset.label = btn.textContent;
      btn.textContent = "…";
      btn.disabled = true;
      // Ghost handles the POST; restore the button shortly after.
      setTimeout(function () {
        btn.textContent = btn.dataset.label || "S’abonner";
        btn.disabled = false;
      }, 2500);
    }
  });

  /* ---- PWA: register the service worker (shipped in-theme at /assets/sw.js) ---- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("/assets/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(function () {});
    });
  }

  /* ---- PWA: install affordances ---- */
  (function () {
    var deferred = null;
    var bar = document.getElementById("pwa-install");
    var btn = document.getElementById("pwa-install-btn");
    var x = document.getElementById("pwa-install-x");
    var ios = document.getElementById("pwa-ios");
    var iosX = document.getElementById("pwa-ios-x");

    function show(el) { if (el) el.hidden = false; }
    function hide(el) { if (el) el.hidden = true; }

    var standalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;

    var dismissed = false;
    try { dismissed = sessionStorage.getItem("pwa-dismiss") === "1"; } catch (e) {}
    function remember() { try { sessionStorage.setItem("pwa-dismiss", "1"); } catch (e) {} }

    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferred = e;
      if (!standalone && !dismissed) show(bar);
    });
    if (btn) btn.addEventListener("click", function () {
      if (!deferred) return;
      hide(bar);
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; });
    });
    if (x) x.addEventListener("click", function () { hide(bar); remember(); });
    window.addEventListener("appinstalled", function () { hide(bar); });

    var ua = window.navigator.userAgent;
    var isIOS = /iPhone|iPad|iPod/.test(ua);
    var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(ua);
    if (isIOS && isSafari && !standalone && !dismissed) {
      show(ios);
      if (iosX) iosX.addEventListener("click", function () { hide(ios); remember(); });
    }
  })();
})();
