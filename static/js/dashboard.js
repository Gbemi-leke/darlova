/* =========================================================
   Dashboard (all member pages) — keeps you "online" and keeps
   the badges and live numbers (likes, matches, views) up to date.
   ========================================================= */
$(function () {
  var PULSE_MS = 15000;

  window.updateBadges = function (c) {
    $('[data-count]').each(function () {
      var n = c[$(this).data('count')] || 0;
      $(this).text(n > 99 ? '99+' : n).prop('hidden', !n);
    });
    $('[data-count-dot]').each(function () {
      $(this).prop('hidden', !c[$(this).data('countDot')]);
    });
    var $bell = $('.notif-btn');
    if (c.unread_notifications && !$bell.find('.pulse').length) $bell.append('<span class="pulse"></span>');
    if (!c.unread_notifications) $bell.find('.pulse').remove();
    if (c.stats) updateStats(c.stats);
    if ('latest' in c) alertNew(c.latest);
    // red number on the home-screen icon (installed app)
    var total = (c.unread_messages || 0) + (c.unread_notifications || 0);
    if ('setAppBadge' in navigator) (total ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(function () {});
  };

  /* In-app alert when something new arrives while you're using Darlova
     (new message, match, like, announcement). Tap it to open. */
  var lastKey;
  try { lastKey = sessionStorage.getItem('lv-last-alert'); } catch (e) {}
  function alertNew(n) {
    if (!n) return;
    if (lastKey === undefined || lastKey === null) {
      lastKey = n.key; // first check on this visit: just remember what's already there
    } else if (n.key !== lastKey) {
      lastKey = n.key;
      // The chat page already shows new messages live.
      if (!(n.kind === 'msg' && location.pathname === '/messages/')) {
        var icon = { msg: 'chat-heart-fill', match: 'heart-fill', like: 'hand-thumbs-up-fill', super: 'star-fill', system: 'megaphone-fill' }[n.kind] || 'bell-fill';
        $('#liveAlert').remove();
        var $a = $(
          '<a id="liveAlert" class="live-alert glass-strong" href="' + esc(n.link) + '" role="status">' +
            (n.img ? '<img src="' + esc(n.img) + '" class="avatar avatar-md" alt="">' : '<span class="push-ic"><i class="bi bi-' + icon + '"></i></span>') +
            '<span class="flex-grow-1 small fw-semibold">' + esc(n.text) + '</span><i class="bi bi-chevron-right"></i></a>',
        ).appendTo('body');
        setTimeout(function () { $a.addClass('show'); }, 30);
        setTimeout(function () { $a.removeClass('show'); setTimeout(function () { $a.remove(); }, 400); }, 6000);
        if (navigator.vibrate) navigator.vibrate(60);
      }
    }
    try { sessionStorage.setItem('lv-last-alert', lastKey); } catch (e) {}
  }

  /* Any element with data-stat="likes_received_today" (etc.) counts up/down to the new value. */
  window.updateStats = function (stats) {
    $('[data-stat]').each(function () {
      var $el = $(this),
        to = stats[$el.data('stat')];
      if (to === undefined) return;
      var from = parseInt($el.text(), 10) || 0;
      if (from === to) return;
      var steps = Math.min(Math.abs(to - from), 12),
        i = 0;
      $el.closest('.stat-tile, .col-4').addClass('bump');
      var t = setInterval(function () {
        i++;
        $el.text(Math.round(from + ((to - from) * i) / steps));
        if (i >= steps) {
          clearInterval(t);
          $el.text(to);
          setTimeout(function () { $el.closest('.bump').removeClass('bump'); }, 400);
        }
      }, 40);
    });
  };

  window.pulseNow = function () {
    return $.getJSON('/api/pulse/').done(updateBadges);
  };
  pulseNow(); // fresh badges right away (the page itself may have come from the app's cache)
  setInterval(function () {
    if (!document.hidden) pulseNow();
  }, PULSE_MS);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) pulseNow();
  });
});
