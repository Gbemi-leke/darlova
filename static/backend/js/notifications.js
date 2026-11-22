/* =========================================================
   notifications.html — your real notifications
   ========================================================= */
$(function () {
  var items = pageData().items,
    f = 'all';
  var icons = {
    match: ['bi-heart-fill', '#D81B60'],
    msg: ['bi-chat-fill', '#7C3AED'],
    like: ['bi-hand-thumbs-up-fill', '#F59E0B'],
    super: ['bi-star-fill', '#0EA5E9'],
    view: ['bi-eye-fill', '#22C55E'],
    system: ['bi-patch-check-fill', '#0EA5E9'],
  };
  function render() {
    var list = items.filter(function (n) {
        return f === 'all' || n.t === f || (f === 'like' && n.t === 'super');
      }),
      html = '',
      g = '';
    list.forEach(function (n) {
      if (n.g !== g) {
        g = n.g;
        html += '<div class="n-group">' + g + '</div>';
      }
      var ic = icons[n.t] || icons.system,
        img = n.img || '/static/images/brand/logo-icon.png';
      html +=
        '<a href="/notifications/' + n.id + '/open/" class="n-item ' + (n.unread ? 'unread' : '') + '">' +
        '<div class="av"><img src="' + esc(img) + '" class="avatar avatar-lg" alt="">' +
        '<span class="n-icon" style="background:' + ic[1] + '"><i class="bi ' + ic[0] + '"></i></span></div>' +
        '<div class="flex-grow-1 pe-4"><div>' + esc(n.txt) + '</div><div class="small text-muted-2">' + esc(n.time) + '</div></div></a>';
    });
    $('#nList').html(html);
    $('#nEmpty').toggleClass('d-none', !!list.length);
  }
  $('#nFilter').on('click', '.nav-link', function () {
    $('#nFilter .nav-link').removeClass('active');
    $(this).addClass('active');
    f = $(this).data('f');
    render();
  });
  $('#markAll').on('click', function () {
    api('POST', '/api/notifications/read/').done(function (r) {
      items.forEach(function (n) { n.unread = false; });
      render();
      window.updateBadges && updateBadges(r);
      showToast('All caught up', 'check2-all');
    });
  });
  render();
});
