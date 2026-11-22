/* =========================================================
   discover.html — page script (real members from /api/discover/)
   ========================================================= */
$(function () {
  var D = pageData(),
    people = {}, // id -> member
    busy = false,
    left = D.stats.likes_left,
    filters = { min: D.filters.min, max: D.filters.max, global: D.filters.global, verified: false, online: false };

  $('#todayDate').text(new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }));
  // Numbers refresh every 15s (dashboard.js) and straight after each swipe.
  pulseNow();

  /* ---------- side panel: recent matches ---------- */
  function miniMatch(m) {
    return (
      '<a href="/messages/?id=' + m.id + '" title="' + esc(m.name) + '"><img src="' + esc(m.img) + '" alt="' + esc(m.name) + '"></a>'
    );
  }
  if (D.miniMatches.length) $('#miniMatches').html(D.miniMatches.map(miniMatch).join(''));

  /* ---------- filters ---------- */
  function syncFilterUI() {
    $('#fAgeMin').val(filters.min);
    $('#fAgeMax').val(filters.max);
    $('#fAgeOut').text(filters.min + ' – ' + filters.max);
    $('#fCity').prop('checked', !filters.global);
    $('#fVerified').prop('checked', filters.verified);
    $('#fOnline').prop('checked', filters.online);
    $('#filterSummary').text((filters.global ? 'Everyone' : D.filters.city) + ' · ' + filters.min + '–' + filters.max);
  }
  syncFilterUI();

  /* ---------- cards ---------- */
  function cardHtml(u) {
    var bars = u.photos
      .map(function (p, i) {
        return '<i class="' + (i ? '' : 'on') + '"></i>';
      })
      .join('');
    var job = u.job ? '<i class="bi bi-briefcase me-1"></i>' + esc(u.job) + ' &nbsp;·&nbsp; ' : '';
    return (
      '<article class="swipe-card" data-id="' + u.id + '" aria-label="' + esc(u.name) + ', ' + u.age + '">' +
      (u.photos.length > 1 ? '<div class="bars">' + bars + '</div><div class="tapzone l"></div><div class="tapzone r"></div>' : '') +
      '<img class="main" src="' + esc(u.img) + '" alt="' + esc(u.name) + '" draggable="false">' +
      '<div class="stamp like">LIKE</div><div class="stamp nope">NOPE</div><div class="stamp super">SUPER</div>' +
      '<div class="shade"><div class="d-flex align-items-center gap-2 mb-1"><span class="font-display fw-bold fs-2">' +
      esc(u.name) + ', ' + u.age + '</span>' +
      (u.verified ? '<i class="bi bi-patch-check-fill fs-5" style="color:#5EC8FF" aria-label="Verified"></i>' : '') +
      (u.online ? '<span class="dot-online ms-1" title="Online now"></span>' : '') +
      '</div>' +
      '<div class="small mb-2" style="opacity:.92">' + job + '<i class="bi bi-geo-alt me-1"></i>' + esc(u.city) +
      (u.compat ? ' &nbsp;·&nbsp; ' + u.compat + '% match' : '') + '</div>' +
      (u.bio ? '<p class="small mb-2" style="opacity:.92">' + esc(u.bio) + '</p>' : '') +
      '<div>' + u.interests.slice(0, 4).map(function (t) {
        var shared = u.shared && u.shared.indexOf(t) > -1;
        return '<span class="tag">' + (shared ? '<i class="bi bi-heart-fill me-1"></i>' : '') + esc(t) + '</span>';
      }).join('') + '</div>' +
      '<a href="/profile/?id=' + u.id + '" class="btn btn-sm mt-1" style="background:rgba(255,255,255,.2);color:#fff;backdrop-filter:blur(10px)">View profile <i class="bi bi-chevron-right"></i></a></div></article>'
    );
  }
  function load() {
    $('#deck .swipe-card').remove();
    $('#emptyDeck').hide();
    $('#loadingDeck').show();
    api('GET', '/api/discover/', {
      min: filters.min,
      max: filters.max,
      global: filters.global ? 1 : 0,
      verified: filters.verified ? 1 : 0,
      online: filters.online ? 1 : 0,
    })
      .done(function (r) {
        people = {};
        left = r.likesLeft;
        updateStats({ likes_left: left });
        r.people.slice().reverse().forEach(function (u) {
          people[u.id] = u;
          $('#deck').append(cardHtml(u));
        });
        layout();
        $('#emptyDeck').toggle(!r.people.length);
      })
      .always(function () {
        $('#loadingDeck').hide();
      });
  }
  function layout() {
    var $cards = $('#deck .swipe-card');
    $cards.each(function (i, el) {
      var depth = $cards.length - 1 - i;
      $(el).css({
        transition: 'transform .4s cubic-bezier(.22,1,.36,1)',
        transform: 'translateY(' + Math.min(depth, 2) * 12 + 'px) scale(' + (1 - Math.min(depth, 2) * 0.04) + ')',
        zIndex: i + 1,
        opacity: depth > 2 ? 0 : 1,
      });
    });
  }
  function top() {
    return $('#deck .swipe-card').last();
  }

  /* ---------- swiping ---------- */
  var ACTION = { left: 'pass', right: 'like', up: 'super' };
  function swipe(dir) {
    var $c = top();
    if (!$c.length || busy) return;
    if (dir !== 'left' && left <= 0) {
      showToast("You're out of likes for today. They reset at midnight.", 'hourglass-split');
      layout();
      $c.find('.stamp').css('opacity', 0);
      return;
    }
    var id = $c.data('id'),
      u = people[id];
    busy = true;
    api('POST', '/api/swipe/', { user_id: id, action: ACTION[dir] })
      .done(function (r) {
        left = r.likesLeft;
        updateStats(r.stats);
        if (dir === 'up') showToast('Super like sent to ' + u.name + '!', 'star-fill');
        if (r.match) setTimeout(function () { match(r.match); }, 550);
        fling($c, dir);
      })
      .fail(function () {
        $c.find('.stamp').css('opacity', 0);
        layout();
      })
      .always(function () {
        busy = false;
      });
  }
  function fling($c, dir) {
    var x = dir === 'left' ? -700 : dir === 'right' ? 700 : 0,
      y = dir === 'up' ? -900 : 60,
      r = dir === 'left' ? -30 : dir === 'right' ? 30 : 0;
    $c.find('.stamp.' + (dir === 'left' ? 'nope' : dir === 'right' ? 'like' : 'super')).css('opacity', 1);
    $c.css({
      transition: 'transform .5s cubic-bezier(.22,1,.36,1), opacity .5s',
      transform: 'translate(' + x + 'px,' + y + 'px) rotate(' + r + 'deg)',
      opacity: 0,
    });
    setTimeout(function () {
      $c.remove();
      layout();
      if (!top().length) $('#emptyDeck').fadeIn(300);
    }, 450);
  }
  function match(m) {
    if (!$('#miniMatches a').length) $('#miniMatches').empty();
    $('#miniMatches').prepend(miniMatch(m));
    $('#matchName').text(m.name);
    $('#matchImg').attr({ src: m.img, alt: m.name });
    $('#openChat').attr('href', '/messages/?id=' + m.id);
    $('#quickMsg').val('').data('match', m.id);
    var ice = ['Hey ' + m.name + '! 👋'];
    if (m.interests[0]) ice.push('Love your ' + m.interests[0] + ' vibe 🔥');
    if (m.interests[1]) ice.push('Best spot for ' + m.interests[1] + '?');
    $('#icebreakers').html(
      ice.map(function (t) {
        return '<button class="btn btn-sm" style="background:rgba(255,255,255,.18);color:#fff">' + esc(t) + '</button>';
      }).join(''),
    );
    bootstrap.Modal.getOrCreateInstance('#matchModal').show();
    confetti(110);
  }
  $('#icebreakers').on('click', 'button', function () {
    $('#quickMsg').val($(this).text()).focus();
  });
  function sendQuick() {
    var text = $.trim($('#quickMsg').val()),
      mid = $('#quickMsg').data('match');
    if (!text || !mid) return;
    $('#sendQuick').prop('disabled', true);
    api('POST', '/api/chats/' + mid + '/send/', { body: text })
      .done(function () {
        bootstrap.Modal.getInstance('#matchModal').hide();
        showToast('Message sent!', 'send-fill');
      })
      .always(function () {
        $('#sendQuick').prop('disabled', false);
      });
  }
  $('#sendQuick').on('click', sendQuick);
  $('#quickMsg').on('keydown', function (e) {
    if (e.key === 'Enter') sendQuick();
  });

  /* drag to swipe (mouse + touch) */
  var drag = null;
  $('#deck').on('pointerdown', '.swipe-card', function (e) {
    if (this !== top()[0] || busy || $(e.target).closest('a,button,.tapzone').length) return;
    drag = { el: $(this), x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    this.setPointerCapture(e.pointerId);
    $(this).css('transition', 'none');
  });
  $(document).on('pointermove', function (e) {
    if (!drag) return;
    drag.dx = e.clientX - drag.x;
    drag.dy = e.clientY - drag.y;
    drag.el.css('transform', 'translate(' + drag.dx + 'px,' + drag.dy + 'px) rotate(' + drag.dx / 18 + 'deg)');
    drag.el.find('.stamp.like').css('opacity', Math.max(0, drag.dx / 120));
    drag.el.find('.stamp.nope').css('opacity', Math.max(0, -drag.dx / 120));
    drag.el.find('.stamp.super').css('opacity', Math.max(0, -drag.dy / 140 - Math.abs(drag.dx) / 200));
  });
  $(document).on('pointerup pointercancel', function () {
    if (!drag) return;
    var d = drag;
    drag = null;
    if (d.dx > 110) swipe('right');
    else if (d.dx < -110) swipe('left');
    else if (d.dy < -130) swipe('up');
    else {
      d.el.find('.stamp').css('opacity', 0);
      layout();
    }
  });
  /* tap left/right side of the photo to flip through photos */
  $('#deck').on('click', '.tapzone', function () {
    var $card = $(this).closest('.swipe-card'),
      u = people[$card.data('id')],
      $b = $card.find('.bars i'),
      i = $b.index($b.filter('.on'));
    i = $(this).hasClass('r') ? Math.min(i + 1, u.photos.length - 1) : Math.max(i - 1, 0);
    $b.removeClass('on').eq(i).addClass('on');
    $card.find('img.main').attr('src', u.photos[i]);
  });

  $('#btnLike').on('click', function () { swipe('right'); });
  $('#btnPass').on('click', function () { swipe('left'); });
  $('#btnSuper').on('click', function () { swipe('up'); });
  $('#btnRewind').on('click', function () {
    showToast('Rewind is a Premium feature', 'gem');
  });
  $('#btnBoost,#boostCard').on('click', function () {
    showToast('Boost is a Premium feature', 'lightning-charge-fill');
  });
  $(document).on('keydown', function (e) {
    if ($(e.target).is('input,textarea') || $('.modal.show,.offcanvas.show').length) return;
    if (e.key === 'ArrowRight') swipe('right');
    if (e.key === 'ArrowLeft') swipe('left');
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      swipe('up');
    }
  });
  $('#reloadDeck').on('click', load);

  /* filter panel */
  $('#fAgeMin,#fAgeMax').on('input', function () {
    var a = +$('#fAgeMin').val(),
      b = +$('#fAgeMax').val();
    if (a > b) {
      if (this.id === 'fAgeMin') $('#fAgeMax').val(a);
      else $('#fAgeMin').val(b);
    }
    $('#fAgeOut').text($('#fAgeMin').val() + ' – ' + $('#fAgeMax').val());
  });
  $('#applyFilters').on('click', function () {
    filters = {
      min: +$('#fAgeMin').val(),
      max: +$('#fAgeMax').val(),
      global: !$('#fCity').is(':checked'),
      verified: $('#fVerified').is(':checked'),
      online: $('#fOnline').is(':checked'),
    };
    syncFilterUI();
    // Age range and city choice are remembered for next time.
    api('POST', '/api/filters/', { min: filters.min, max: filters.max, global: filters.global });
    load();
  });

  load();
});
