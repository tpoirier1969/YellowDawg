// Yellow Dog River - safe identity bootstrap
// v3.2.2 emergency replacement
(function () {
  function getPreferredIdentity() {
    try {
      const stored = localStorage.getItem('yellowDogIdentity');
      if (stored && stored.trim()) return stored.trim();
    } catch (e) {}
    return 'Tod';
  }

  function applyIdentitySafely() {
    const currentIdentity = getPreferredIdentity();
    window.currentIdentity = currentIdentity;

    const identitySelect =
      document.getElementById('identitySelect') ||
      document.getElementById('identity') ||
      document.querySelector('[data-role="identity-select"]');

    if (identitySelect) {
      identitySelect.value = currentIdentity;
    }

    return currentIdentity;
  }

  window.applyIdentitySafely = applyIdentitySafely;
  document.addEventListener('DOMContentLoaded', applyIdentitySafely);
})();
