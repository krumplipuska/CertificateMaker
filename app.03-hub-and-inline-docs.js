/* ----------------------- Hub + Inline Docs ----------------------- */
// Lightweight app state with persistence
const AppState = (function(){
  const KEY = 'certificateMaker:appState';
  const defaults = { view: 'hub', activeDocId: null, activeFolderId: null };
  function read(){
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch { return { ...defaults }; }
  }
  function write(data){ try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} }
  function get(k){ return read()[k]; }
  function set(k,v){ const s = read(); s[k] = v; write(s); }
  function all(){ return read(); }
  return { get, set, all, view: 'hub', activeDocId: null };
})();

// Lightweight settings store persisted in localStorage
const Settings = (function(){
  const KEY = 'certificateMaker:settings';
  const defaults = { autosaveEnabled: true };
  function read(){
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch { return { ...defaults }; }
  }
  function write(data){ try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} }
  function get(k){ return read()[k]; }
  function set(k,v){ const s = read(); s[k] = v; write(s); }
  function all(){ return read(); }
  return { get, set, all };
})();

// Basic filename sanitization used by the hub navbar rename control
function sanitizeFileBaseName(name){
  try {
    let s = String(name || '')
      .replace(/[^A-Za-z0-9 _\-\.]+/g, '')     // strip illegal chars
      .replace(/\s+/g, ' ')                      // collapse spaces
      .trim()
      .replace(/^\.+|\.+$/g, '');               // trim leading/trailing dots
    // Disallow empty
    if (!s) s = 'index';
    // Prevent directory traversal by dropping any accidental slashes or backslashes
    s = s.replace(/[\\\/]+/g, '');
    // Hide extension in UI; the host enforces .html
    if (s.toLowerCase().endsWith('.html')) s = s.slice(0, -5);
    return s;
  } catch { return 'index'; }
}

function setView(name){
  try {
    AppState.set('view', name);
    AppState.view = name;
    const hv = document.getElementById('hubView');
    const ev = document.getElementById('editorView');
    if (hv) hv.hidden = name !== 'hub';
    if (ev) ev.hidden = name !== 'editor';
    const backBtn = document.getElementById('backToHubBtn');
    if (backBtn) backBtn.hidden = name !== 'editor';
    // Hide editor-only UI when in hub
    document.body.classList.toggle('in-hub', name === 'hub');
  } catch {}
}

