/* =========================================================
   premium.html — page script
   ========================================================= */
$(function () {
  var period = 'monthly';
  function naira(n) {
    return '₦' + Math.round(n).toLocaleString('en-NG');
  }
  function animate($el, to) {
    var from = parseInt($el.data('cur') || $el.data('monthly'), 10) || 0;
    $({ v: from }).animate(
      { v: to },
      {
        duration: 600,
        step: function (v) {
          $el.text(naira(v));
        },
        complete: function () {
          $el.text(naira(to));
        },
      },
    );
    $el.data('cur', to);
  }
  function update() {
    $('.price[data-monthly]').each(function () {
      var m = +$(this).data('monthly'),
        val = period === 'yearly' ? m * 12 * 0.8 : m;
      animate($(this), val);
      $(this)
        .siblings('.per')
        .text(period === 'yearly' ? ' /year' : ' /month');
      $(this)
        .siblings('.save')
        .text(period === 'yearly' ? 'You save ' + naira(m * 12 * 0.2) + ' a year' : '');
    });
    var $a = $('.billing-toggle button.active');
    $('.billing-toggle .pill').css({ left: $a.position().left, width: $a.outerWidth() });
  }
  $('.billing-toggle button').on('click', function () {
    $(this).addClass('active').siblings('button').removeClass('active');
    period = $(this).data('bill');
    update();
  });
  setTimeout(update, 50);
  $(window).on('resize', update);

  var modal = new bootstrap.Modal('#checkout');
  $('[data-plan]').on('click', function () {
    var $p = $(this).closest('.plan').find('.price');
    $('#coPlan').text($(this).data('plan'));
    $('#coPrice').text($p.text());
    $('#coPeriod').text(period === 'yearly' ? 'Billed yearly' : 'Billed monthly');
    modal.show();
  });
  $('#payBtn').on('click', function () {
    var $b = $(this)
      .prop('disabled', true)
      .html('<span class="spinner-border spinner-border-sm me-2"></span>Processing…');
    setTimeout(function () {
      modal.hide();
      $b.prop('disabled', false).html('<i class="bi bi-lock-fill me-1"></i> Pay securely');
      confetti(100);
      showToast('Welcome to ' + $('#coPlan').text() + '! (demo)', 'gem');
    }, 1400);
  });
});
