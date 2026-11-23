/* =========================================================
   Push notifications — turn on / off, keep the phone registered,
   and a friendly "Turn on notifications" prompt in the app.
   iPhone: works once Darlova is added to the home screen (iOS 16.4+).
   ========================================================= */
(function () {
  var ua = navigator.userAgent,
    isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
    standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    KEY = 'lv-push-prompt';

  function b64ToBytes(s) {
    var pad = '='.repeat((4 - (s.length % 4)) % 4),
      raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')),
      out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function serverKey() {
    return $.getJSON('/api/push/key/').then(function (r) {
      if (!r.key) return $.Deferred().reject('not-configured').promise();
      return r.key;
    });
  }
  function registration() {
    return navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function () { return navigator.serviceWorker.ready; });
  }
  function save(sub) {
    return api('POST', '/api/push/subscribe/', sub.toJSON());
  }

  var Push = {
    /* 'unsupported' | 'needs-install' | 'denied' | 'on' | 'off' */
    status: function () {
      if (isIOS && !standalone) return Promise.resolve('needs-install');
      if (!supported) return Promise.resolve('unsupported');
      if (Notification.permission === 'denied') return Promise.resolve('denied');
      return registration().then(function (reg) { return reg.pushManager.getSubscription(); })
        .then(function (sub) { return sub && Notification.permission === 'granted' ? 'on' : 'off'; })
        .catch(function () { return 'off'; });
    },
    enable: function () {
      if (isIOS && !standalone) return Promise.reject('needs-install');
      if (!supported) return Promise.reject('unsupported');
      // Must start from a tap (iPhone requires it).
      return Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') throw 'denied';
        return Promise.all([registration(), serverKey()]);
      }).then(function (r) {
        return r[0].pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(r[1]) });
      }).then(save);
    },
    disable: function () {
      return registration().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
        if (!sub) return;
        api('POST', '/api/push/unsubscribe/', { endpoint: sub.endpoint });
        return sub.unsubscribe();
      });
    },
    test: function () { return api('POST', '/api/push/test/'); },
    explain: function (reason) {
      var msg = {
        'needs-install': 'On iPhone, add Darlova to your home screen first, then turn on notifications from the app.',
        unsupported: "This browser can't show notifications. Try Chrome, or the Darlova app on your home screen.",
        denied: 'Notifications are blocked. Allow them for Darlova in your phone settings, then try again.',
        'not-configured': "Notifications aren't set up on the server yet.",
      }[reason] || 'Could not turn on notifications. Please try again.';
      showToast(msg, 'bell-slash');
    },
  };
  window.DarlovaPush = Push;

  $(function () {
    if (!$('body').hasClass('app-shell')) return;

    // Already allowed: make sure this phone is still registered (subscriptions can change).
    if (supported && Notification.permission === 'granted' && (!isIOS || standalone)) {
      registration().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
        if (sub) save(sub);
        else Push.enable().catch(function () {});
      });
    }

    // Friendly prompt (once every 3 days) for people who haven't decided yet.
    var canAsk = supported && Notification.permission === 'default' && (!isIOS || standalone);
    var last = 0;
    try { last = +localStorage.getItem(KEY) || 0; } catch (e) {}
    if (!canAsk || Date.now() - last < 3 * 864e5 || $('#installBanner').length) return;
    setTimeout(function () {
      if ($('#installBanner').length) return;
      var $p = $(
        '<div id="pushPrompt" class="install-banner glass-strong" role="dialog" aria-label="Turn on notifications">' +
          '<span class="push-ic"><i class="bi bi-bell-fill"></i></span>' +
          '<div class="flex-grow-1 small"><strong class="d-block">Never miss a message</strong>Get an alert when someone messages or matches with you.</div>' +
          '<button type="button" class="btn btn-brand btn-sm" id="pushYes">Turn on</button>' +
          '<button type="button" class="btn-close" id="pushLater" aria-label="Later"></button></div>',
      ).appendTo('body');
      setTimeout(function () { $p.addClass('show'); }, 30);
      function close() {
        try { localStorage.setItem(KEY, Date.now()); } catch (e) {}
        $p.removeClass('show');
        setTimeout(function () { $p.remove(); }, 300);
      }
      $p.on('click', '#pushLater', close);
      $p.on('click', '#pushYes', function () {
        Push.enable().then(function () {
          showToast("Notifications are on. We'll tell you about new messages.", 'bell-fill');
          $p.remove();
        }).catch(function (r) { Push.explain(r); close(); });
      });
    }, 6000);
  });
})();
