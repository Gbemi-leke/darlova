/* =========================================================
   search.html — find members by first name (live as you type)
   ========================================================= */
$(function () {
  var D = pageData(),
    req = null,
    timer = null;

  function card(u, i) {
    return (
      '<div class="col-6 col-md-4 col-xl-3" style="animation:pageIn .4s ' + i * 0.04 + 's both">' +
      '<div class="m-card hover-lift"><img src="' + esc(u.img) + '" alt="' + esc(u.name) + '">' +
      (u.match_id ? '<span class="pct"><i class="bi bi-heart-fill"></i> Matched</span>' : u.compat ? '<span class="pct">' + u.compat + '% match</span>' : '') +
      (u.match_id ? '<div class="quick"><a href="/messages/?id=' + u.match_id + '" aria-label="Message ' + esc(u.name) + '"><i class="bi bi-chat-fill"></i></a></div>' : '') +
      '<a href="/profile/?id=' + u.id + '" class="info d-block text-white text-decoration-none">' +
      '<div class="fw-bold fs-5 font-display">' + esc(u.name) + ', ' + u.age + ' ' + (u.online ? '<span class="dot-online"></span>' : '') + '</div>' +
      '<div class="small" style="opacity:.9"><i class="bi bi-geo-alt"></i> ' + esc(u.city) + (u.job ? ' · ' + esc(u.job) : '') + '</div></a></div></div>'
    );
  }
  function render(q, results) {
    $('#results').html(results.map(card).join(''));
    var empty = !results.length;
    $('#noResults').toggleClass('d-none', !empty);
    $('#noResultsText').text(q.length < 2 ? 'Type at least 2 letters of a first name.' : 'No one called "' + q + '" that you can see right now.');
  }
  function search(q) {
    history.replaceState(null, '', q ? '?q=' + encodeURIComponent(q) : location.pathname);
    if (req) req.abort();
    if (q.length < 2) return render(q, []);
    req = api('GET', '/api/search/', { q: q }).done(function (r) { render(q, r.results); });
  }
  $('#q').on('input', function () {
    var q = $.trim(this.value);
    clearTimeout(timer);
    timer = setTimeout(function () { search(q); }, 250);
  });
  $('#searchForm').on('submit', function (e) {
    e.preventDefault();
    search($.trim($('#q').val()));
  });
  render(D.q, D.results);
  var el = $('#q')[0];
  el.setSelectionRange(el.value.length, el.value.length);
});
