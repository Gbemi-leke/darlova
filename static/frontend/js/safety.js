/* =========================================================
   safety.html — page script
   ========================================================= */
$(function () {
  $('#rpMsg').on('input', function () {
    $('#rpCount').text(this.value.length);
  });
  $('#reportForm').on('submit', function (e) {
    e.preventDefault();
    var ok = true;
    ['#rpUser', '#rpReason'].forEach(function (s) {
      var v = $.trim($(s).val());
      $(s).toggleClass('is-invalid', !v);
      if (!v) ok = false;
    });
    if (!ok) return showToast('Please fill in the required fields', 'exclamation-circle-fill');
    this.reset();
    $('#rpCount').text(0);
    showToast('Thank you. Our team will review this report.', 'shield-check');
  });
});
