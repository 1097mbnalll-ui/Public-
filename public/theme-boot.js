// Runs before the app loads: paints the saved theme's background so a dark theme doesn't flash light.
try {
  var t = JSON.parse(localStorage.getItem('masar.themeBoot') || 'null');
  if (t) {
    var r = document.documentElement;
    r.style.background = t.bg;
    r.style.color = t.text;
    r.style.colorScheme = t.dark ? 'dark' : 'light';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t.bg);
  }
} catch (e) {}
