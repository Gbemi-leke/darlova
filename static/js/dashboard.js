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
  };

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
  setInterval(function () {
    if (!document.hidden) pulseNow();
  }, PULSE_MS);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) pulseNow();
  });
});
