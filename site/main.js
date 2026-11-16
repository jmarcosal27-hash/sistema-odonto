// Revela blocos ao entrar na tela. A classe js só entra aqui: se este arquivo falhar, o conteúdo fica visível.
(function () {
  var root = document.documentElement;
  var els = document.querySelectorAll(".rise");
  function showAll() { root.classList.remove("js"); }
  try {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return;
    root.classList.add("js");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { io.observe(el); });
    // garantia: nada permanece oculto se o observer não disparar
    setTimeout(function () { if (!document.querySelector(".rise.in")) showAll(); }, 4000);
  } catch (err) { showAll(); }
})();
