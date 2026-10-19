/* Curseur de l'admin : même étoile dorée que le site (la souris n'a plus de curseur de base nulle part).
   Souris uniquement (hover + pointer fin) ; sur tactile rien n'est modifié ; prefers-reduced-motion : étoile seule, sans traînée. */
(function () {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = document.createElement('style');
  css.textContent =
    '*:not(#vg-nc),*:not(#vg-nc)::before,*:not(#vg-nc)::after,input:not(#vg-nc)::-webkit-search-cancel-button,input:not(#vg-nc)::-webkit-inner-spin-button,input:not(#vg-nc)::-webkit-calendar-picker-indicator,input:not(#vg-nc)::file-selector-button,input:not(#vg-nc)::-webkit-file-upload-button,summary:not(#vg-nc)::marker{cursor:none!important}' +
    '.vg-ac{position:fixed;top:0;left:0;pointer-events:none;z-index:2147483647;opacity:0;transition:opacity .15s ease;will-change:transform}' +
    '.vg-ac.on{opacity:1}.vg-ac-dot.on{opacity:.55}' +
    '.vg-ac-star{width:26px;height:26px;background:radial-gradient(circle,#ffe27a 0%,#ffa726 55%,transparent 100%);clip-path:polygon(50% 0%,61% 40%,100% 50%,61% 60%,50% 100%,39% 60%,0% 50%,39% 40%);filter:drop-shadow(0 0 1px rgba(150,90,10,.45))}' +
    '.vg-ac-dot{width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3d6 0%,#ffd98a 40%,rgba(255,190,60,.5) 75%,transparent 100%);box-shadow:0 0 0 1px rgba(150,95,10,.3),0 0 6px rgba(255,200,100,.7)}';
  document.head.appendChild(css);
  var N = reduce ? 1 : 6, nodes = [], mx = 0, my = 0, moved = false, lastMove = 0, angle = 0;
  for (var i = 0; i < N; i++) {
    var el = document.createElement('span');
    el.className = 'vg-ac ' + (i === 0 ? 'vg-ac-star' : 'vg-ac-dot');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    nodes.push({ el: el, x: 0, y: 0 });
  }
  document.addEventListener('mousemove', function (e) {
    mx = e.clientX; my = e.clientY; lastMove = performance.now();
    if (!moved) { moved = true; nodes.forEach(function (n) { n.x = mx; n.y = my; n.el.classList.add('on'); }); }
  }, { passive: true });
  // La souris quitte la fenêtre : on cache l'étoile (le curseur de base du navigateur ne revient pas dans la page).
  document.addEventListener('mouseleave', function () { nodes.forEach(function (n) { n.el.classList.remove('on'); }); });
  document.addEventListener('mouseenter', function () { if (moved) nodes.forEach(function (n) { n.el.classList.add('on'); }); });
  function loop(now) {
    if (moved) {
      var idle = now - lastMove > 260;
      angle = (angle + (idle ? 0.4 : 3)) % 360;
      for (var i = 0; i < N; i++) {
        var n = nodes[i];
        var ease = i === 0 ? 0.6 : 0.3 - i * 0.04;
        n.x += (mx - n.x) * ease; n.y += (my - n.y) * ease;
        var s = i === 0 ? 1 : Math.max(1 - i * 0.14, 0.3);
        n.el.style.transform = 'translate3d(' + n.x + 'px,' + n.y + 'px,0) translate(-50%,-50%) rotate(' + (i === 0 ? angle : 0).toFixed(1) + 'deg) scale(' + s.toFixed(2) + ')';
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
