/* =========================================================
   DARLOVA TEMPLATE — BASE SCRIPT (shared by every page)
   Theme (light/dark/system), reveal animations, toasts, ripple…
   ========================================================= */
(function ($) {
  'use strict';
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  /* ---- THEME ---- */
  function getMode() {
    try {
      return localStorage.getItem('lv-theme') || 'system';
    } catch (e) {
      return 'system';
    }
  }
  function applyTheme(mode) {
    var dark = mode === 'dark' || (mode === 'system' && mq.matches);
    document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-mode', mode);
    $('[data-theme-set]').removeClass('active').attr('aria-pressed', 'false');
    $('[data-theme-set="' + mode + '"]')
      .addClass('active')
      .attr('aria-pressed', 'true');
    $('[data-theme-radio]')
      .prop('checked', false)
      .filter('[value="' + mode + '"]')
      .prop('checked', true);
    $('.theme-label').text(mode === 'system' ? 'System (' + (dark ? 'dark' : 'light') + ')' : dark ? 'Dark' : 'Light');
  }
  window.setTheme = function (mode) {
    try {
      localStorage.setItem('lv-theme', mode);
    } catch (e) {}
    applyTheme(mode);
  };
  var onSystemChange = function () {
    if (getMode() === 'system') applyTheme('system');
  };
  if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
  else if (mq.addListener) mq.addListener(onSystemChange);

  /* ---- TOASTS ---- */
  window.showToast = function (msg, icon) {
    var $stack = $('.toast-stack');
    if (!$stack.length) {
      $stack = $('<div class="toast-stack" aria-live="polite"></div>').appendTo('body');
    }
    var $t = $(
      '<div class="toast-x glass-strong"><i class="bi bi-' +
        (icon || 'check-circle-fill') +
        '"></i><span></span></div>',
    );
    $t.find('span').text(msg);
    $stack.append($t);
    setTimeout(function () {
      $t.addClass('out');
      setTimeout(function () {
        $t.remove();
      }, 350);
    }, 3200);
  };

  /* ---- SERVER HELPERS ---- */
  /* Escape text before putting it into HTML (names, bios, messages come from members). */
  window.esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  /* JSON data a Django view put on the page with {{ page_data|json_script:"page-data" }} */
  window.pageData = function () {
    var el = document.getElementById('page-data');
    return el ? JSON.parse(el.textContent) : {};
  };
  /* Call the Darlova API: api('POST', '/api/swipe/', {user_id: 4}).done(fn) */
  window.api = function (method, url, data) {
    var opts = {
      url: url,
      method: method,
      headers: { 'X-CSRFToken': $('meta[name="csrf-token"]').attr('content') },
      dataType: 'json',
    };
    if (data instanceof FormData) {
      opts.data = data;
      opts.processData = false;
      opts.contentType = false;
    } else if (method === 'GET') {
      opts.data = data;
    } else {
      opts.data = JSON.stringify(data || {});
      opts.contentType = 'application/json';
    }
    return $.ajax(opts).fail(function (xhr) {
      if (xhr.statusText === 'abort') return;
      var msg = (xhr.responseJSON && xhr.responseJSON.error) || 'Network problem. Please try again.';
      if (xhr.status === 401) location.href = '/login/?next=' + encodeURIComponent(location.pathname + location.search);
      else showToast(msg, 'exclamation-circle-fill');
    });
  };
  /* "14:05" today, "Mon 14:05" this week, "12 Nov" older */
  window.timeLabel = function (iso) {
    var d = new Date(iso),
      now = new Date(),
      t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return t;
    if (now - d < 6 * 864e5) return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + t;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  /* ---- CONFETTI ---- */
  window.confetti = function (count) {
    var colors = ['#D81B60', '#7C3AED', '#FF8AB0', '#C4B1FF', '#FFD166', '#5EC8FF'];
    for (var i = 0; i < (count || 90); i++) {
      var $c = $('<span class="confetti"></span>')
        .css({
          left: Math.random() * 100 + 'vw',
          background: colors[i % colors.length],
          animationDuration: 2.2 + Math.random() * 2 + 's',
          animationDelay: Math.random() * 0.6 + 's',
          transform: 'rotate(' + Math.random() * 360 + 'deg)',
        })
        .appendTo('body');
      (function ($el) {
        setTimeout(function () {
          $el.remove();
        }, 5000);
      })($c);
    }
  };

  $(function () {
    applyTheme(getMode());
    $(document).on('click', '[data-theme-set]', function () {
      setTheme($(this).data('theme-set'));
    });
    $(document).on('change', '[data-theme-radio]', function () {
      setTheme(this.value);
    });

    /* reveal on scroll */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              e.target.classList.add('in');
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12 },
      );
      $('.reveal').each(function () {
        io.observe(this);
      });
    } else {
      $('.reveal').addClass('in');
    }

    /* ripple on buttons */
    $(document).on('click', '.btn-brand,.btn-gradient', function (e) {
      var $b = $(this),
        o = $b.offset(),
        s = Math.max($b.outerWidth(), $b.outerHeight());
      $('<span class="ripple"></span>')
        .css({ width: s, height: s, left: e.pageX - o.left - s / 2, top: e.pageY - o.top - s / 2 })
        .appendTo($b);
      setTimeout(function () {
        $b.find('.ripple').first().remove();
      }, 600);
    });

    /* navbar shadow on scroll + back to top */
    var $nav = $('.navbar-glass'),
      $top = $('.to-top');
    var ticking = false,
      wasScrolled = null,
      wasShown = null;
    $(window).on('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY,
          scrolled = y > 10,
          shown = y > 500;
        if (scrolled !== wasScrolled) $nav.toggleClass('scrolled', (wasScrolled = scrolled));
        if (shown !== wasShown) $top.toggleClass('show', (wasShown = shown));
        ticking = false;
      });
    });
    $top.on('click', function () {
      $('html,body').animate({ scrollTop: 0 }, 500);
    });

    /* highlight current page in menus */
    var page = location.pathname;
    $('[data-page]').each(function () {
      if ($(this).data('page') === page) {
        $(this).addClass('active').attr('aria-current', 'page');
      }
    });

    /* show / hide password */
    $(document).on('click', '.toggle-pass', function () {
      var $i = $(this).siblings('input'),
        show = $i.attr('type') === 'password';
      $i.attr('type', show ? 'text' : 'password');
      $(this).find('i').toggleClass('bi-eye bi-eye-slash');
      $(this).attr('aria-label', show ? 'Hide password' : 'Show password');
    });

    /* tooltips */
    $('[data-bs-toggle="tooltip"]').each(function () {
      new bootstrap.Tooltip(this);
    });

    /* current year */
    $('.js-year').text(new Date().getFullYear());

    /* demo-only links */
    $(document).on('click', '[data-demo]', function (e) {
      e.preventDefault();
      showToast($(this).data('demo'), 'info-circle-fill');
    });
  });
})(jQuery);
