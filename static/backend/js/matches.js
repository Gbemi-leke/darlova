/* =========================================================
   matches.html — page script (data from the Django view)
   ========================================================= */
$(function () {
  var D = pageData(),
    urlTab = new URLSearchParams(location.search).get('tab') || D.tab,
    tab = ['matches', 'liked', 'visitors'].indexOf(urlTab) > -1 ? urlTab : 'matches';

  function counts() {
    var fresh = D.matches.filter(function (m) { return m.new; }).length;
    $('#cMatches').text(D.matches.length);
    $('#cLiked').text(D.likedCount).prop('hidden', !D.likedCount);
    $('#cVisitors').text(D.visitors.length).prop('hidden', !D.visitors.length);
    $('#newCount').text(fresh);
    $('#newChip').prop('hidden', !fresh);
    $('#likedTitle').text(D.likedCount + (D.likedCount === 1 ? ' person already likes you' : ' people already like you'));
  }

  /* recent matches strip */
  function stories() {
    if (!D.matches.length) {
      $('#stories').html('<p class="small text-muted-2 mb-0">No matches yet. <a href="/discover/">Start discovering</a> 💘</p>');
      return;
    }
    $('#stories').html(
      D.matches.slice(0, 12).map(function (m) {
        return (
          '<a class="story" href="/messages/?id=' + m.match_id + '"><div class="position-relative d-inline-block">' +
          '<span class="avatar-ring"><img class="avatar" src="' + esc(m.img) + '" alt=""></span>' +
          (m.new ? '<span class="new">NEW</span>' : '') + '</div>' +
          '<div class="small fw-semibold mt-1">' + esc(m.name) + '</div></a>'
        );
      }).join(''),
    );
  }

  function personCard(u, i, opts) {
    return (
      '<div class="col-6 col-md-4 col-xl-3" style="animation:pageIn .5s ' + i * 0.05 + 's both">' +
      '<div class="m-card hover-lift"><img src="' + esc(u.img) + '" alt="' + esc(u.name) + '">' +
      (u.compat ? '<span class="pct">' + u.compat + '% match</span>' : '') +
      (opts.match
        ? '<div class="quick"><a href="/messages/?id=' + u.match_id + '" aria-label="Message ' + esc(u.name) + '"><i class="bi bi-chat-fill"></i></a>' +
          '<button type="button" class="unmatch" data-match="' + u.match_id + '" data-name="' + esc(u.name) + '" aria-label="Unmatch ' + esc(u.name) + '"><i class="bi bi-x-lg"></i></button></div>'
        : '') +
      '<a href="/profile/?id=' + u.id + '" class="info d-block text-white text-decoration-none">' +
      '<div class="fw-bold fs-5 font-display">' + esc(u.name) + ', ' + u.age + ' ' + (u.online ? '<span class="dot-online"></span>' : '') + '</div>' +
      '<div class="small" style="opacity:.9"><i class="bi bi-geo-alt"></i> ' + esc(u.city) +
      (opts.when ? ' · ' + esc(u.when) : u.job ? ' · ' + esc(u.job) : '') + '</div></a></div></div>'
    );
  }

  function render() {
    var q = $('#mSearch').val().toLowerCase(),
      sort = $('#mSort').val(),
      html = '',
      empty = 'No one matches that search.';
    $('#likedBanner').toggleClass('d-none', tab !== 'liked' || !D.likedCount).toggleClass('d-flex', tab === 'liked' && !!D.likedCount);
    $('#mSearch,#mSort').closest('.d-flex').toggle(tab !== 'liked');

    if (tab === 'liked') {
      html = D.liked.map(function (l, i) {
        return (
          '<div class="col-6 col-md-4 col-xl-3" style="animation:pageIn .5s ' + i * 0.05 + 's both"><div class="m-card blurred">' +
          '<img src="' + esc(l.img) + '" alt="Hidden profile">' +
          '<a href="/premium/" class="lock-over text-white text-decoration-none"><i class="bi bi-' + (l.super ? 'star-fill' : 'lock-fill') + '"></i>' +
          '<strong>' + (l.super ? 'Someone super liked you' : 'Someone likes you') + '</strong><span class="small">Tap to reveal</span></a></div></div>'
        );
      }).join('');
      empty = 'No new likes yet. Complete your profile to get noticed.';
    } else {
      var list = (tab === 'matches' ? D.matches : D.visitors).filter(function (u) {
        return u.name.toLowerCase().indexOf(q) > -1;
      });
      if (sort === 'compat') list = list.slice().sort(function (a, b) { return (b.compat || 0) - (a.compat || 0); });
      if (sort === 'online') list = list.slice().sort(function (a, b) { return b.online - a.online; });
      html = list.map(function (u, i) { return personCard(u, i, { match: tab === 'matches', when: tab === 'visitors' }); }).join('');
      if (!q) empty = tab === 'matches' ? 'No matches yet. Like people on Discover. When they like you back, they show up here.'
        : 'No visitors in the last 30 days yet.';
    }
    $('#grid').html(html);
    $('#noResults').toggleClass('d-none', !!html);
    $('#noResultsText').text(empty);
  }

  $('[data-tab]').on('click', function () {
    $('[data-tab]').removeClass('active');
    $(this).addClass('active');
    tab = $(this).data('tab');
    history.replaceState(null, '', '?tab=' + tab);
    render();
  });
  $('#mSearch').on('input', render);
  $('#mSort').on('change', render);
  $('#grid').on('click', '.unmatch', function () {
    var id = $(this).data('match'),
      name = $(this).data('name');
    if (!confirm('Unmatch ' + name + "? Your chat will be deleted and you won't see each other again.")) return;
    api('POST', '/api/unmatch/', { match_id: id }).done(function () {
      D.matches = D.matches.filter(function (m) { return m.match_id !== id; });
      counts();
      stories();
      render();
      showToast('Unmatched ' + name, 'x-circle');
    });
  });

  $('[data-tab]').removeClass('active').filter('[data-tab="' + tab + '"]').addClass('active');
  counts();
  stories();
  render();
});
