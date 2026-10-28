/* MORA HOME — spec-sheet print bar (external file so the site can run a strict
   Content-Security-Policy without inline onclick handlers). */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var b = e.target.closest('#printBtn');
    if (b) window.print();
  });
})();
