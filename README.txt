YELLOW DOG EMERGENCY STARTUP FIX

What this is:
A small emergency batch to stop the app from crashing when the identity selector element is missing.

What the screenshot proved:
Your startup code is trying to do this:
  identitySelect.value = currentIdentity || "Tod"
when identitySelect is null.

What this batch does:
- guards identity selector setup
- waits until DOM is ready
- shows a readable startup error instead of hard-crashing

Files:
- safe-identity-init.js
- startup-patch-example.js
- startup-patch-snippet.txt

Important:
This is an emergency drop-in fix, not a full project rebuild.
For the real replacement batch, upload the current project zip and the correct files can be rebuilt cleanly.
