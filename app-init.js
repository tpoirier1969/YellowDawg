// Yellow Dog River - safe startup wrapper
// v3.2.2 emergency replacement
(function () {
  function safeAlert(message) {
    const existing = document.getElementById('startupErrorBanner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'startupErrorBanner';
    banner.style.position = 'fixed';
    banner.style.left = '24px';
    banner.style.right = '24px';
    banner.style.bottom = '24px';
    banner.style.zIndex = '99999';
    banner.style.padding = '18px 22px';
    banner.style.borderRadius = '18px';
    banner.style.background = 'rgba(0,0,0,0.82)';
    banner.style.color = '#fff';
    banner.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    banner.style.fontSize = '18px';
    banner.style.boxShadow = '0 8px 30px rgba(0,0,0,0.25)';
    banner.textContent = 'Startup error: ' + message;
    document.body.appendChild(banner);
  }

  function runExistingStartup() {
    if (typeof window.startApp === 'function') return window.startApp();
    if (typeof window.initializeApp === 'function') return window.initializeApp();
    if (typeof window.initApp === 'function') return window.initApp();
    if (typeof window.initMap === 'function') return window.initMap();
    if (typeof window.initializeMap === 'function') return window.initializeMap();
    console.warn('No known startup function found after safe bootstrap.');
  }

  document.addEventListener('DOMContentLoaded', function () {
    try {
      if (typeof window.applyIdentitySafely === 'function') {
        window.applyIdentitySafely();
      }
      runExistingStartup();
    } catch (err) {
      console.error('Startup error:', err);
      safeAlert(err && err.message ? err.message : String(err));
    }
  });
})();
