/* =========================================================
   register.html — page script
   Runs the 4-step wizard, checks each step, then submits the
   whole form to Django on the last step.
   ========================================================= */
$(function () {
  var $form = $('#regForm');
  var total = 4;
  var step = parseInt($form.data('error-step'), 10) || 1;

  /* ---------- helpers ---------- */
  function err(msg) {
    showToast(msg, 'exclamation-circle-fill');
  }

  function age() {
    var v = $('#rDob').val();
    if (!v) return 0;
    var d = new Date(v), n = new Date(), a = n.getFullYear() - d.getFullYear();
    if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--;
    return a;
  }

  function photoCount() {
    return $('#photoGrid input[type=file]').filter(function () { return this.files && this.files.length; }).length;
  }

  /* ---------- step display ---------- */
  function render() {
    $('.step').removeClass('active').filter('[data-step="' + step + '"]').addClass('active');
    $('.wizard-steps span').each(function (i) { $(this).toggleClass('done', i < step); });
    $('#stepLabel').text('Step ' + step + ' of ' + total);
    $('#stepName').text($('.step[data-step="' + step + '"]').data('name'));
    $('#prevBtn').css('visibility', step > 1 ? 'visible' : 'hidden');
    $('#nextBtn').html(step === total ? 'Create profile <i class="bi bi-check2"></i>' : 'Continue <i class="bi bi-arrow-right"></i>');
  }

  /* ---------- checks before moving on ---------- */
  function validate() {
    if (step === 1) {
      if (!$.trim($('#rName').val())) return err('Please add your first name'), false;
      if (!/^\S+@\S+\.\S+$/.test($('#rEmail').val())) return err('Please enter a valid email'), false;
      if ($('#rPass').val().length < 8) return err('Password needs 8+ characters'), false;
      if (!$('#rTerms').is(':checked')) return err('Please confirm you are 18+ and accept the terms'), false;
    }
    if (step === 2) {
      if (!$('input[name=gender]:checked').length) return err('Please choose how you identify'), false;
      if (!$('input[name=show_me]:checked').length) return err('Please choose who you want to see'), false;
      if (age() < 18) return err('You must be 18 or older to join'), false;
      if (!$('#rCity').val()) return err('Please choose your city'), false;
    }
    if (step === 3 && $('#interests .active').length < 3) return err('Pick at least 3 interests'), false;
    if (step === 4 && photoCount() < 2) return err('Please add at least 2 photos'), false;
    return true;
  }

  $('#nextBtn').on('click', function () {
    if (!validate()) return;
    if (step === total) {
      // Last step: send everything to Django
      $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>Creating your profile…');
      $form[0].submit();
      return;
    }
    step++;
    render();
    $('html, body').animate({ scrollTop: 0 }, 300);
  });

  $('#prevBtn').on('click', function () {
    if (step > 1) { step--; render(); }
  });

  // Enter key moves to the next step instead of submitting early
  $form.on('keydown', 'input', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $('#nextBtn').click(); }
  });

  /* ---------- step 1: password strength ---------- */
  $('#rPass').on('input', function () {
    var v = this.value, s = 0;
    if (v.length >= 8) s++;
    if (/[A-Z]/.test(v)) s++;
    if (/\d/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    $('#strength').css('width', s * 25 + '%');
    $('#strengthText').text('Strength: ' + ['Too short', 'Weak', 'Okay', 'Good', 'Strong'][s]);
  });

  /* ---------- step 2: age + looking for ---------- */
  var maxDob = new Date();
  maxDob.setFullYear(maxDob.getFullYear() - 18);
  $('#rDob').attr('max', maxDob.toISOString().slice(0, 10));
  $('#rDob').on('change', function () {
    var a = age();
    $('#ageOut').text(a ? 'You are ' + a + (a < 18 ? ' — you must be 18+' : '') : '').css('color', a < 18 ? '#E5484D' : '');
  }).trigger('change');

  $('#lookingFor').on('click keydown', '.chip', function (e) {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    $(this).addClass('active').siblings().removeClass('active');
    $('#rLooking').val($(this).data('value'));
  });
  $('#lookingFor .chip[data-value="' + $('#rLooking').val() + '"]').addClass('active');

  /* ---------- step 3: interests ---------- */
  function syncInterests() {
    var picked = $('#interests .active').map(function () { return $(this).data('value'); }).get();
    $('#rInterests').val(picked.join(','));
    $('#intCount').text(picked.length);
  }
  $('#rInterests').val().split(',').forEach(function (v) {
    if (v) $('#interests .chip[data-value="' + v + '"]').addClass('active');
  });
  syncInterests();

  $('#interests').on('click keydown', '.chip', function (e) {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (!$(this).hasClass('active') && $('#interests .active').length >= 8) return showToast('You can pick up to 8', 'info-circle-fill');
    $(this).toggleClass('active');
    syncInterests();
  });
  $('#intSearch').on('input', function () {
    var q = this.value.toLowerCase();
    $('#interests .chip').each(function () { $(this).toggle($(this).text().toLowerCase().indexOf(q) > -1); });
  });

  /* ---------- step 4: photos (each slot has its own file input) ---------- */
  $('#photoGrid').on('click keydown', '.photo-slot', function (e) {
    if ($(e.target).closest('.remove').length || $(e.target).is('input')) return;
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    $(this).find('input[type=file]')[0].click();
  });

  $('#photoGrid').on('change', 'input[type=file]', function () {
    var file = this.files[0], $slot = $(this).closest('.photo-slot');
    if (!file) return;
    if (!/^image\//.test(file.type)) { this.value = ''; return err('Please choose a photo (JPG or PNG)'); }
    if (file.size > 10 * 1024 * 1024) { this.value = ''; return err('Each photo must be under 10 MB'); }
    var reader = new FileReader();
    reader.onload = function (ev) {
      $slot.find('img').remove();
      $slot.addClass('filled').prepend($('<img alt="Your photo">').attr('src', ev.target.result));
    };
    reader.readAsDataURL(file);
  });

  $('#photoGrid').on('click', '.remove', function (e) {
    e.stopPropagation();
    var $slot = $(this).closest('.photo-slot');
    $slot.removeClass('filled').find('img').remove();
    $slot.find('input[type=file]').val('');
  });

  render();
});