const InlineDocs = (function(){
  function node(){ return document.getElementById('__docs__'); }
  function safeParse(text){
    try { return JSON.parse(text); }
    catch { return { catalog:[], docs:{}, folders:[], docFolders:{} }; }
  }
  function ensureShape(data){
    const d = data || {};
    if (!Array.isArray(d.catalog)) d.catalog = [];
    if (!d.docs || typeof d.docs !== 'object') d.docs = {};
    if (!Array.isArray(d.folders)) d.folders = [];
    if (!d.docFolders || typeof d.docFolders !== 'object') d.docFolders = {};
    return d;
  }
  let hydratedOnce = false;
  function read(){
    const n = node();
    const raw = n ? safeParse(n.textContent || '{"catalog":[],"docs":{}}') : { catalog:[], docs:{} };
    return ensureShape(raw);
  }
  function write(data){
    const n = node(); if (n) n.textContent = JSON.stringify(ensureShape(data));
    try {
      // Respect global autosave setting: only persist to localStorage when enabled
      if (Settings.get('autosaveEnabled') !== false) {
        localStorage.setItem('certificateMaker:inlineDocs', JSON.stringify(ensureShape(data)));
      }
    } catch {}
    // Trigger hub autosave after state changes
    try { if (typeof autosaveHub === 'function') autosaveHub(); } catch {}
  }
  function hydrateFromLocal(){
    try {
      if (hydratedOnce) return;
      hydratedOnce = true;
      // Hydrate from localStorage only when the in-memory store is empty.
      // This ensures hub changes (when autosave is off) are not overwritten.
      const current = read();
      const hasRuntimeData = !!(current && (
        (Array.isArray(current.catalog) && current.catalog.length > 0) ||
        (current.docs && Object.keys(current.docs).length > 0)
      ));
      if (hasRuntimeData) return;
      const s = localStorage.getItem('certificateMaker:inlineDocs');
      if (s){
        const data = safeParse(s);
        const hasPersistentData = !!(data && (
          (Array.isArray(data.catalog) && data.catalog.length > 0) ||
          (data.docs && Object.keys(data.docs).length > 0)
        ));
        if (hasPersistentData) write(data);
      }
    } catch {}
  }
  function list(){ return read().catalog; }
  function get(id){ return read().docs[id]; }
  function set(id, doc, name){
    const data = read();
    if (!data.docs[id]) data.catalog.push({ id, name: name || 'Untitled', createdAt: Date.now(), updatedAt: Date.now() });
    else data.catalog = data.catalog.map(r => r.id===id ? { ...r, name: name ?? r.name, updatedAt: Date.now() } : r);
    data.docs[id] = doc;
    write(data);
  }
  function remove(id){ const data = read(); data.catalog = data.catalog.filter(r => r.id !== id); delete data.docs[id]; if (data.docFolders) delete data.docFolders[id]; write(data); try { if (!data.catalog || data.catalog.length === 0) localStorage.removeItem('certificateMaker:inlineDocs'); } catch {} }
  function rename(id, name){ const data = read(); data.catalog = data.catalog.map(r => r.id===id ? { ...r, name, updatedAt: Date.now() } : r); write(data); }
  function move(id, targetIndex){
    const data = read();
    const fromIndex = data.catalog.findIndex(r => r.id === id);
    if (fromIndex === -1) return;
    const [item] = data.catalog.splice(fromIndex, 1);
    let to = Math.max(0, Math.min(Number(targetIndex) || 0, data.catalog.length));
    data.catalog.splice(to, 0, item);
    write(data);
  }
  function moveBefore(id, beforeId){
    const data = read();
    const fromIndex = data.catalog.findIndex(r => r.id === id);
    const rawIndex = beforeId ? data.catalog.findIndex(r => r.id === beforeId) : data.catalog.length;
    const toIndex = Math.max(0, rawIndex - (fromIndex !== -1 && fromIndex < rawIndex ? 1 : 0));
    move(id, toIndex);
  }
  // Folders API
  function listFolders(){ return read().folders; }
  function getFolder(id){ return (read().folders || []).find(f => f.id === id) || null; }
  function docsInFolder(folderId){ const data = read(); const map = data.docFolders || {}; return (data.catalog || []).filter(r => map[r.id] === folderId).map(r => r.id); }
  function createFolder(name){
    const data = read();
    const id = 'fld-' + (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    const rec = { id, name: name || 'New folder', createdAt: Date.now(), updatedAt: Date.now() };
    data.folders.push(rec);
    write(data);
    return rec;
  }
  function renameFolder(id, name){ const data = read(); data.folders = (data.folders||[]).map(f => f.id===id ? { ...f, name, updatedAt: Date.now() } : f); write(data); }
  function removeFolder(id){
    const data = read();
    data.folders = (data.folders||[]).filter(f => f.id !== id);
    // Un-assign docs from this folder
    if (data.docFolders){ Object.keys(data.docFolders).forEach(did => { if (data.docFolders[did] === id) delete data.docFolders[did]; }); }
    write(data);
  }
  function assignDocToFolder(docId, folderId){ const data = read(); data.docFolders = data.docFolders || {}; if (!folderId) delete data.docFolders[docId]; else data.docFolders[docId] = folderId; write(data); }
  function docFolderId(docId){ const data = read(); return (data.docFolders || {})[docId] || null; }
  return { list, get, set, remove, rename, hydrateFromLocal, move, moveBefore, listFolders, getFolder, createFolder, renameFolder, removeFolder, assignDocToFolder, docFolderId, docsInFolder };
})();

function renderHub(){
  try {
    InlineDocs.hydrateFromLocal();
    // Update centered file name pill in the hub header
    try {
      const input = document.getElementById('hubFileInput');
      if (input){
        const filename = (function(){
          try { const p = window.location.pathname || ''; const f = (p.split('/').pop() || '').trim(); return f; } catch { return ''; }
        })();
        const base = filename.toLowerCase().endsWith('.html') ? filename.slice(0, -5) : filename;
        if (!input.matches(':focus')) input.value = base || 'index';
      }
    } catch {}
    const allList = InlineDocs.list();
    // Selected folder (persisted)
    let activeFolder = AppState.get('activeFolderId') || null;
    // Filter list by folder if selected
    const list = (activeFolder ? allList.filter(r => InlineDocs.docFolderId(r.id) === activeFolder) : allList);
    const host = document.getElementById('docList');
    if (!host) return;

    // Animate the bottom "New Document" button
    const bottomBtn = document.getElementById('bottomNewDocBtn');
    if (bottomBtn) {
      // Always show the button (it should be visible even when no documents exist)
      bottomBtn.classList.remove('hidden');
      // Add a slight delay to allow for smooth transitions on initial load
      setTimeout(() => {
        bottomBtn.style.transform = 'translateY(0)';
        bottomBtn.style.opacity = '1';
      }, 50);
    }
    // Render folder bar
    const folderBar = document.getElementById('folderBar');
    if (folderBar){
      const folders = InlineDocs.listFolders();
      const makePill = (id, name, isActive, deletable) => `
        <button class="folder-pill${isActive?' active':''}" data-fid="${id}" ${isActive?'aria-current="page"':''}>
          <svg class="icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor"/></svg>
          <span class="folder-name">${name}</span>
          ${deletable?'<span class="close-btn" title="Delete" aria-label="Delete">×</span>':''}
        </button>`;
      folderBar.innerHTML = [
        makePill('all','All', !activeFolder, false),
        ...(folders||[]).map(f => makePill(f.id, f.name, activeFolder===f.id, true)).join(''),
        `<button class="folder-plus" id="addFolderBtn" title="New folder" aria-label="New folder">+
        </button>`
      ].join('');
      // Defer click action to allow dblclick to cancel it
      let folderClickTimer = null;
      // Click select
      folderBar.querySelectorAll('.folder-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
          // Ignore clicks inside inline rename input
          if (e.target && (e.target.tagName === 'INPUT' || e.target.closest('input'))) return;
          // Delete if clicking X — ask whether to delete contained docs too
          if (e.target && e.target.classList.contains('close-btn')){
            const fid = pill.dataset.fid; if (!fid || fid === 'all') return;
            // Internal dialog with two explicit options
            confirmChoices({
              title: 'Delete folder',
              message: 'What would you like to delete?',
              buttons: [
                { id:'del-with-docs', label:'Delete folder and documents', class:'danger' },
                { id:'del-folder-only', label:'Delete folder only', class:'primary' },
                { id:'cancel', label:'Cancel', class:'light' }
              ]
            }).then((choice) => {
              if (choice === 'del-with-docs'){
                try { InlineDocs.docsInFolder(fid).forEach(id => InlineDocs.remove(id)); } catch {}
                InlineDocs.removeFolder(fid);
              } else if (choice === 'del-folder-only'){
                InlineDocs.removeFolder(fid); // unassign docs to All
              } else {
                return; // cancelled
              }
              if (activeFolder===fid) { activeFolder = null; AppState.set('activeFolderId', null); }
              renderHub();
            });
            return;
          }
          // Normal select with click-delay to allow dblclick to cancel
          clearTimeout(folderClickTimer);
          folderClickTimer = setTimeout(() => {
            const fid = pill.dataset.fid;
            const next = (fid === 'all') ? null : fid;
            AppState.set('activeFolderId', next);
            renderHub();
          }, 220);
        });
        // Inline rename on double-click
        pill.addEventListener('dblclick', (e) => {
          // Cancel pending click selection
          clearTimeout(folderClickTimer);
          const fid = pill.dataset.fid; if (!fid || fid==='all') return;
          e.preventDefault(); if (e.stopPropagation) e.stopPropagation();
          const nameEl = pill.querySelector('.folder-name'); if (!nameEl) return;
          const current = (nameEl.textContent||'').trim();
          const inp = document.createElement('input');
          inp.type = 'text'; inp.value = current; inp.className = 'rename-input';
          nameEl.replaceWith(inp);
          const done = (commit) => {
            const v = String(inp.value||'').trim()||'Untitled';
            if (commit && v!==current) {
              InlineDocs.renameFolder(fid, v);
              // Note: autosave is triggered by InlineDocs.write() inside renameFolder()
            }
            renderHub();
          };
          inp.addEventListener('keydown', (ev) => { if (ev.key==='Enter'){ ev.preventDefault(); inp.blur(); } if (ev.key==='Escape'){ ev.preventDefault(); done(false); } });
          inp.addEventListener('blur', () => done(true));
          setTimeout(() => { try { inp.focus(); inp.select(); } catch {} }, 0);
        });
        // Allow dropping docs on folder with visual indication
        pill.addEventListener('dragenter', (ev) => { ev.preventDefault(); pill.classList.add('drag-over'); });
        pill.addEventListener('dragover', (ev) => { try { if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'; } catch{} ev.preventDefault(); pill.classList.add('drag-over'); });
        pill.addEventListener('dragleave', () => { pill.classList.remove('drag-over'); });
        pill.addEventListener('drop', (ev) => {
          ev.preventDefault();
          let docId = null; try { docId = ev.dataTransfer.getData('text/plain'); } catch {}
          if (!docId) return;
          const fid = pill.dataset.fid;
          const targetFolder = (fid === 'all') ? null : fid;
          InlineDocs.assignDocToFolder(docId, targetFolder);
          // If user dropped into a different folder, switch view to it
          AppState.set('activeFolderId', targetFolder);
          pill.classList.remove('drag-over');
          renderHub();
        });
      });
      const addBtn = document.getElementById('addFolderBtn');
      if (addBtn){
        addBtn.onclick = () => {
          const rec = InlineDocs.createFolder('New folder');
          AppState.set('activeFolderId', rec.id);
          // After render, switch the new pill into inline rename mode
          renderHub();
          setTimeout(() => {
            const pill = document.querySelector(`.folder-pill[data-fid="${rec.id}"]`);
            if (!pill) return;
            const nameEl = pill.querySelector('.folder-name');
            const inp = document.createElement('input'); inp.type='text'; inp.value = rec.name; inp.className='rename-input';
            nameEl.replaceWith(inp);
            const finish = (commit) => {
              const v = String(inp.value||'').trim()||'Untitled';
              if (commit) {
                InlineDocs.renameFolder(rec.id, v);
                // Note: autosave is triggered by InlineDocs.write() inside renameFolder()
              }
              renderHub();
            };
            inp.addEventListener('keydown',(ev)=>{ if (ev.key==='Enter'){ ev.preventDefault(); inp.blur(); } if (ev.key==='Escape'){ ev.preventDefault(); finish(false); } });
            inp.addEventListener('blur', ()=> finish(true));
            setTimeout(() => { try { inp.focus(); inp.select(); } catch {} }, 0);
          }, 0);
        };
      }
    }
    host.innerHTML = (list || []).map(r => `
      <div class="doc-row" data-id="${r.id}" draggable="true">
        <div class="doc-name">${r.name}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="doc-meta">${new Date(r.updatedAt || r.createdAt || Date.now()).toLocaleString()}</div>
          <div class="doc-actions">
            <button class="btn" data-act="open" title="Open"><svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M12 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <button class="btn" data-act="rename" title="Rename"><svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="currentColor"/></svg></button>
            <button class="btn" data-act="duplicate" title="Duplicate"><svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="12" height="12" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="9" width="12" height="12" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
            <button class="btn" data-act="delete" title="Delete"><svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 6V4h8v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="6" y="6" width="12" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
          </div>
        </div>
      </div>
    `).join('');
    // Inline rename helper (supports hover mode without auto-focus)
    function beginInlineRename(row, opts){
      try {
        const options = opts || {};
        const shouldFocus = options.focus !== false; // default true
        const hoverMode = options.hoverMode === true;
        if (!row) return; const id = row.dataset.id; if (!id) return;
        if (row.classList.contains('editing')) return;
        row.classList.add('editing');
        const nameEl = row.querySelector('.doc-name'); if (!nameEl) return;
        const current = (nameEl.textContent || '').trim();
        const input = document.createElement('input');
        input.type = 'text'; input.value = current; input.className = 'doc-edit';
        // Match font metrics of the text so width measurement is accurate
        try {
          const cs = getComputedStyle(nameEl);
          input.style.fontFamily = cs.fontFamily;
          input.style.fontSize = cs.fontSize;
          input.style.fontWeight = cs.fontWeight;
          input.style.fontStyle = cs.fontStyle;
          input.style.letterSpacing = cs.letterSpacing;
        } catch {}
        // Prevent row click opening while editing when interacting with the input
        ['click','mousedown','mouseup','dblclick'].forEach(evt => input.addEventListener(evt, ev => ev.stopPropagation(), true));
        // Create a hidden measurer to auto-size the input to text width + 20px
        let measurer = null;
        try {
          measurer = document.createElement('span');
          const cs = getComputedStyle(nameEl);
          measurer.style.position = 'fixed';
          measurer.style.left = '-9999px';
          measurer.style.top = '-9999px';
          measurer.style.visibility = 'hidden';
          measurer.style.whiteSpace = 'pre';
          measurer.style.fontFamily = cs.fontFamily;
          measurer.style.fontSize = cs.fontSize;
          measurer.style.fontWeight = cs.fontWeight;
          measurer.style.fontStyle = cs.fontStyle;
          measurer.style.letterSpacing = cs.letterSpacing;
          document.body.appendChild(measurer);
        } catch {}
        function updateWidth(){
          try {
            if (!measurer) return; 
            // Ensure at least one character so we don't collapse too far
            const t = input.value || '';
            measurer.textContent = t.length > 0 ? t : ' ';
            const w = Math.ceil(measurer.getBoundingClientRect().width) + 20; // text width + 20px
            input.style.width = Math.max(40, w) + 'px';
            // Keep a safe hard cap to avoid breaking layout in extreme cases
            input.style.maxWidth = '100%';
          } catch {}
        }
        const finish = (commit) => {
          try {
            const newName = commit ? String(input.value || '').trim() || 'Untitled' : current;
            if (commit && newName !== current) {
              InlineDocs.rename(id, newName);
              // Note: autosave is triggered by InlineDocs.write() inside rename()
            }
          } catch {}
          try { if (measurer && measurer.parentNode) measurer.remove(); } catch {}
          renderHub();
        };
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
          if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
        });
        input.addEventListener('input', updateWidth);
        input.addEventListener('blur', () => finish(true));
        nameEl.replaceWith(input);
        updateWidth();
        // In hover mode, if the user leaves the row without focusing the input, revert gracefully
        if (hoverMode) {
          const onLeave = () => { if (document.activeElement !== input) finish(false); };
          row.addEventListener('mouseleave', onLeave, { once: true });
        }
        // Focus after replacing so selection works on Windows (unless explicitly disabled)
        if (shouldFocus) setTimeout(() => { try { input.focus(); input.select(); } catch {} }, 0);
      } catch {}
    }

    // Show inline rename input when hovering over the name text (no auto-focus)
    host.addEventListener('mouseover', (e) => {
      const name = e.target.closest('.doc-name'); if (!name) return;
      const row = name.closest('.doc-row'); if (!row) return;

      // Only trigger rename when hovering over actual text content, not empty space
      let isOverText = false;
      const walk = document.createTreeWalker(name, NodeFilter.SHOW_TEXT, null, false);
      let textNode;
      while (textNode = walk.nextNode()) {
        if (textNode.textContent.trim()) {
          const range = document.createRange();
          range.selectNode(textNode);
          const rect = range.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            isOverText = true;
            break;
          }
        }
      }

      if (isOverText) {
        beginInlineRename(row, { focus: false, hoverMode: true });
      }
    });

    let clickTimer = null;
    host.onclick = (e) => {
      const row = e.target.closest('.doc-row'); if (!row) return;
      const id = row.dataset.id; const act = e.target.closest('button')?.dataset.act;
      // If clicking any action button
      if (act) {
        if (act === 'open') openDocument(id);
        if (act === 'rename') beginInlineRename(row);
        if (act === 'delete') { if (confirm('Delete this document?')) { InlineDocs.remove(id);
          // Animate the bottom button sliding up before re-rendering
          const bottomBtn = document.getElementById('bottomNewDocBtn');
          if (bottomBtn) {
            bottomBtn.style.transform = 'translateY(-10px)';
            bottomBtn.style.opacity = '0';
          }
          renderHub(); } }
        if (act === 'duplicate') {
          const copyId = `doc-${(crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))}`;
          const cur = InlineDocs.get(id);
          if (cur) {
            const name = (row.querySelector('.doc-name')?.textContent || 'Document') + ' copy';
            InlineDocs.set(copyId, JSON.parse(JSON.stringify(cur)), name);
            const activeFolder = AppState.get('activeFolderId') || null;
            InlineDocs.assignDocToFolder(copyId, activeFolder);
          }
          renderHub();
        }
        return;
      }

      // If currently in inline edit mode, allow clicks inside input to edit; clicking elsewhere opens
      if (row.classList.contains('editing')) {
        if (e.target.closest('.doc-edit')) return; // keep editing
        // If not clicking on input or action button, open the document
        if (!e.target.closest('button')) { openDocument(id); }
        return;
      }

      // If clicking on the name, delay to detect a double-click (which triggers rename)
      if (e.target.closest('.doc-name')) {
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => { try { openDocument(id); } catch {} }, 250);
        return;
      }

      // Otherwise open immediately
      openDocument(id);
    };

    // Double click on the name -> inline rename
    host.addEventListener('dblclick', (e) => {
      const name = e.target.closest('.doc-name'); if (!name) return;
      const row = e.target.closest('.doc-row'); if (!row) return;
      clearTimeout(clickTimer);
      e.preventDefault(); e.stopPropagation();
      beginInlineRename(row);
    }, true);

    // Drag & drop reordering with single global drop marker
    let draggingId = null;
    let dropMarker = null;
    function ensureMarker(){
      if (!dropMarker){
        dropMarker = document.createElement('div');
        dropMarker.className = 'doc-drop-marker';
      }
      if (!dropMarker.parentNode) host.appendChild(dropMarker);
      return dropMarker;
    }
    host.ondragstart = (e) => {
      const row = e.target.closest('.doc-row'); if (!row) return;
      draggingId = row.dataset.id;
      row.classList.add('dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', draggingId); } catch {}
    };
    host.ondragend = () => {
      draggingId = null;
      host.querySelectorAll('.doc-row').forEach(r => r.classList.remove('dragging'));
      if (dropMarker && dropMarker.parentNode) dropMarker.remove();
    };
    host.ondragover = (e) => {
      if (!draggingId) return; e.preventDefault();
      try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch {}
      const rows = Array.from(host.querySelectorAll('.doc-row'));
      const others = rows.filter(r => r.dataset.id !== draggingId);
      const marker = ensureMarker();
      const hostRect = host.getBoundingClientRect();
      const y = e.clientY - hostRect.top + host.scrollTop;
      // Determine insertion index among non-dragging rows
      let index = 0;
      for (let i = 0; i < others.length; i++){
        const rr = others[i].getBoundingClientRect();
        const mid = rr.top - hostRect.top + host.scrollTop + rr.height / 2;
        if (y > mid) index = i + 1; else break;
      }
      // Place marker at exact boundary without reflow
      let top = 0;
      if (others.length === 0){
        top = 0;
      } else if (index === 0){
        const rr0 = others[0].getBoundingClientRect();
        top = rr0.top - hostRect.top + host.scrollTop;
      } else if (index >= others.length){
        const rrl = others[others.length - 1].getBoundingClientRect();
        top = rrl.top - hostRect.top + host.scrollTop + rrl.height;
      } else {
        const rrB = others[index - 1].getBoundingClientRect();
        top = rrB.top - hostRect.top + host.scrollTop + rrB.height;
      }
      marker.style.top = Math.max(0, Math.floor(top)) + 'px';
      marker.dataset.index = String(index);
    };
    host.ondrop = (e) => {
      if (!draggingId) return; e.preventDefault();
      let destIndex = Number(dropMarker?.dataset?.index || 0);
      // Convert index among non-dragging rows into full list index
      const rows = Array.from(host.querySelectorAll('.doc-row'));
      const fromIndex = rows.findIndex(r => r.dataset.id === draggingId);
      const others = rows.filter(r => r.dataset.id !== draggingId);
      // Position relative to others, then adjust for removal when moving down
      const afterRemovalIndex = destIndex + (fromIndex !== -1 && fromIndex < destIndex ? 1 : 0);
      try { InlineDocs.move(draggingId, afterRemovalIndex); } catch {}
      renderHub();
    };
  } catch {}
}

