// Example startup file showing the safe pattern.
// Replace the broken identity selector startup block with this approach.

YellowDogSafeInit.runWhenReady(function () {
  try {
    var currentIdentity = localStorage.getItem('currentIdentity') || 'Tod';

    var identityResult = YellowDogSafeInit.initIdentitySelect({
      elementId: 'identitySelect',
      currentIdentity: currentIdentity,
      fallbackIdentity: 'Tod'
    });

    // If the selector is optional, keep going.
    // If it is required later, create or restore the matching HTML element.
    console.log('Identity init result:', identityResult);

    // Put the rest of your app startup below this line.
    // Example:
    // initializeMap();
    // loadSavedSpots();
    // renderUI();

  } catch (err) {
    console.error('Startup failed:', err);
    YellowDogSafeInit.showStartupError(err.message || String(err));
  }
});
