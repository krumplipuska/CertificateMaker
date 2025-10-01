Editor App (Split Build)
=================================

This archive contains the split JavaScript chunks and an updated HTML file.

Files:
- index.html            -> loads the split chunks in order (use this as your main page)
- indewe.split.html     -> same as index.html, just an alternate filename
- app.*.js              -> split chunks from the original editor.app.js (order matters)

How to use:
1) Put ALL files in the same directory on your server or local workspace.
2) Open index.html in a browser or serve it from your dev server.
3) Keep the <script defer> order intact — it matches the original dependency order.
