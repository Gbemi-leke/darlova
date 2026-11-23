/* Runs in <head>, before the page draws.
   When Darlova is opened from the home-screen icon (installed app), the landing
   page is skipped: members go straight to the dashboard (or to login). */
(function () {
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (!standalone) return;
  document.documentElement.classList.add('is-app');
  if (location.pathname === '/') location.replace('/discover/');
})();
