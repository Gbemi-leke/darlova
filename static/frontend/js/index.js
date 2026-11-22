/* =========================================================
   index.html — page script
   ========================================================= */
$(function () {
  /* rotating headline words */
  var words = ['gets you.', 'makes you laugh.', 'shares your vibe.', 'loves jollof too.', 'feels like home.'],
    wi = 0;
  setInterval(function () {
    wi = (wi + 1) % words.length;
    $('#rotator').html('<span class="text-gradient serif-italic">' + words[wi] + '</span>');
  }, 2600);

  /* hero profile card cycles through the most-liked members (from the Django view) */
  var people = [],
    pi = 0,
    timer;
  try {
    people = JSON.parse(document.getElementById('hero-people').textContent) || [];
  } catch (e) {}

  function showPerson(dir) {
    if (people.length < 2) return; // nothing to cycle (or no members yet)
    pi = (pi + 1) % people.length;
    var p = people[pi];
    $('.profile-card').css({
      transition: 'transform .45s cubic-bezier(.22,1,.36,1), opacity .45s',
      transform: 'translateX(' + (dir || 0) * 60 + 'px) rotate(' + (dir || 0) * 6 + 'deg)',
      opacity: 0.0,
    });
    setTimeout(function () {
      $('#heroImg').attr({ src: p.img, alt: p.first });
      $('#heroName').text(p.name);
      $('#heroJob').text(p.job);
      $('#heroVerified').toggle(!!p.verified);
      $('#heroBars').html(p.photos.map(function (x, i) { return '<i class="' + (i ? '' : 'on') + '"></i>'; }).join(''));
      $('#heroTags').html(p.tags.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join(''));
      $('.profile-card').css({ transform: 'none', opacity: 1 });
      // the "It's a match" bubble pairs this person with the next one
      var q = people[(pi + 1) % people.length];
      $('#matchPair img').eq(0).attr('src', p.img);
      $('#matchPair img').eq(1).attr('src', q.img);
    }, 450);
  }
  /* while a person is showing, flip through their other photos */
  setInterval(function () {
    var p = people[pi];
    if (!p || p.photos.length < 2) return;
    var $bars = $('#heroBars i'),
      i = ($bars.index($bars.filter('.on')) + 1) % p.photos.length;
    $bars.removeClass('on').eq(i).addClass('on');
    $('#heroImg').attr('src', p.photos[i]);
  }, 2100);
  function auto() {
    clearInterval(timer);
    timer = setInterval(function () {
      showPerson(0);
    }, 6300);
  }
  auto();
  $('#heroLike').on('click', function () {
    burst();
    showPerson(1);
    auto();
  });
  $('#heroPass').on('click', function () {
    showPerson(-1);
    auto();
  });
  $('#heroStar').on('click', function () {
    showToast(people.length ? 'Join Darlova to super like ' + (people[pi] || {}).first + '!' : 'Join Darlova to start liking', 'star-fill');
    showPerson(1);
    auto();
  });
  /* floating hearts in hero */
  function heart() {
    var $h = $('<i class="bi bi-heart-fill floating-heart" aria-hidden="true"></i>').css({
      left: 10 + Math.random() * 80 + '%',
      fontSize: 12 + Math.random() * 18 + 'px',
      animationDuration: 5 + Math.random() * 4 + 's',
    });
    $('#heroVisual').append($h);
    setTimeout(function () {
      $h.remove();
    }, 9000);
  }
  setInterval(heart, 900);
  function burst() {
    for (var i = 0; i < 8; i++) setTimeout(heart, i * 70);
  }

  /* phone mockup shows other photos of the same members, in reverse order */
  var shots = [];
  people.slice().reverse().forEach(function (p) {
    p.photos.slice().reverse().forEach(function (src) {
      shots.push([src, p.name, p.job]);
    });
  });
  var phi = 0;
  if (shots.length > 1)
    setInterval(function () {
      phi = (phi + 1) % shots.length;
      $('#phoneImg').css('opacity', 0);
      setTimeout(function () {
        $('#phoneImg').attr('src', shots[phi][0]).css('opacity', 1);
        $('#phoneName').text(shots[phi][1]);
        $('#phoneJob').text(shots[phi][2]);
      }, 400);
    }, 3000);

  /* interest marquee */
  var interests = [
    'Afrobeats',
    'Travel',
    'Jollof',
    'Football',
    'Fashion',
    'Movies',
    'Church',
    'Gym',
    'Books',
    'Gaming',
    'Art',
    'Hiking',
    'Cooking',
    'Tech',
    'Dancing',
    'Photography',
  ];
  var chips = interests
    .concat(interests)
    .map(function (t, i) {
      return (
        '<span class="chip ' + (i % 3 === 1 ? 'chip-violet' : '') + ' glass glass-flat px-4 py-2 fs-6">' + t + '</span>'
      );
    })
    .join('');
  $('#marquee').html(chips);

  /* the member grid is rendered by Django (most-liked members) */
});
