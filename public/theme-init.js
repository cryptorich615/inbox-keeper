(function () {
  try {
    var state = JSON.parse(localStorage.getItem('inbox-keeper:v1') || '{}');
    var preference = ['light', 'dark', 'system'].indexOf(state.theme) >= 0 ? state.theme : 'system';
    var dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (_) { /* App persistence safely restores defaults. */ }
}());
