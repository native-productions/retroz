// Blocking theme init — runs before paint so there is no flash of the wrong
// theme. Keep in sync with STORAGE_KEY / default in src/components/theme-provider.tsx.
try {
  var t = localStorage.getItem("theme");
  var dark = t ? t === "dark" : true;
  document.documentElement.classList.toggle("dark", dark);
} catch (e) {}
