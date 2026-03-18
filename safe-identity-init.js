(function () {
  function showStartupError(message) {
    try {
      var existing = document.getElementById('startupErrorBox');
      if (existing) {
        existing.textContent = 'Startup error: ' + message;
        return;
      }

      var box = document.createElement('div');
      box.id = 'startupErrorBox';
      box.textContent = 'Startup error: ' + message;
      box.style.position = 'fixed';
      box.style.left = '16px';
      box.style.right = '16px';
      box.style.bottom = '16px';
      box.style.padding = '16px 18px';
      box.style.borderRadius = '18px';
      box.style.background = 'rgba(0,0,0,0.85)';
      box.style.color = '#fff';
      box.style.fontSize = '16px';
      box.style.lineHeight = '1.35';
      box.style.zIndex = '99999';
      box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
      document.body.appendChild(box);
    } catch (err) {
      console.error('Could not render startup error box:', err);
    }
  }

  function initIdentitySelect(options) {
    var cfg = options || {};
    var elementId = cfg.elementId || 'identitySelect';
    var fallbackIdentity = cfg.fallbackIdentity || 'Tod';
    var currentIdentity = cfg.currentIdentity || fallbackIdentity;

    var identitySelect = document.getElementById(elementId);

    if (!identitySelect) {
      console.warn('Identity select not found: #' + elementId + '. Skipping selector initialization.');
      return {
        ok: false,
        reason: 'missing-element',
        currentIdentity: currentIdentity
      };
    }

    try {
      identitySelect.value = currentIdentity || fallbackIdentity;
      return {
        ok: true,
        reason: null,
        currentIdentity: identitySelect.value
      };
    } catch (err) {
      showStartupError(err.message || String(err));
      return {
        ok: false,
        reason: 'assignment-failed',
        currentIdentity: currentIdentity,
        error: err
      };
    }
  }

  function runWhenReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  window.YellowDogSafeInit = {
    showStartupError: showStartupError,
    initIdentitySelect: initIdentitySelect,
    runWhenReady: runWhenReady
  };
})();
