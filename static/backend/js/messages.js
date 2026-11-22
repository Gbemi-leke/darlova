/* =========================================================
   messages.html — live chat
   New messages, typing and read receipts are fetched every few
   seconds (shared hosting can't hold WebSocket connections).
   ========================================================= */
$(function () {
  var CHAT_POLL = 3000, // open conversation
    LIST_POLL = 8000, // conversation list
    chats = [],
    active = null, // match id
    activeUser = null,
    lastId = 0,
    rendered = {}, // message id -> true
    replyTo = null, // {id, who, body}
    chatReq = null,
    typingSentAt = 0;

  var emojis = '😀😂🥰😍😘😉😎🤔😅🙈🔥❤️💕👍👏🎉🙌✨🌹☕🍕🎶💃😴'.match(/./gu);
  $('#emojiPop').html(emojis.map(function (e) { return '<button type="button">' + e + '</button>'; }).join(''));
  $('.chat-head,.chat-body,.chat-foot').hide();

  /* ---------------- conversation list ---------------- */
  function loadList() {
    return api('GET', '/api/chats/').done(function (r) {
      chats = r.chats;
      renderList();
    });
  }
  function renderList() {
    var q = $('#convSearch').val().toLowerCase(),
      total = 0;
    chats.forEach(function (c) { total += c.unread; });
    $('#unreadTotal').text(total ? total + ' unread' : 'All read');
    if (!chats.length) {
      $('#convs').html(
        '<div class="text-center text-muted-2 py-5 px-3"><i class="bi bi-heart fs-1 text-brand"></i>' +
          '<p class="mt-2 mb-3">No matches yet. When you and someone like each other, you can chat here.</p>' +
          '<a href="/discover/" class="btn btn-brand btn-sm">Go to Discover</a></div>',
      );
      return;
    }
    var list = chats.filter(function (c) { return c.user.name.toLowerCase().indexOf(q) > -1; });
    $('#convs').html(
      list.map(function (c) {
        var preview = c.typing ? '<span class="text-brand">typing…</span>' : esc(c.last || 'New match · say hi 👋');
        return (
          '<button type="button" role="listitem" class="conv ' + (active == c.id ? 'active' : '') + '" data-id="' + c.id + '">' +
          '<div class="av"><img class="avatar avatar-md" src="' + esc(c.user.img) + '" alt="">' +
          (c.user.online ? '<span class="dot-online"></span>' : '') + '</div>' +
          '<div class="flex-grow-1" style="min-width:0"><div class="d-flex justify-content-between"><strong>' + esc(c.user.name) +
          (c.new ? ' <span class="chip py-0 px-2 ms-1" style="font-size:.65rem">NEW</span>' : '') + '</strong>' +
          '<span class="small text-muted-2">' + timeLabel(c.lastAt) + '</span></div>' +
          '<div class="d-flex justify-content-between gap-2"><div class="last">' + preview + '</div>' +
          (c.unread ? '<span class="unread">' + c.unread + '</span>' : '') + '</div></div></button>'
        );
      }).join('') || '<p class="text-center text-muted-2 small py-4">No chats match that name.</p>',
    );
  }

  /* ---------------- messages ---------------- */
  function dayLabel(iso) {
    var d = new Date(iso), now = new Date(), y = new Date(now - 864e5);
    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
  }
  function ticks(m) {
    if (!m.mine || m.deleted) return '';
    if (m.pending) return ' <i class="bi bi-clock"></i>';
    return m.read ? ' <i class="bi bi-check2-all tick-read" title="Read"></i>' : ' <i class="bi bi-check2" title="Sent"></i>';
  }
  function bubbleHtml(m) {
    var who = m.mine ? 'me' : 'them';
    var quote = m.reply
      ? '<div class="reply-quote" data-jump="' + m.reply.id + '"><strong>' + (m.reply.mine ? 'You' : esc(activeUser.name)) +
        '</strong><span>' + esc(m.reply.body) + '</span></div>'
      : '';
    var text = m.deleted ? '<em class="unsent"><i class="bi bi-slash-circle me-1"></i>Message unsent</em>' : esc(m.body);
    var tools = m.deleted ? '' :
      '<div class="msg-tools">' +
      '<button type="button" class="t-reply" aria-label="Reply"><i class="bi bi-reply"></i></button>' +
      (m.mine ? '<button type="button" class="t-unsend" aria-label="Unsend"><i class="bi bi-trash3"></i></button>'
              : '<button type="button" class="t-react" aria-label="React with a heart"><i class="bi bi-heart"></i></button>') +
      '</div>';
    return (
      '<div class="msg-row ' + who + '" data-id="' + m.id + '" data-at="' + m.at + '">' +
      '<div class="bubble ' + who + '">' + quote + '<span class="txt">' + text + '</span>' +
      '<span class="time">' + new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ticks(m) + '</span>' +
      (m.reaction ? '<span class="react">' + esc(m.reaction) + '</span>' : '') +
      '</div>' + tools + '</div>'
    );
  }
  function appendMessage(m, animate) {
    if (rendered[m.id]) return;
    rendered[m.id] = true;
    var $body = $('#chatBody');
    $body.find('.empty-chat').remove();
    var $last = $body.find('.msg-row').last();
    if (!$last.length || dayLabel($last.data('at')) !== dayLabel(m.at)) {
      $body.append('<div class="day-sep">' + dayLabel(m.at) + '</div>');
    }
    var $row = $(bubbleHtml(m));
    if (!animate) $row.find('.bubble').css('animation', 'none');
    $row.data('msg', m);
    $body.append($row);
    if (m.id > lastId && !m.pending) lastId = m.id;
  }
  function nearBottom() {
    var b = $('#chatBody')[0];
    return b.scrollHeight - b.scrollTop - b.clientHeight < 140;
  }
  function scrollDown(smooth) {
    var b = $('#chatBody')[0];
    if (smooth) $(b).stop().animate({ scrollTop: b.scrollHeight }, 250);
    else b.scrollTop = b.scrollHeight;
  }
  function setStatus(u, typing) {
    var html = typing ? '<span class="text-brand">typing…</span>'
      : u.online ? '<span class="text-success">● Online</span>'
      : '<span class="text-muted-2">' + esc(u.status || 'Offline') + '</span>';
    $('#chatStatus').html(html);
    $('#chatBody .typing').remove();
    if (typing) {
      var stick = nearBottom();
      $('#chatBody').append('<div class="typing" aria-label="Typing"><span></span><span></span><span></span></div>');
      if (stick) scrollDown(true);
    }
  }
  function applyReadUpTo(readUpTo) {
    if (!readUpTo) return;
    $('#chatBody .msg-row.me').each(function () {
      var m = $(this).data('msg');
      if (m && !m.read && !m.pending && m.id <= readUpTo) {
        m.read = true;
        $(this).find('.time i').replaceWith('<i class="bi bi-check2-all tick-read" title="Read"></i>');
      }
    });
  }
  function applyChanges(changed) {
    (changed || []).forEach(function (c) {
      var $row = $('#chatBody .msg-row[data-id="' + c.id + '"]'),
        m = $row.data('msg');
      if (!m) return;
      if (c.deleted && !m.deleted) {
        m.deleted = true;
        $row.find('.txt').html('<em class="unsent"><i class="bi bi-slash-circle me-1"></i>Message unsent</em>');
        $row.find('.msg-tools,.react,.reply-quote,.time i').remove();
      }
      if (c.reaction !== m.reaction) {
        m.reaction = c.reaction;
        $row.find('.react').remove();
        if (c.reaction) $row.find('.bubble').append('<span class="react">' + esc(c.reaction) + '</span>');
      }
    });
  }

  function open(id) {
    if (chatReq) chatReq.abort();
    active = +id;
    lastId = 0;
    rendered = {};
    cancelReply();
    $('#chatPlaceholder').hide();
    $('.chat-head,.chat-body,.chat-foot').show();
    $('#chatBody').html('<div class="text-center py-5"><div class="spinner-border text-brand" role="status"></div></div>');
    $('#chatWrap').addClass('open');
    history.replaceState(null, '', '?id=' + active);
    renderList();

    chatReq = api('GET', '/api/chats/' + active + '/').done(function (r) {
      activeUser = r.user;
      var u = r.user;
      $('#chatAvatar').attr('src', u.img);
      $('#chatName').text(u.name + ', ' + u.age);
      $('#chatProfileLink,#ddProfile').attr('href', '/profile/?id=' + u.id);
      $('#reportModal').data('user', u.id).find('.report-name').text(u.name);
      var $body = $('#chatBody').empty();
      $body.append('<div class="day-sep">You matched with ' + esc(u.name) + ' ' + esc(u.matched) + '</div>');
      r.messages.forEach(function (m) { appendMessage(m, false); });
      if (!r.messages.length) {
        $body.append(
          '<div class="empty-chat"><img src="' + esc(u.img) + '" class="avatar mb-3" style="width:90px;height:90px" alt="">' +
          '<strong style="color:var(--text)">Say hi to ' + esc(u.name) + '!</strong><span class="small">Try one of the icebreakers below.</span></div>',
        );
      }
      var qr = ['Hey ' + u.name + '! 👋', "What's your perfect weekend?", 'Party jollof or home jollof? 😄'];
      if (u.interests[0]) qr.splice(1, 0, 'Love your ' + u.interests[0] + ' vibe');
      $('#quick').html(qr.map(function (t) {
        return '<button type="button" class="chip chip-select flex-shrink-0">' + esc(t) + '</button>';
      }).join('')).toggle(r.messages.length < 3);
      applyReadUpTo(r.readUpTo);
      setStatus(u, r.typing);
      scrollDown(false);
      var c = chats.find(function (x) { return x.id === active; });
      if (c) { c.unread = 0; c.new = false; renderList(); }
      $.getJSON('/api/pulse/').done(window.updateBadges || $.noop);
      if (window.innerWidth >= 992) $('#msgInput').trigger('focus');
    }).fail(function () {
      $('#chatBody').html('<div class="empty-chat"><strong>This chat is no longer available.</strong></div>');
    });
  }

  function poll() {
    if (!active || !activeUser || document.hidden || (chatReq && chatReq.readyState !== 4)) return;
    var id = active;
    chatReq = $.getJSON('/api/chats/' + id + '/', { after: lastId }).done(function (r) {
      if (id !== active) return;
      var stick = nearBottom(), got = false;
      r.messages.forEach(function (m) {
        if (!rendered[m.id]) { appendMessage(m, true); got = true; }
      });
      activeUser = $.extend(activeUser, r.user);
      applyReadUpTo(r.readUpTo);
      applyChanges(r.changed);
      setStatus(r.user, r.typing);
      if (got) {
        $('#quick').hide();
        if (stick) scrollDown(true);
      }
    }).fail(function (xhr) {
      if (xhr.status === 404 || xhr.status === 400) {
        showToast('This chat is no longer available', 'x-circle');
        active = null;
        loadList();
      }
    });
  }

  /* ---------------- sending ---------------- */
  var tempId = -1;
  function send(text) {
    text = $.trim(text);
    if (!text || !active) return;
    var m = { id: tempId--, mine: true, body: text, at: new Date().toISOString(), pending: true,
      reply: replyTo ? { id: replyTo.id, mine: replyTo.mine, body: replyTo.body } : null };
    appendMessage(m, true);
    var $row = $('#chatBody .msg-row').last();
    scrollDown(true);
    $('#msgInput').val('').trigger('input');
    $('#quick').hide();
    var payload = { body: text, reply_to: replyTo ? replyTo.id : null };
    cancelReply();
    api('POST', '/api/chats/' + active + '/send/', payload)
      .done(function (r) {
        rendered[r.message.id] = true;
        var $new = $(bubbleHtml(r.message));
        $new.find('.bubble').css('animation', 'none');
        $new.data('msg', r.message);
        $row.replaceWith($new);
        if (r.message.id > lastId) lastId = r.message.id;
        var c = chats.find(function (x) { return x.id === active; });
        if (c) { c.last = 'You: ' + text; c.lastAt = r.message.at; chats.sort(function (a, b) { return a.lastAt < b.lastAt ? 1 : -1; }); renderList(); }
      })
      .fail(function () {
        $row.addClass('failed').find('.time').html('Not sent · <button type="button" class="btn btn-link p-0 retry">Retry</button>');
        $row.find('.retry').on('click', function () { $row.remove(); send(text); });
      });
    typingSentAt = 0;
  }
  function cancelReply() {
    replyTo = null;
    $('#replyBar').prop('hidden', true);
  }

  /* ---------------- events ---------------- */
  $('#convs').on('click', '.conv', function () { open($(this).data('id')); });
  $('#convSearch').on('input', renderList);
  $('#sendForm').on('submit', function (e) {
    e.preventDefault();
    send($('#msgInput').val());
    $('#emojiPop').removeClass('show');
  });
  // Enter sends, Shift+Enter makes a new line; the box grows with the text.
  $('#msgInput')
    .on('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.originalEvent.isComposing) {
        e.preventDefault();
        $('#sendForm').trigger('submit');
      }
      if (e.key === 'Escape') cancelReply();
    })
    .on('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 140) + 'px';
      if (this.value && active && Date.now() - typingSentAt > 3000) {
        typingSentAt = Date.now();
        $.ajax({ url: '/api/chats/' + active + '/typing/', method: 'POST', contentType: 'application/json',
          data: '{"typing":true}', headers: { 'X-CSRFToken': $('meta[name="csrf-token"]').attr('content') } });
      }
    });
  $('#quick').on('click', '.chip', function () { send($(this).text()); });
  $('#emojiBtn').on('click', function (e) {
    e.stopPropagation();
    $('#emojiPop').toggleClass('show');
  });
  $('#emojiPop').on('click', 'button', function (e) {
    e.stopPropagation();
    var $i = $('#msgInput');
    $i.val($i.val() + $(this).text()).trigger('focus');
  });
  $(document).on('click', function () { $('#emojiPop').removeClass('show'); });

  // Tap a bubble (phones) to show its Reply / React / Unsend buttons.
  $('#chatBody').on('click', '.bubble', function () {
    var $row = $(this).closest('.msg-row');
    $('#chatBody .msg-row.show-tools').not($row).removeClass('show-tools');
    $row.toggleClass('show-tools');
  });
  $('#chatBody').on('click', '.t-reply', function (e) {
    e.stopPropagation();
    var m = $(this).closest('.msg-row').data('msg');
    if (!m || m.pending) return;
    replyTo = { id: m.id, mine: m.mine, body: m.body };
    $('#replyWho').text(m.mine ? 'Replying to yourself' : 'Replying to ' + activeUser.name);
    $('#replyText').text(m.body);
    $('#replyBar').prop('hidden', false);
    $('#msgInput').trigger('focus');
  });
  $('#replyCancel').on('click', cancelReply);
  function react($row) {
    var m = $row.data('msg');
    if (!m || m.mine || m.deleted) return;
    api('POST', '/api/messages/' + m.id + '/react/', { emoji: '❤️' }).done(function (r) {
      applyChanges([{ id: m.id, reaction: r.reaction, deleted: false }]);
    });
  }
  $('#chatBody').on('click', '.t-react', function (e) {
    e.stopPropagation();
    react($(this).closest('.msg-row'));
  });
  $('#chatBody').on('dblclick', '.msg-row.them .bubble', function () { react($(this).closest('.msg-row')); });
  $('#chatBody').on('click', '.t-unsend', function (e) {
    e.stopPropagation();
    var $row = $(this).closest('.msg-row'), m = $row.data('msg');
    if (!m || m.pending || !confirm('Unsend this message? It will be removed for both of you.')) return;
    api('POST', '/api/messages/' + m.id + '/unsend/').done(function () {
      applyChanges([{ id: m.id, reaction: '', deleted: true }]);
    });
  });
  $('#chatBody').on('click', '.reply-quote', function (e) {
    e.stopPropagation();
    var $t = $('#chatBody .msg-row[data-id="' + $(this).data('jump') + '"]');
    if (!$t.length) return;
    $('#chatBody').animate({ scrollTop: $t[0].offsetTop - 80 }, 250);
    $t.addClass('flash');
    setTimeout(function () { $t.removeClass('flash'); }, 1200);
  });

  $('#backBtn').on('click', function () {
    $('#chatWrap').removeClass('open');
    active = null;
    history.replaceState(null, '', location.pathname);
    renderList();
  });
  $('#clearChat').on('click', function () {
    if (!active || !confirm('Clear this chat? Messages disappear for you only.')) return;
    api('POST', '/api/chats/' + active + '/clear/').done(function () { open(active); loadList(); });
  });
  $('#unmatchBtn').on('click', function () {
    if (!active || !confirm('Unmatch ' + activeUser.name + '? Your chat will be deleted for both of you.')) return;
    api('POST', '/api/unmatch/', { match_id: active }).done(function () {
      showToast('Unmatched ' + activeUser.name, 'heartbreak');
      location.href = '/messages/';
    });
  });
  $('#blockBtn').on('click', function () {
    if (!active || !confirm('Block ' + activeUser.name + "? They won't see you or be able to message you.")) return;
    api('POST', '/api/block/', { user_id: activeUser.id }).done(function () {
      showToast(activeUser.name + ' has been blocked', 'slash-circle');
      location.href = '/messages/';
    });
  });
  $('#reportForm').on('submit', function (e) {
    e.preventDefault();
    var f = this;
    api('POST', '/api/report/', {
      user_id: $('#reportModal').data('user'),
      reason: $(f).find('[name=reason]:checked').val(),
      details: f.details.value,
      block: f.block.checked,
    }).done(function () {
      bootstrap.Modal.getInstance('#reportModal').hide();
      showToast('Thanks. Our team will review this report.', 'shield-check');
      if (f.block.checked) setTimeout(function () { location.href = '/messages/'; }, 1200);
      f.reset();
    });
  });

  /* ---------------- start ---------------- */
  var qid = +new URLSearchParams(location.search).get('id');
  loadList().done(function () {
    if (qid) open(qid);
    else if (window.innerWidth >= 992 && chats.length) open(chats[0].id);
  });
  setInterval(poll, CHAT_POLL);
  setInterval(function () { if (!document.hidden) loadList(); }, LIST_POLL);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { poll(); loadList(); }
  });
});