// Reusable internal confirm with multiple buttons
function confirmChoices({ title = 'Confirm', message = '', buttons = [] } = {}){
  return new Promise((resolve) => {
    const dlg = document.getElementById('confirmDialog');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const btnsEl = document.getElementById('confirmButtons');
    if (!dlg || !titleEl || !msgEl || !btnsEl){ resolve(null); return; }
    titleEl.textContent = title;
    msgEl.textContent = message;
    btnsEl.innerHTML = '';
    const close = (value) => { dlg.classList.add('hidden'); resolve(value); };
    document.getElementById('confirmCloseBtn')?.addEventListener('click', () => close(null), { once:true });
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = `btn ${b.class||''}`.trim();
      btn.textContent = b.label || 'OK';
      btn.addEventListener('click', () => close(b.id || true));
      btnsEl.appendChild(btn);
    });
    dlg.classList.remove('hidden');
  });
}
// Standalone function for inline document renaming (extracted from renderHub)
function beginInlineRename(row, opts){
  try {
    const options = opts || {};
    const shouldFocus = options.focus !== false; // default true
    const hoverMode = options.hoverMode === true;
    if (!row) return; const id = row.dataset.id; if (!id) return;
    if (row.classList.contains('editing')) return;
    row.classList.add('editing');
    const nameEl = row.querySelector('.doc-name'); if (!nameEl) return;
    const current = (nameEl.textContent || '').trim();
    const input = document.createElement('input');
    input.type = 'text'; input.value = current; input.className = 'doc-edit';
    // Match font metrics of the text so width measurement is accurate
    try {
      const cs = getComputedStyle(nameEl);
      input.style.fontFamily = cs.fontFamily;
      input.style.fontSize = cs.fontSize;
      input.style.fontWeight = cs.fontWeight;
      input.style.fontStyle = cs.fontStyle;
      input.style.letterSpacing = cs.letterSpacing;
    } catch {}
    // Prevent row click opening while editing when interacting with the input
    ['click','mousedown','mouseup','dblclick'].forEach(evt => input.addEventListener(evt, ev => ev.stopPropagation(), true));
    // Create a hidden measurer to auto-size the input to text width + 20px
    let measurer = null;
    try {
      measurer = document.createElement('span');
      const cs = getComputedStyle(nameEl);
      measurer.style.position = 'fixed';
      measurer.style.left = '-9999px';
      measurer.style.top = '-9999px';
      measurer.style.visibility = 'hidden';
      measurer.style.whiteSpace = 'pre';
      measurer.style.fontFamily = cs.fontFamily;
      measurer.style.fontSize = cs.fontSize;
      measurer.style.fontWeight = cs.fontWeight;
      measurer.style.fontStyle = cs.fontStyle;
      measurer.style.letterSpacing = cs.letterSpacing;
      document.body.appendChild(measurer);
    } catch {}
    function updateWidth(){
      try {
        if (!measurer) return;
        // Ensure at least one character so we don't collapse too far
        const t = input.value || '';
        measurer.textContent = t.length > 0 ? t : ' ';
        const w = Math.ceil(measurer.getBoundingClientRect().width) + 20; // text width + 20px
        input.style.width = Math.max(40, w) + 'px';
        // Keep a safe hard cap to avoid breaking layout in extreme cases
        input.style.maxWidth = '100%';
      } catch {}
    }
    const finish = (commit) => {
      try {
        const newName = commit ? String(input.value || '').trim() || 'Untitled' : current;
        if (commit && newName !== current) {
          InlineDocs.rename(id, newName);
          // Note: autosave is triggered by InlineDocs.write() inside rename()
        }
      } catch {}
      try { if (measurer && measurer.parentNode) measurer.remove(); } catch {}
      renderHub();
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
    input.addEventListener('input', updateWidth);
    input.addEventListener('blur', () => finish(true));
    nameEl.replaceWith(input);
    updateWidth();
    // In hover mode, if the user leaves the row without focusing the input, revert gracefully
    if (hoverMode) {
      const onLeave = () => { if (document.activeElement !== input) finish(false); };
      row.addEventListener('mouseleave', onLeave, { once: true });
    }
    // Focus after replacing so selection works on Windows (unless explicitly disabled)
    if (shouldFocus) setTimeout(() => { try { input.focus(); input.select(); } catch {} }, 0);
  } catch {}
}
function newDocument(){
  const id = `doc-${(crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))}`;
  const name = 'New document'; // Default name, will be immediately editable
  const doc = { pages: [createPage('Page 1')], currentPageId: '', nextElementId: 1, editMode: true, headerHeight: 10, footerHeight: 10 };
  doc.currentPageId = doc.pages[0].id;
  InlineDocs.set(id, doc, name);
  // If a folder is active, assign the new doc to it
  try {
    const fid = AppState.get('activeFolderId');
    if (fid) InlineDocs.assignDocToFolder(id, fid);
  } catch {}

  // Re-render the hub to show the new document in the list
  renderHub();

  // Find the newly created document row and trigger inline rename
  setTimeout(() => {
    const row = document.querySelector(`.doc-row[data-id="${id}"]`);
    if (row) {
      beginInlineRename(row);
    }
  }, 0);

  try { const t = document.getElementById('docTitleInput'); if (t) t.value = name; } catch {}

  // Animate the bottom button sliding down after adding a document
  setTimeout(() => {
    const bottomBtn = document.getElementById('bottomNewDocBtn');
    if (bottomBtn) {
      bottomBtn.style.transform = 'translateY(0)';
      bottomBtn.style.opacity = '1';
    }
  }, 100);
}

function openDocument(id){
  const doc = InlineDocs.get(id);
  if (!doc) { alert('Document not found'); return; }
  Model.document = doc;
  // Always open in view mode as requested
  setEditMode(false);
  renderAll();
  AppState.set('activeDocId', id);
  AppState.activeDocId = id;
  setView('editor');
  try {
    // Update nav bar title text
    const r = (InlineDocs.list() || []).find(x => x.id === id);
    const t = document.getElementById('docTitleInput');
    if (t) t.value = r ? r.name : 'Untitled';
  } catch {}
}

function backToHub(){
  // Do not autosave when leaving the doc; navigate only
  AppState.set('activeDocId', null);
  AppState.activeDocId = null;
  setView('hub');
  renderHub();
}

function initializeHubRouter(){
  try {
    // Initial view: hub
    setView('hub');
    renderHub();
    const newBtn = document.getElementById('newDocBtn');
    if (newBtn) newBtn.addEventListener('click', newDocument);
    const hubSaveBtn = document.getElementById('hubSaveBtn');
    if (hubSaveBtn) hubSaveBtn.addEventListener('click', async () => { try { await saveDocument(); } catch {} });
    const backBtn = document.getElementById('backToHubBtn');
    if (backBtn) backBtn.addEventListener('click', backToHub);
    // Hub filename inline rename: mirrors editor title pill behavior
    try {
      const hubFileInput = document.getElementById('hubFileInput');
      if (hubFileInput){
        // Track last committed base name and in-flight rename preventer
        let lastBase = (function(){ try { const p = window.location.pathname || ''; const f = (p.split('/').pop() || '').trim(); return f.toLowerCase().endsWith('.html') ? f.slice(0, -5) : (f || 'index'); } catch { return 'index'; } })();
        let renaming = false;
        hubFileInput.value = lastBase;
        const commit = () => {
          if (renaming) return; // ignore duplicate triggers
          const clean = sanitizeFileBaseName(hubFileInput.value);
          hubFileInput.value = clean;
          if (clean === (lastBase || '')) return; // no change
          renaming = true;
          try {
            const ev = new CustomEvent('cm-request-rename', { detail: { newBaseName: clean } });
            document.dispatchEvent(ev);
          } catch { renaming = false; }
        };
        hubFileInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hubFileInput.blur(); } if (e.key === 'Escape') { e.preventDefault(); renderHub(); }});
        // Only commit on blur (Enter triggers blur). 'change' can fire twice and cause duplicates.
        hubFileInput.addEventListener('blur', commit);
        // Reflect rename completion by updating input and state
        document.addEventListener('cm-rename-done', (e) => {
          try {
            const u = String(e?.detail?.newFileUrl || location.href);
            const pn = (u.split('/').pop() || '').trim();
            const base = pn.toLowerCase().endsWith('.html') ? pn.slice(0, -5) : pn;
            lastBase = base || hubFileInput.value;
            hubFileInput.value = lastBase;
            indicateSaved();
          } catch {}
          renaming = false;
        });
        document.addEventListener('cm-rename-error', (e) => { try { console.warn('[Rename] error:', e?.detail?.error); } catch {} renaming = false; });
      }
    } catch {}
    // Inline title editing
    const titleInput = document.getElementById('docTitleInput');
    if (titleInput){
      // Initialize from current record if available
      try {
        const list = InlineDocs.list() || [];
        const rec = list.find(r => r.id === AppState.activeDocId);
        if (rec && typeof rec.name === 'string') titleInput.value = rec.name;
      } catch {}
      titleInput.addEventListener('change', () => {
        const v = String(titleInput.value || '').trim() || 'Untitled';
        try { if (AppState.activeDocId) InlineDocs.rename(AppState.activeDocId, v); } catch {}
        titleInput.value = v;
      });
      titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleInput.blur(); } });
    }

    // Check if we should restore a previously opened document
    const persistedDocId = AppState.get('activeDocId');
    if (persistedDocId && InlineDocs.get(persistedDocId)) {
      // Small delay to ensure everything is initialized
      setTimeout(() => openDocument(persistedDocId), 100);
    }
  } catch {}
}

