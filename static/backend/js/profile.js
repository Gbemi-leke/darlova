/* =========================================================
   profile.html — another member's profile (data from the view)
   ========================================================= */
$(function () {
  var u = pageData();

  /* gallery */
  $('#galInner').html(u.photos.map(function (p, i) {
    return '<div class="carousel-item ' + (i ? '' : 'active') + '"><img src="' + esc(p) + '" alt="Photo ' + (i + 1) + ' of ' + esc(u.name) + '"></div>';
  }).join(''));
  $('#galInd').html(u.photos.length > 1 ? u.photos.map(function (p, i) {
    return '<button type="button" data-bs-target="#gal" data-bs-slide-to="' + i + '" class="' + (i ? '' : 'active') + '" aria-label="Photo ' + (i + 1) + '"></button>';
  }).join('') : '');
  $('#gal .carousel-control-prev,#gal .carousel-control-next').toggle(u.photos.length > 1);

  /* details */
  $('#pName').text(u.name + ', ' + u.age);
  $('.pn').text(u.name);
  $('#pJob').text(u.job || 'Darlova member').prev('i').toggle(!!u.job);
  $('#pCity').text(u.city);
  $('#pBio').text(u.bio || u.name + " hasn't written a bio yet.").toggleClass('text-muted-2', !u.bio);
  $('#pVerified').toggle(u.verified);
  $('#pOnline').html(
    u.online
      ? '<span class="chip" style="background:rgba(34,197,94,.14);color:#16A34A"><span class="dot-online" style="border:none"></span> Online now</span>'
      : u.status ? '<span class="chip chip-outline">' + esc(u.status) + '</span>' : '',
  );
  $('#pInterests').html(u.interests.map(function (t) {
    var shared = u.shared.indexOf(t) > -1;
    return '<span class="chip ' + (shared ? '' : 'chip-outline') + '">' + (shared ? '<i class="bi bi-heart-fill"></i> ' : '') + esc(t) + '</span>';
  }).join(''));

  var facts = [
    ['bi-search-heart', 'Looking for', u.looking],
    ['bi-rulers', 'Height', u.height],
    ['bi-mortarboard', 'Education', u.education],
    ['bi-translate', 'Speaks', u.languages],
    ['bi-calendar-heart', 'Member since', u.joined],
  ].filter(function (f) { return f[2]; });
  $('#facts').html(facts.map(function (f) {
    return '<div class="col-sm-6 reveal in"><div class="fact"><i class="bi ' + f[0] + '"></i><div><div class="small text-muted-2">' + f[1] +
      '</div><div class="fw-semibold">' + esc(f[2]) + '</div></div></div></div>';
  }).join(''));
  $('#prompts').html(u.prompts.map(function (p) {
    return '<div class="glass prompt reveal in"><div class="q">' + esc(p[0]) + '</div><div class="a">' + esc(p[1]) + '</div></div>';
  }).join(''));

  /* compatibility ring */
  var n = 0, t = setInterval(function () {
    n++;
    $('#compat').css('--p', n);
    $('#compatNum').text(n + '%');
    if (n >= u.compat) clearInterval(t);
  }, 14);

  /* like / pass / super, or Message if you're already matched */
  function showMatched(matchId) {
    $('#pActions').prop('hidden', true);
    $('#pMatched').prop('hidden', false);
    $('#pMessage').attr('href', '/messages/?id=' + matchId);
  }
  if (u.matchId) showMatched(u.matchId);
  else if (u.myDecision === 'like' || u.myDecision === 'super') {
    $('#pLike,#pSuper').prop('disabled', true);
    $('#pLike').attr('title', 'You already liked ' + u.name);
  }
  function act(action) {
    $('#pActions button').prop('disabled', true);
    api('POST', '/api/swipe/', { user_id: u.id, action: action })
      .done(function (r) {
        if (r.match) {
          confetti(110);
          showToast("It's a match with " + u.name + '! 🎉', 'heart-fill');
          showMatched(r.match.id);
          return;
        }
        if (action === 'pass') return location.assign('/discover/');
        if (action === 'like') confetti(60);
        showToast(action === 'super' ? 'Super like sent to ' + u.name + ' ⭐' : 'You liked ' + u.name + '!', action === 'super' ? 'star-fill' : 'heart-fill');
        setTimeout(function () { location.assign('/discover/'); }, 1300);
      })
      .fail(function () { $('#pActions button').prop('disabled', false); });
  }
  $('#pLike').on('click', function () { act('like'); });
  $('#pSuper').on('click', function () { act('super'); });
  $('#pPass').on('click', function () { act('pass'); });

  $('#copyLink').on('click', function () {
    if (navigator.clipboard) navigator.clipboard.writeText(location.href);
    showToast('Profile link copied', 'clipboard-check');
  });
  $('#confirmBlock').on('click', function () {
    api('POST', '/api/block/', { user_id: u.id }).done(function () {
      bootstrap.Modal.getInstance('#blockModal').hide();
      showToast(u.name + ' has been blocked', 'slash-circle');
      setTimeout(function () { location.assign('/discover/'); }, 1200);
    });
  });
  $('#reportModal').data('user', u.id).find('.report-name').text(u.name);
  $('#reportForm').on('submit', function (e) {
    e.preventDefault();
    var f = this;
    api('POST', '/api/report/', {
      user_id: u.id,
      reason: $(f).find('[name=reason]:checked').val(),
      details: f.details.value,
      block: f.block.checked,
    }).done(function () {
      bootstrap.Modal.getInstance('#reportModal').hide();
      showToast('Thanks. Our team will review this report.', 'shield-check');
      if (f.block.checked) setTimeout(function () { location.assign('/discover/'); }, 1200);
    });
  });
});
