/* =========================================================
   forgot-password.html — email code → verify → new password
   ========================================================= */
$(function () {
  function go(n) {
    $('.step').removeClass('active');
    $('#s' + n).addClass('active');
  }
  function post(url, data) {
    return $.ajax({
      url: url,
      method: 'POST',
      data: JSON.stringify(data),
      contentType: 'application/json',
      dataType: 'json',
      headers: { 'X-CSRFToken': $('meta[name="csrf-token"]').attr('content') },
    });
  }
  function errText(xhr) {
    return (xhr.responseJSON && xhr.responseJSON.error) || 'Network problem. Please try again.';
  }
  for (var i = 0; i < 6; i++)
    $('#otp').append('<input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="1" class="form-control" aria-label="Digit ' + (i + 1) + '">');

  /* step 1: ask for a code */
  var email = '';
  function requestCode($btn) {
    var label = $btn.html();
    $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>Sending…');
    return post('/api/password/request/', { email: email })
      .done(function () {
        $('#sentTo').text(email);
        go(2);
        $('#otp input').val('').first().trigger('focus');
        $('#otpError').text('');
        countdown();
      })
      .fail(function (xhr) { showToast(errText(xhr), 'exclamation-circle-fill'); })
      .always(function () { $btn.prop('disabled', false).html(label); });
  }
  $('#f1').on('submit', function (e) {
    e.preventDefault();
    email = $.trim($('#fEmail').val());
    if (!/^\S+@\S+\.\S+$/.test(email)) return $('#fEmail').addClass('is-invalid');
    $('#fEmail').removeClass('is-invalid');
    requestCode($(this).find('button'));
  });

  /* step 2: enter the code */
  $('#otp')
    .on('input', 'input', function () {
      this.value = this.value.replace(/\D/g, '');
      if (this.value) $(this).next().trigger('focus');
      checkOtp();
    })
    .on('keydown', 'input', function (e) {
      if (e.key === 'Backspace' && !this.value) $(this).prev().trigger('focus');
      if (e.key === 'Enter' && !$('#verify').prop('disabled')) $('#verify').trigger('click');
    })
    .on('paste', 'input', function (e) {
      var t = (e.originalEvent.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      $('#otp input').each(function (i) { this.value = t[i] || ''; });
      checkOtp();
      e.preventDefault();
    });
  function code() {
    return $('#otp input').toArray().map(function (i) { return i.value; }).join('');
  }
  function checkOtp() {
    $('#verify').prop('disabled', code().length !== 6);
  }
  $('#verify').on('click', function () {
    var $b = $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>Verifying…');
    post('/api/password/verify/', { code: code() })
      .done(function () {
        go(3);
        $('#np').trigger('focus');
      })
      .fail(function (xhr) {
        $('#otpError').text(errText(xhr));
        $('#otp input').val('').first().trigger('focus');
      })
      .always(function () { $b.html('Verify code'); checkOtp(); });
  });
  var timer;
  function countdown() {
    var c = 30;
    clearInterval(timer);
    $('#resend').prop('disabled', true).html('Resend in <span id="count">30</span>s');
    timer = setInterval(function () {
      c--;
      $('#count').text(c);
      if (c <= 0) {
        clearInterval(timer);
        $('#resend').prop('disabled', false).text('Resend code');
      }
    }, 1000);
  }
  $('#resend').on('click', function () {
    requestCode($(this)).done(function () { showToast('New code sent', 'envelope-check'); });
  });

  /* step 3: new password */
  $('#np').on('input', function () {
    var v = this.value, s = 0;
    if (v.length >= 8) s++;
    if (/[A-Z]/.test(v)) s++;
    if (/\d/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    $('#strength').css('width', s * 25 + '%');
    $('#strengthText').text('Strength: ' + ['Too short', 'Weak', 'Okay', 'Good', 'Strong'][s]);
    $(this).removeClass('is-invalid');
    $('#pwError').text('');
  });
  $('#f3').on('submit', function (e) {
    e.preventDefault();
    var pw = $('#np').val();
    if (pw.length < 8) return $('#np').addClass('is-invalid');
    var $b = $(this).find('button[type!=button]').prop('disabled', true);
    post('/api/password/reset/', { password: pw })
      .done(function () {
        go(4);
        confetti(60);
      })
      .fail(function (xhr) { $('#pwError').text(errText(xhr)); })
      .always(function () { $b.prop('disabled', false); });
  });
});
