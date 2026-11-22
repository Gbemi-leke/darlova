/* Applies the saved theme before the page paints (prevents a flash of the wrong colour). */
(function () {
  try {
    var m = localStorage.getItem('lv-theme') || 'system';
    var d = m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-bs-theme', d ? 'dark' : 'light');
    document.documentElement.setAttribute('data-mode', m);
  } catch (e) {}
})();
