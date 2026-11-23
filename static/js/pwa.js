/* =========================================================
   Installable app — "Add to Home Screen"
   - registers the service worker (offline page, fast loading)
   - shows a small "Install Darlova" banner on phones:
       Android / Chrome → one-tap Install button
       iPhone Safari / Chrome → how to use Share → Add to Home Screen
   ========================================================= */
(function () {
  var ua = navigator.userAgent,
    isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
    isInApp = /FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|Twitter/i.test(ua),
    isIOSChrome = isIOS && /CriOS/.test(ua),
    standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    deferred = null,
    KEY = 'lv-install-dismissed';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
    });
  }

  $(function () {
    if (standalone) {
      // Inside the installed app: links to the website's home go to the dashboard, and "Remember me" is on.
      $('a[href="/"]').attr('href', '/discover/');
      $('input[name="remember"]').prop('checked', true);

      // Load the other tabs into the app's cache so every tap opens instantly.
      if (navigator.serviceWorker && $('body').hasClass('app-shell')) {
        navigator.serviceWorker.ready.then(function (reg) {
          setTimeout(function () { reg.active && reg.active.postMessage('warm'); }, 1200);
        });
      }

      // Instant feedback on tap: highlight the tab and show a thin loading bar.
      $(document).on('click', 'a[href^="/"]:not([target]):not([data-bs-toggle]):not([download])', function (e) {
        if (e.metaKey || e.ctrlKey || this.getAttribute('href').charAt(1) === '#') return;
        $('.app-bottom-nav a, .app-sidebar .nav-link').removeClass('active');
        $(this).filter('.app-bottom-nav a, .app-sidebar .nav-link').addClass('active');
        $('#navBar').remove();
        $('body').append('<div id="navBar" class="nav-progress"></div>');
      });
      // Coming back with the swipe-back gesture shows the cached page: hide the bar.
      window.addEventListener('pageshow', function () { $('#navBar').remove(); });
      return;
    }

    var shareIcon = '<i class="bi bi-box-arrow-up mx-1" aria-label="Share"></i>';
    function banner(html, withButton) {
      $('#installBanner').remove();
      var $b = $(
        '<div id="installBanner" class="install-banner glass-strong" role="dialog" aria-label="Install the Darlova app">' +
          '<img src="' + $('link[rel="apple-touch-icon"]').attr('href') + '" alt="" width="44" height="44">' +
          '<div class="flex-grow-1 small"><strong class="d-block">Get the Darlova app</strong>' + html + '</div>' +
          (withButton ? '<button type="button" class="btn btn-brand btn-sm" id="installBtn">Install</button>' : '') +
          '<button type="button" class="btn-close" id="installClose" aria-label="Not now"></button>' +
          (isIOS && !isIOSChrome && !isInApp ? '<span class="install-arrow" aria-hidden="true"></span>' : '') +
          '</div>',
      );
      $('body').append($b);
      setTimeout(function () { $b.addClass('show'); }, 30);
      $b.on('click', '#installClose', function () {
        try { localStorage.setItem(KEY, Date.now()); } catch (e) {}
        $b.removeClass('show');
        setTimeout(function () { $b.remove(); }, 300);
      });
      $b.on('click', '#installBtn', function () {
        if (!deferred) return;
        deferred.prompt();
        deferred.userChoice.finally(function () {
          deferred = null;
          $b.remove();
        });
      });
    }

    /* show the right instructions for this phone / browser */
    window.showInstallHelp = function (force) {
      if (!force) {
        var last = 0;
        try { last = +localStorage.getItem(KEY) || 0; } catch (e) {}
        if (Date.now() - last < 7 * 864e5) return; // asked "not now" in the last week
        if (window.innerWidth > 991) return;       // phones and tablets only
      }
      if (deferred) return banner('Install it on your home screen. It opens full-screen, like a normal app.', true);
      if (isInApp) return banner('Open <strong>darlova.com</strong> in Safari or Chrome, then add it to your home screen.');
      if (isIOSChrome) return banner('Tap ' + shareIcon + ' in the address bar, then <strong>Add to Home Screen</strong>.');
      if (isIOS) return banner('Tap <strong>⋯</strong> or ' + shareIcon + ' → <strong>Share</strong>, then <strong>Add to Home Screen</strong>.');
      if (force && window.innerWidth > 991)
        return banner('Open <strong>darlova.com</strong> on your phone in Safari (iPhone) or Chrome (Android), then add it to your home screen.');
      if (force) banner('Open your browser menu <i class="bi bi-three-dots-vertical"></i> and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.');
    };

    // Android / desktop Chrome tell us when the site can be installed.
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      setTimeout(function () { showInstallHelp(false); }, 2500);
    });
    window.addEventListener('appinstalled', function () {
      $('#installBanner').remove();
      showToast('Darlova is on your home screen 🎉', 'phone');
    });
    // iPhone never fires that event, so show the instructions after a moment.
    if (isIOS) setTimeout(function () { showInstallHelp(false); }, 3500);

    // Any "Get the app" button on the page
    $(document).on('click', '[data-install]', function (e) {
      e.preventDefault();
      showInstallHelp(true);
    });
  });
})();
