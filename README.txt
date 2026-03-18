Yellow Dog River emergency startup replacement batch
====================================================

What this batch is for
----------------------
This batch is built to stop the specific startup crash caused by:
"Cannot set properties of null (setting 'value')"

What is in here
---------------
1. identity-safe.js
   Safely sets the current identity to "Tod" even if the old identity dropdown
   is gone or renamed.

2. app-init.js
   Wraps startup in a safe DOMContentLoaded boot process and shows a readable
   on-screen error banner instead of a white screen.

3. index.safe-loader.snippet.html
   The loader lines that need to be present in index.html.

What this batch does NOT do
---------------------------
It does not replace the entire project, because the actual project files were
not uploaded here. This is a startup replacement batch targeted at the exact
error now showing.

What to replace
---------------
Copy identity-safe.js and app-init.js into the root of the project.
In index.html, load them before your normal app script.

The goal
--------
- no identitySelect crash
- no blank white load
- safe hardwired identity default of Tod
