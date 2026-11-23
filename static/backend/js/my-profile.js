/* =========================================================
   my-profile.html — edit your profile
   Photos save straight away; text fields save with the Save button.
   ========================================================= */
$(function () {
  var D = pageData(),
    photos = D.photos, // [{id, url}]
    picked = D.interests.slice(),
    MAX = D.maxPhotos,
    uploading = false;

  /* ---------- photos ---------- */
  function renderPhotos() {
    var html = '';
    for (var i = 0; i < MAX; i++) {
      var p = photos[i];
      html +=
        '<div class="col-4 col-md-2"><div class="photo-slot ' + (p ? 'filled' : '') + '" data-i="' + i + '"' +
        (p ? ' data-id="' + p.id + '"' : ' role="button" tabindex="0" aria-label="Add photo"') + '>' +
        (p ? '<img src="' + esc(p.url) + '" alt="Your photo ' + (i + 1) + '">' : '<i class="bi bi-plus-lg fs-4"></i>') +
        (p && i === 0 ? '<span class="main-badge">MAIN</span>' : '') +
        (p
          ? '<div class="tools">' +
            (i > 0 ? '<button type="button" class="make-main" aria-label="Make main photo"><i class="bi bi-star-fill"></i></button>' : '') +
            '<button type="button" class="del" aria-label="Remove photo"><i class="bi bi-x"></i></button></div>'
          : '') +
        '</div></div>';
    }
    $('#photos').html(html);
    if (photos[0]) {
      $('#meAvatar').attr('src', photos[0].url);
      $('.app-topbar .avatar').attr('src', photos[0].url);
    }
    strength();
  }
  $('#photos').on('click keydown', '.photo-slot:not(.filled)', function (e) {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    if (uploading) return showToast('Still uploading the last photo…', 'hourglass-split');
    $('#pInput').trigger('click');
  });
  $('#pInput').on('change', function () {
    var f = this.files[0];
    this.value = '';
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return showToast('Photos must be under 10 MB', 'exclamation-circle-fill');
    var fd = new FormData();
    fd.append('photo', f);
    uploading = true;
    var $slot = $('#photos .photo-slot:not(.filled)').first().html('<span class="spinner-border text-brand"></span>');
    api('POST', '/api/photos/', fd)
      .done(function (r) {
        photos = r.photos;
        showToast('Photo added', 'image');
      })
      .always(function () {
        uploading = false;
        renderPhotos();
      });
  });
  $('#photos').on('click', '.del', function (e) {
    e.stopPropagation();
    if (photos.length <= 1) return showToast('Keep at least one photo so people can see you', 'exclamation-circle-fill');
    if (!confirm('Remove this photo?')) return;
    var id = $(this).closest('.photo-slot').data('id');
    api('POST', '/api/photos/' + id + '/delete/').done(function (r) {
      photos = r.photos;
      renderPhotos();
      showToast('Photo removed', 'trash');
    });
  });
  $('#photos').on('click', '.make-main', function (e) {
    e.stopPropagation();
    var id = $(this).closest('.photo-slot').data('id');
    api('POST', '/api/photos/' + id + '/main/').done(function (r) {
      photos = r.photos;
      renderPhotos();
      showToast('Main photo updated', 'star-fill');
    });
  });

  /* ---------- interests ---------- */
  function renderInterests() {
    $('#eInterests').html(D.allInterests.map(function (t) {
      return '<span class="chip chip-select ' + (picked.indexOf(t) > -1 ? 'active' : '') + '" role="button" tabindex="0">' + esc(t) + '</span>';
    }).join(''));
    $('#iCount').text(picked.length);
  }
  $('#eInterests').on('click keydown', '.chip', function (e) {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    var t = $(this).text(),
      i = picked.indexOf(t);
    if (i > -1) picked.splice(i, 1);
    else {
      if (picked.length >= 8) return showToast('Up to 8 interests', 'info-circle-fill');
      picked.push(t);
    }
    renderInterests();
    dirty();
  });

  /* ---------- profile strength ---------- */
  function strength() {
    var checks = [
      ['Add at least 3 photos', photos.length >= 3],
      ['Write a bio (50+ characters)', $('#eBio').val().length >= 50],
      ['Add your job title', !!$.trim($('#eJob').val())],
      ['Pick 5+ interests', picked.length >= 5],
      ['Add your education', !!$.trim($('#eEdu').val())],
      ['Answer 2 prompts', !!($('#eP1q').val() && $.trim($('#eP1a').val()) && $('#eP2q').val() && $.trim($('#eP2a').val()))],
    ];
    var done = checks.filter(function (c) { return c[1]; }).length,
      pct = Math.round((done / checks.length) * 100);
    $('#ringArc').css('stroke-dashoffset', 351.86 * (1 - pct / 100));
    $('#ringVal').text(pct + '%');
    $('#checklist').html(checks.map(function (c) {
      return '<li class="d-flex gap-2 align-items-center ' + (c[1] ? 'text-muted-2 text-decoration-line-through' : '') + '"><i class="bi ' +
        (c[1] ? 'bi-check-circle-fill text-success' : 'bi-circle text-brand') + '"></i>' + c[0] + '</li>';
    }).join(''));
  }

  /* ---------- save ---------- */
  // The save bar only shows when something really differs from what's saved
  // (phones can fire "input" events on load, e.g. from autofill).
  function snapshot() {
    return JSON.stringify($('.track').map(function () { return $(this).val(); }).get().concat(picked.slice().sort()));
  }
  var saved = null;
  function dirty() {
    if (saved === null) return;
    $('#saveBar').toggleClass('show', snapshot() !== saved);
    strength();
  }
  function save() {
    if (picked.length < 3) return showToast('Pick at least 3 interests', 'exclamation-circle-fill');
    var $b = $('#saveBtn,#saveTop').prop('disabled', true);
    api('POST', '/api/profile/', {
      first_name: $('#eName').val(),
      job_title: $('#eJob').val(),
      bio: $('#eBio').val(),
      looking_for: $('#eLook').val(),
      city: $('#eCity').val(),
      height: $('#eHeight').val(),
      education: $('#eEdu').val(),
      languages: $('#eLang').val(),
      interests: picked,
      prompt1_q: $('#eP1q').val(),
      prompt1_a: $('#eP1a').val(),
      prompt2_q: $('#eP2q').val(),
      prompt2_a: $('#eP2a').val(),
    })
      .done(function (r) {
        saved = snapshot();
        $('#saveBar').removeClass('show');
        $('#meName').text(r.name);
        $('#meCity').text($('#eCity').val());
        showToast('Profile saved', 'check-circle-fill');
      })
      .always(function () {
        $b.prop('disabled', false);
      });
  }
  $('#eBio').on('input', function () { $('#bioCount').text(this.value.length); });
  $(document).on('input change', '.track', dirty);
  $('#saveBtn,#saveTop').on('click', save);
  $('#discard').on('click', function () {
    $('#saveBar').removeClass('show');
    location.reload();
  });
  $(window).on('beforeunload', function () {
    if ($('#saveBar').hasClass('show')) return 'You have unsaved changes';
  });

  renderPhotos();
  renderInterests();
  $('#bioCount').text($('#eBio').val().length);
  saved = snapshot();
  setTimeout(strength, 300);
});