// Debounced inline autosave that mirrors the current doc into InlineDocs and
// performs a background file save (FSA/OPFS/local) without prompts.
let __inlineSaveTimer = null;
function autosaveInline(){
  try {
    if (Settings.get('autosaveEnabled') === false) return;
    if (!AppState.activeDocId) return;
    if (__inlineSaveTimer) clearTimeout(__inlineSaveTimer);
    __inlineSaveTimer = setTimeout(async () => {
      __inlineSaveTimer = null;
      // Mirror the standard save path: update inline snapshot then ask extension to save
      try { InlineDocs.set(AppState.activeDocId, Model.document); } catch {}
      try { indicateSaving(); } catch {}
      triggerExtensionSave();
      // Completion indicator is handled by cm-save-done / cm-save-error events
    }, 500);
  } catch {}
}

// Debounced hub autosave that triggers file save when hub state changes
// (documents renamed, deleted, duplicated, folders created, etc.)
let __hubSaveTimer = null;
function autosaveHub(){
  try {
    if (Settings.get('autosaveEnabled') === false) return;
    // Only trigger when in hub view to avoid conflicts with editor autosave
    if (AppState.view !== 'hub' && AppState.get('view') !== 'hub') return;
    if (__hubSaveTimer) clearTimeout(__hubSaveTimer);
    __hubSaveTimer = setTimeout(async () => {
      __hubSaveTimer = null;
      // Trigger extension save to persist the entire HTML file with updated InlineDocs
      try { indicateSaving(); } catch {}
      triggerExtensionSave();
      // Completion indicator is handled by cm-save-done / cm-save-error events
    }, 500);
  } catch {}
}
function enforceVisibilityForAllPages(){
  try {
    // Skip global visibility enforcement in edit mode to avoid re-applying view-mode hidden flags
    if (Model && Model.document && Model.document.editMode) return;
    (Model.document.pages || []).forEach((p) => {
      const container = document.querySelector(`.page-wrapper[data-page-id="${p.id}"] .page`);
      if (!container) return;
      (p.elements || []).forEach((elm) => {
        const node = container.querySelector(`.element[data-id="${elm.id}"]`);
        if (!node) return;
        const attrs = (elm && elm.attrs) ? elm.attrs : {};
        let isHidden = false;
        try {
          if (attrs.hidden === true || attrs.hidden === 'true') isHidden = true;
          const st = String(attrs.style || '');
          if (/display\s*:\s*none/i.test(st)) isHidden = true;
        } catch {}
        if (isHidden) {
          node.style.display = 'none';
        } else {
          node.style.display = (elm.type === 'text' || elm.type === 'field' || elm.type === 'rect') ? 'flex' : '';
        }
      });
    });
  } catch {}
}

