/* =========================================================
   settings.html — every control saves to your account
   ========================================================= */
$(function () {
  /* scrollspy-style highlight */
  var $links = $('#setNav .nav-link');
  $(window).on('scroll', function () {
    var y = $(window).scrollTop() + 140,
      cur = 'account';
    $('section[id]').each(function () {
      if ($(this).offset().top <= y) cur = this.id;
    });
    $links.removeClass('active').filter('[href="#' + cur + '"]').addClass('active');
  });

  /* reduce motion (this device only) */
  try {
    if (localStorage.getItem('lv-rm') === '1') {
      $('#reduceMotion').prop('checked', true);
      $('body').addClass('rm');
    }
  } catch (e) {}
  $('<style>.rm *{animation:none!important;transition:none!important}</style>').appendTo('head');
  $('#reduceMotion').on('change', function () {
    $('body').toggleClass('rm', this.checked);
    try {
      localStorage.setItem('lv-rm', this.checked ? '1' : '0');
    } catch (e) {}
    showToast(this.checked ? 'Animations reduced' : 'Animations on', 'magic');
  });

  /* account */
  $('#accForm').on('submit', function (e) {
    e.preventDefault();
    var $b = $(this).find('button').prop('disabled', true);
    api('POST', '/api/settings/account/', { email: $('#sEmail').val(), phone: $('#sPhone').val(), city: $('#sCity').val() })
      .done(function () { showToast('Account details saved', 'check-circle-fill'); })
      .always(function () { $b.prop('disabled', false); });
  });

  /* switches save instantly */
  $('.sw[data-pref]').on('change', function () {
    var el = this,
      data = {};
    data[$(el).data('pref')] = el.checked;
    api('POST', '/api/settings/prefs/', data)
      .done(function () {
        showToast('Saved', 'check-circle-fill');
        if ($(el).data('pref') === 'is_visible') $('#pauseBtn').text(el.checked ? 'Pause instead' : 'Profile paused · Resume');
      })
      .fail(function () { el.checked = !el.checked; });
  });

  /* age range */
  $('#dMin,#dMax')
    .on('input', function () {
      var a = +$('#dMin').val(),
        b = +$('#dMax').val();
      if (a > b) {
        if (this.id === 'dMin') $('#dMax').val(a);
        else $('#dMin').val(b);
      }
      $('#dAgeOut').text($('#dMin').val() + ' – ' + $('#dMax').val());
    })
    .on('change', function () {
      api('POST', '/api/settings/prefs/', { age_min: +$('#dMin').val(), age_max: +$('#dMax').val() }).done(function () {
        showToast('Age range saved', 'check-circle-fill');
      });
    });

  $('#incog').on('change', function () {
    if (this.checked) {
      this.checked = false;
      showToast('Incognito is a Premium feature', 'gem');
    }
  });

  /* password */
  $('#pwForm').on('submit', function (e) {
    e.preventDefault();
    var f = this;
    if (f.new.value.length < 8) return showToast('New password needs 8+ characters', 'exclamation-circle-fill');
    var $b = $(f).find('button').prop('disabled', true);
    api('POST', '/api/settings/password/', { current: f.current.value, new: f.new.value })
      .done(function () {
        f.reset();
        $('#pwBox').collapse('hide');
        showToast('Password updated', 'key-fill');
      })
      .always(function () { $b.prop('disabled', false); });
  });
  $('#signoutOthers').on('click', function () {
    api('POST', '/api/settings/signout-others/').done(function (r) {
      showToast(r.removed ? 'Logged out of ' + r.removed + ' other device' + (r.removed > 1 ? 's' : '') : 'No other devices were logged in', 'shield-check');
    });
  });

  /* blocked members */
  $('#blockedList').on('click', '.unblock', function () {
    var $row = $(this).closest('[data-user]');
    api('POST', '/api/unblock/', { user_id: $row.data('user') }).done(function () {
      $row.remove();
      var n = $('#blockedList [data-user]').length;
      $('#blockedCount').text(n ? n + ' blocked' : 'No one blocked');
      showToast('Unblocked', 'check-circle-fill');
      if (!n) bootstrap.Modal.getInstance('#blockedModal').hide();
    });
  });

  /* browser push permission (alerts themselves come later) */
  $('#pushBtn').on('click', function () {
    if (!('Notification' in window)) return showToast('Push not supported in this browser', 'exclamation-circle-fill');
    Notification.requestPermission().then(function (p) {
      showToast(p === 'granted' ? 'Push notifications allowed' : 'Push notifications blocked', p === 'granted' ? 'bell-fill' : 'bell-slash');
    });
  });

  /* pause / delete */
  $('#pauseBtn').on('click', function () {
    var $sw = $('.sw[data-pref="is_visible"]');
    $sw.prop('checked', !$sw.prop('checked')).trigger('change');
  });
  $('#delInput').on('input', function () {
    $('#delBtn').prop('disabled', this.value !== 'DELETE');
  });
  $('#delBtn').on('click', function () {
    var $b = $(this).prop('disabled', true);
    api('POST', '/api/settings/delete/', { confirm: $('#delInput').val(), password: $('#delPass').val() })
      .done(function () {
        bootstrap.Modal.getInstance('#delModal').hide();
        showToast('Your account has been deleted', 'trash');
        setTimeout(function () { location.href = '/'; }, 1300);
      })
      .fail(function () { $b.prop('disabled', false); });
  });
});
