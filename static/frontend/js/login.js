/* =========================================================
   login.html — page script
   Checks the fields before sending; Django does the real login.
   ========================================================= */
$(function () {
  // Rotating photo on the left panel: most-liked members (from the Django view)
  var imgs = [];
  try {
    imgs = JSON.parse(document.getElementById('side-photos').textContent) || [];
  } catch (e) {}
  var i = 0;
  if (imgs.length > 1) setInterval(function () {
    i = (i + 1) % imgs.length;
    $('#sideImg').css('opacity', 0);
    setTimeout(function () {
      $('#sideImg').attr('src', imgs[i]).css('opacity', 1);
    }, 700);
  }, 5000);

  function showError($input, $msg, show) {
    $input.toggleClass('is-invalid', show);
    $msg.toggleClass('d-block', show);
  }

  function check() {
    var hasId = $.trim($('#email').val()).length > 0;
    var hasPass = $('#password').val().length > 0;
    showError($('#email'), $('#emailErr'), !hasId);
    showError($('#password'), $('#passErr'), !hasPass);
    return hasId && hasPass;
  }

  $('#email, #password').on('input', function () {
    if ($(this).hasClass('is-invalid')) check();
  });

  $('#loginForm').on('submit', function (e) {
    if (!check()) {
      e.preventDefault();
      var $card = $('.auth-card').removeClass('animate-shake');
      void $card[0].offsetWidth; // restart the shake animation
      $card.addClass('animate-shake');
      return;
    }
    // Valid: let the form go to Django, show a spinner meanwhile
    $('#loginBtn').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span> Logging in…');
  });
});