// getPageNode moved to app.view.render.js

function renderPagesList() {
  const list = pagesList();
  list.innerHTML = '';
  Model.document.pages.forEach((p, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'page-wrapper';
    wrap.dataset.pageId = p.id;

    const title = document.createElement('div');
    title.className = 'page-title';
    title.innerHTML = `
      <strong>Page ${index + 1}</strong>
      <span class="title-actions" style="float:right;display:inline-flex;gap:6px">
        <button class="btn mini" data-act="move-up" title="Move up" aria-label="Move up">
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6l-6 6h12z" fill="currentColor"/></svg>
        </button>
        <button class="btn mini" data-act="move-down" title="Move down" aria-label="Move down">
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18l6-6H6z" fill="currentColor"/></svg>
        </button>
        <button class="btn mini" data-act="toggle-visibility" title="Show/Hide" aria-label="Show or hide">
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12s-4 7.5-10.5 7.5S1.5 12 1.5 12z" fill="none" stroke="currentColor" stroke-width="2"/>
            <circle cx="12" cy="12" r="3" fill="currentColor"/>
          </svg>
        </button>
        <button class="btn mini" data-act="duplicate" title="Duplicate" aria-label="Duplicate">
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="3" width="12" height="12" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/>
            <rect x="3" y="9" width="12" height="12" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
        <button class="btn mini" data-act="delete" title="Delete" aria-label="Delete">
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M8 6V4h8v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <rect x="6" y="6" width="12" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/>
            <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="btn mini" data-act="add-below" title="Add page below" aria-label="Add page below">
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </span>`;
    wrap.appendChild(title);

    const stage = document.createElement('div');
    stage.className = 'page-stage';

    const page = document.createElement('div');
    page.className = 'page';
    page.setAttribute('aria-label', 'A4 canvas');

    // guides
    const guideV = document.createElement('div'); guideV.className = 'guide v hidden';
    const guideH = document.createElement('div'); guideH.className = 'guide h hidden';
    page.appendChild(guideV); page.appendChild(guideH);

    // Header/Footer guides
    const headerGuide = document.createElement('div');
    headerGuide.className = 'hf-guide header';
    const headerLabel = document.createElement('div'); headerLabel.className = 'hf-label'; headerLabel.textContent = '';
    const headerResize = document.createElement('div'); headerResize.className = 'hf-resize';
    headerGuide.appendChild(headerLabel); headerGuide.appendChild(headerResize);
    page.appendChild(headerGuide);

    const footerGuide = document.createElement('div');
    footerGuide.className = 'hf-guide footer';
    const footerLabel = document.createElement('div'); footerLabel.className = 'hf-label'; footerLabel.textContent = '';
    const footerResize = document.createElement('div'); footerResize.className = 'hf-resize';
    footerGuide.appendChild(footerLabel); footerGuide.appendChild(footerResize);
    page.appendChild(footerGuide);

    stage.appendChild(page);
    wrap.appendChild(stage);

    list.appendChild(wrap);

    // Render elements for this page
    renderPage(p);

    // Activate on click
    wrap.addEventListener('mousedown', (e) => {
      const clickedInsidePage = !!e.target.closest('.page');
      if (Model.document.currentPageId !== p.id) {
        // Activate the page immediately, but do not re-render here so the
        // same click can proceed to element selection/drag handlers.
        Model.document.currentPageId = p.id;
      }
      if (!clickedInsidePage) return;
    });

    // Controls actions (both title actions and any future controls)
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      if (btn.dataset.act === 'duplicate') { Model.document.currentPageId = p.id; duplicateCurrentPage(); }
      else if (btn.dataset.act === 'delete') { Model.document.currentPageId = p.id; removeCurrentPage(); }
      else if (btn.dataset.act === 'move-up') { Model.document.currentPageId = p.id; moveCurrentPage(-1); }
      else if (btn.dataset.act === 'move-down') { Model.document.currentPageId = p.id; moveCurrentPage(1); }
      else if (btn.dataset.act === 'add-below') { Model.document.currentPageId = p.id; addPage(); }
      else if (btn.dataset.act === 'toggle-visibility') {
        const stage = wrap.querySelector('.page-stage');
        if (stage) stage.classList.toggle('hidden');
      }
    });

    // Position header/footer guides using document settings
    try { updateHeaderFooterGuides(page); } catch {}

    // Enable drag-resize for header/footer on this page
    try { attachHeaderFooterResizers(page, p.id); } catch {}
  });
}

// ensureElementNode moved to app.view.render.js

// Attach user-defined action listeners to an element node
// Deprecated binder (kept no-op for compatibility with older documents that may carry an actions array)
function bindElementActions(){ /* no-op: using inline attributes approach */ }

// applyElementStyles moved to app.view.render.js

// renderPage moved to app.view.render.js
