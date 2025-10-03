/* ----------------------- Init & Events ----------------------- */
async function bootstrap(){
  //try { console.info('[App] bootstrap start'); } catch {}
  // When running in editor view, we'll load from InlineDocs if available; otherwise fall back
  let loaded = false;
  try {
    const hv = document.getElementById('hubView');
    const ev = document.getElementById('editorView');
    // If hub is visible on first load, don't load a document yet
    if (hv && !hv.hidden && ev && ev.hidden) {
      loaded = true; // defer loading until a doc is opened
    }
  } catch {}
  // Try to auto-load an embedded document (when opening a file saved via Save As)
  if (!loaded){
    try {
      if (window.Persistence && typeof Persistence.tryAutoLoad === 'function'){
        const res = await Persistence.tryAutoLoad();
        if (res && res.ok){
          loaded = true;
          try { console.info('[App] Embedded document loaded via', res.via); } catch {}
          // Switch to editor view so the loaded doc is visible immediately
          setView('editor');
        }
      }
    } catch (e) { try { console.warn('[App] Embedded load failed', e); } catch {} }
  }
  // Attempt OPFS/localStorage autosave snapshot if no embedded doc
  if (!loaded){
    try {
      const snap = await __tryLoadAutosaveSnapshot();
      if (snap){ loaded = true; setView('editor'); }
    } catch {}
  }
  // Disable auto-load of previous autosave; start with empty doc unless embedded
  if (!loaded){ loaded = false; }
  if (!loaded){
    Model.document.pages = [createPage('Page 1')];
    Model.document.currentPageId = Model.document.pages[0].id;
  }
  // Apply initial mode before rendering to avoid flicker
  setEditMode(!!Model.document.editMode);
  renderAll();
  // Try to restore file handle for silent saves across reloads
  try { if (window.Persistence && typeof Persistence.restoreHandle === 'function') { const ok = await Persistence.restoreHandle(); try { console.info('[App] restoreHandle:', ok); } catch {} } } catch {}
  // Silent-disk banner removed per request; no auto UI injected on startup

  // elements panel
  elementsPanel().addEventListener('click', (e) => {
    const btn = e.target.closest('.add-el');
    if (!btn) return;
    // If a drag just completed, ignore the click that follows
    if (__addingByDrag) { __addingByDrag = false; return; }
    addElementToVisiblePage(btn.dataset.add);
  });

  // Make element buttons draggable for drag-to-place
  try {
    elementsPanel().querySelectorAll('.add-el').forEach((btn) => {
      btn.setAttribute('draggable', 'true');
      btn.addEventListener('dragstart', (ev) => {
        try { ev.dataTransfer.setData('text/plain', btn.dataset.add); } catch {}
        ev.dataTransfer.effectAllowed = 'copy';
      });
    });
  } catch {}

  // canvas interactions: delegate to clicked page; support add-to-clicked-page and drag-to-place
  pagesList().addEventListener('mousedown', (e) => {
    const page = e.target.closest('.page');
    if (!page) return;
    const wrap = page.closest('.page-wrapper');
    const pageId = wrap?.dataset.pageId;
    if (!pageId) return;
    if (pendingAddType){
      Model.document.currentPageId = pageId;
      const pt = getCanvasPoint(e, page);
      placePendingAt(pt.x, pt.y, pageId);
      e.preventDefault();
      return;
    }
    const targetEl = e.target.closest('.element');
    if (!targetEl){
      // Disable lasso in view mode
      if (!Model || !Model.document || !Model.document.editMode) return;
      // If user is resizing header/footer, do not start a lasso
      const isHFResize = !!e.target.closest('.hf-resize');
      if (isHFResize) { e.preventDefault(); return; }
      // Starting a lasso selection: cancel any pending element drag promotion from a prior click
      dragMaybe = null;
      drag = null;
      // Prevent accidental UI text selection while lassoing
      document.body.classList.add('app-noselect');
      e.preventDefault();
      // lasso on drag only; click without movement just clears/keeps selection
      const start = { x: e.clientX, y: e.clientY };
      const lasso = document.getElementById('lasso');
      let additive = e.shiftKey || e.ctrlKey || e.metaKey;
      let moved = false;
      const onMove = (ev) => {
        const dx = ev.clientX - start.x; const dy = ev.clientY - start.y;
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // threshold
        moved = true;
        lasso.hidden = false;
        const left = Math.min(start.x, ev.clientX);
        const top = Math.min(start.y, ev.clientY);
        const w = Math.abs(dx); const h = Math.abs(dy);
        Object.assign(lasso.style, { left:left+'px', top:top+'px', width:w+'px', height:h+'px' });
        const hits = [];
        document.querySelectorAll('.page .element').forEach(node => {
          const r = node.getBoundingClientRect();
          const inter = !(left > r.left + r.width || left + w < r.left || top > r.top + r.height || top + h < r.top);
          if (inter) hits.push(node.dataset.id);
        });
        additive ? setSelection([...selectedIds, ...hits]) : setSelection(hits);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.classList.remove('app-noselect');
        lasso.hidden = true;
        if (!moved) {
          // click without movement toggles/clears selection
          additive ? null : clearSelection();
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }
    if (getPageNode() === page) onMouseDown(e);
  });

  // Drag-over/drop to place element where dropped
  pagesList().addEventListener('dragover', (e) => {
    const page = e.target.closest('.page');
    if (!page) return;
    const type = (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('text/plain')) ? 'ok' : null;
    if (!type) return;
    e.preventDefault();
    // Stop bubbling so the viewport dragover doesn't also run
    if (e.stopPropagation) e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  });
  pagesList().addEventListener('drop', (e) => {
    const page = e.target.closest('.page');
    if (!page) return;
    const wrap = page.closest('.page-wrapper');
    const pageId = wrap?.dataset.pageId;
    if (!pageId) return;
    let type = '';
    try { type = e.dataTransfer.getData('text/plain'); } catch { type = ''; }
    if (!type) return;
    e.preventDefault();
    // Stop bubbling so the viewport drop handler doesn't also place the element
    if (e.stopPropagation) e.stopPropagation();
    const pt = getCanvasPoint(e, page);
    Model.document.currentPageId = pageId;
    pendingAddType = type;
    placePendingAt(pt.x, pt.y, pageId);
    __addingByDrag = true; // consume immediate click after drop
  });
  // Allow starting a lasso selection from outside of any page within the viewport
  const viewportEl = document.getElementById('pageViewport');
  if (viewportEl){
    // Support dropping onto empty viewport areas too (choose most visible page)
    viewportEl.addEventListener('dragover', (e) => {
      const hasText = e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('text/plain');
      if (!hasText) return;
      // Only allow if pointer is visually over a page or we have any page visible
      const page = e.target.closest && e.target.closest('.page');
      if (!page) {
        const info = getMostVisiblePageInfo();
        if (!info) return;
      }
      e.preventDefault();
      // Prevent the event from bubbling to any parent handlers
      if (e.stopPropagation) e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    });
    viewportEl.addEventListener('drop', (e) => {
      let type = '';
      try { type = e.dataTransfer.getData('text/plain'); } catch { type = ''; }
      if (!type) return;
      const page = e.target.closest && e.target.closest('.page');
      if (page){
        const wrap = page.closest('.page-wrapper');
        const pageId = wrap?.dataset.pageId; if (!pageId) return;
        e.preventDefault();
        // Stop bubbling so other drop listeners don't also run
        if (e.stopPropagation) e.stopPropagation();
        const pt = getCanvasPoint(e, page);
        Model.document.currentPageId = pageId;
        pendingAddType = type;
        placePendingAt(pt.x, pt.y, pageId);
        __addingByDrag = true;
      } else {
        const info = getMostVisiblePageInfo(); if (!info) return;
        e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        const pr = info.pageNode.getBoundingClientRect();
        const z = (typeof getZoom === 'function') ? (getZoom() || 1) : 1;
        const cx = e.clientX; const cy = e.clientY;
        const x = (cx - pr.left) / z; const y = (cy - pr.top) / z;
        Model.document.currentPageId = info.pageId;
        pendingAddType = type;
        placePendingAt(x, y, info.pageId);
        __addingByDrag = true;
      }
    });
    viewportEl.addEventListener('mousedown', (e) => {
      // If inside a page, let the page handler above manage it
      if (e.target.closest && e.target.closest('.page')) return;
      // Disable outside-page lasso in view mode
      if (!Model || !Model.document || !Model.document.editMode) return;
      // Ignore clicks on overlays/toolbars within the viewport
      const bar = formatToolbar && formatToolbar();
      if (bar && bar.contains && bar.contains(e.target)) return;
      const bubble = elementActions && elementActions();
      if (bubble && bubble.contains && bubble.contains(e.target)) return;
      const tblMenu = document.getElementById('tableMenu');
      if (tblMenu && tblMenu.contains && tblMenu.contains(e.target)) return;

      // Start lasso selection similar to inside-page behavior
      // Cancel any pending single-element drag from previous clicks
      dragMaybe = null; drag = null;
      // Prevent accidental UI text selection while lassoing
      document.body.classList.add('app-noselect');
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY };
      const lasso = document.getElementById('lasso');
      let additive = e.shiftKey || e.ctrlKey || e.metaKey;
      let moved = false;
      const onMove = (ev) => {
        const dx = ev.clientX - start.x; const dy = ev.clientY - start.y;
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // threshold
        moved = true;
        lasso.hidden = false;
        const left = Math.min(start.x, ev.clientX);
        const top = Math.min(start.y, ev.clientY);
        const w = Math.abs(dx); const h = Math.abs(dy);
        Object.assign(lasso.style, { left:left+'px', top:top+'px', width:w+'px', height:h+'px' });
        const hits = [];
        document.querySelectorAll('.page .element').forEach(node => {
          const r = node.getBoundingClientRect();
          const inter = !(left > r.left + r.width || left + w < r.left || top > r.top + r.height || top + h < r.top);
          if (inter) hits.push(node.dataset.id);
        });
        additive ? setSelection([...selectedIds, ...hits]) : setSelection(hits);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.classList.remove('app-noselect');
        lasso.hidden = true;
        if (!moved) {
          // click without movement clears selection when outside the page
          additive ? null : clearSelection();
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }
  // Centralized window listeners (bound once)
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('mouseup', onMouseUp, { passive: true });
  window.addEventListener('resize', () => { updateFormatToolbarVisibility(); alignOverlays(); });
  window.addEventListener('scroll', () => { alignOverlays(); }, true);

  // Snap/Guides toggles
  const snapToggle = document.getElementById('snapToggle');
  const guidesToggle = document.getElementById('guidesToggle');
  const rulersToggle = document.getElementById('rulersToggle');
  const minimapToggle = document.getElementById('minimapToggle');
  // Initialize header/footer guides for all pages after bootstrap
  try { document.querySelectorAll('.page').forEach(p => updateHeaderFooterGuides(p)); } catch {}
  let SNAP_ENABLED = true;
  let GUIDES_ENABLED = false; // default off per request
  function updateSnapGuides(){
    SNAP_ENABLED = !snapToggle || !!snapToggle.checked;
    GUIDES_ENABLED = !!(guidesToggle && guidesToggle.checked);
  }
  snapToggle?.addEventListener('change', updateSnapGuides);
  guidesToggle?.addEventListener('change', updateSnapGuides);
  updateSnapGuides();

  // Rulers visibility
  const rulers = document.getElementById('rulers');
  const rulerH = document.getElementById('rulerH');
  const rulerV = document.getElementById('rulerV');
  rulersToggle?.addEventListener('change', () => {
    if (!rulers) return;
    rulers.classList.toggle('hidden', !rulersToggle.checked);
    if (rulersToggle.checked) drawRulers();
  });
  if (rulers && rulersToggle && rulersToggle.checked) rulers.classList.remove('hidden');

  // Minimap visibility
  const minimap = document.getElementById('minimap');
  minimapToggle?.addEventListener('change', () => {
    if (!minimap) return;
    minimap.classList.toggle('hidden', !minimapToggle.checked);
    if (minimapToggle.checked) drawMinimap();
  });
  if (minimap && minimapToggle && minimapToggle.checked) minimap.classList.remove('hidden');


  function drawRulers(){
    if (!rulers || !rulerH || !rulerV) return;
    // Simple tick marks using background gradients for performance
    const mmPerPx = 1; // not calibrated; placeholder scale
    rulerH.style.backgroundImage = `linear-gradient(to right, transparent 0, transparent 9px, #ddd 9px, #ddd 10px)`;
    rulerH.style.backgroundSize = '10px 100%';
    rulerV.style.backgroundImage = `linear-gradient(to bottom, transparent 0, transparent 9px, #ddd 9px, #ddd 10px)`;
    rulerV.style.backgroundSize = '100% 10px';
  }
  function drawMinimap(){
    if (!minimap) return; const ctx = minimap.getContext('2d'); if (!ctx) return;
    const page = getPageNode(); if (!page) { ctx.clearRect(0,0,minimap.width,minimap.height); return; }
    const pr = page.getBoundingClientRect();
    const scale = Math.min(minimap.width / pr.width, minimap.height / pr.height);
    ctx.clearRect(0,0,minimap.width,minimap.height);
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,minimap.width,minimap.height);
    ctx.strokeStyle = '#ddd'; ctx.strokeRect(0.5,0.5,Math.round(pr.width*scale)-1,Math.round(pr.height*scale)-1);
    // Draw elements
    const p = getCurrentPage(); if (!p) return;
    p.elements.forEach(el => {
      const x = Math.round(el.x * scale); const y = Math.round(el.y * scale);
      const w = Math.max(1, Math.round((el.w||1) * scale)); const h = Math.max(1, Math.round((el.h||1) * scale));
      ctx.fillStyle = '#8888ff';
      ctx.globalAlpha = 0.5; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#6666cc'; ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
    });
  }

  // Keep rulers/minimap in sync
  ['scroll','resize'].forEach(evt => window.addEventListener(evt, () => { drawRulers(); if (minimap && !minimap.classList.contains('hidden')) drawMinimap(); }, { passive:true }));

  // text/field/rect editing (field editable even when edit mode is off)
  pagesList().addEventListener('dblclick', (e) => {
    const active = getPageNode();
    if (!active || !active.contains(e.target)) return;

    const elNode = e.target.closest('.element.text, .element.field, .element.rect');
    if (!elNode) return;

    // Only block editing when it's a text or rect element AND edit mode is off
    if ((elNode.classList.contains('text') || elNode.classList.contains('rect')) && !Model.document.editMode) return;

    // Prevent selection/move logic from running on this click and cancel any drags
    drag = null; dragMaybe = null; dragSelection = null; resize = null; rotateSelectionState = null; resizeSelectionState = null;
    e.stopPropagation();
    e.preventDefault();

    const id = elNode.dataset.id;
    setSelection([id]);

    // If element has placeholder, clear it when starting to edit
    if (elNode.classList.contains('has-placeholder')) {
      elNode.textContent = '';
      elNode.classList.remove('has-placeholder');
    }

    // If formula exists, show the formula text while editing; otherwise show content
    try {
      const model = getElementById(id);
      const existingFormula = String(model?.attrs?.formula || '').trim();
      if (existingFormula){ elNode.textContent = existingFormula; }
    } catch {}

    // Use plaintext-only to ensure Enter inserts a newline and no HTML is injected
    elNode.setAttribute('contenteditable', 'plaintext-only');
    elNode.classList.add('editing');
    elNode.focus();
    // Place caret at the end of existing text so typing appends
    try {
      const sel = window.getSelection();
      if (sel) {
        let range = document.createRange();
        const first = elNode.firstChild;
        if (first && first.nodeType === Node.TEXT_NODE) {
          const len = first.textContent ? first.textContent.length : 0;
          range.setStart(first, len);
        } else {
          range.selectNodeContents(elNode);
          range.collapse(false);
        }
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch {}

    // Track cancel to support Esc behavior (discard changes)
    let cancelled = false;
    const insertNewlineAtCaret = () => {
      try {
        const sel = window.getSelection(); if (!sel) return; if (sel.rangeCount === 0) { elNode.textContent = (elNode.textContent||'') + "\n"; return; }
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode("\n");
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        sel.removeAllRanges(); sel.addRange(range);
      } catch {}
    };

    const onBlur = () => {
      elNode.removeEventListener('blur', onBlur);
      elNode.removeEventListener('keydown', onKey);
      // Stop inline picker if active
      try { if (elNode._pickerDoneRef) { elNode._pickerDoneRef(); } } catch {}
      elNode.setAttribute('contenteditable', 'false');
      elNode.classList.remove('editing');
      if (cancelled){
        // Re-render to restore original value
        renderPage(getCurrentPage());
        return;
      }
      const text = elNode.textContent || '';
      // If starts with '=', treat as formula and store into attrs.formula; otherwise content
      if (text.trim().startsWith('=')){
        applyPatchToSelection(toPatch('attrs.formula', text.trim()));
        // Recalculate now so user sees value
        try { if (typeof window.recalculateAllFormulas === 'function') window.recalculateAllFormulas(); } catch {}
        // Re-render all pages so cross-page formula dependencies reflect latest values
        try { if (Model && Model.document && Array.isArray(Model.document.pages)) { Model.document.pages.forEach((p)=>{ try { renderPage(p); } catch {} }); } } catch {}
      } else {
        // Plain text: update content and clear any existing formula attribute
        updateElement(id, { content: text, attrs: { formula: null } });
      }
      
      // Re-render to show placeholder if content is empty
      if (!text) { renderPage(getCurrentPage()); }
    };
    const onKey = (ke) => {
      if (ke.key === 'Enter' && ke.shiftKey){
        // New line, keep editing
        ke.preventDefault();
        insertNewlineAtCaret();
        return;
      }
      if (ke.key === 'Enter' && !ke.shiftKey){
        // Commit and exit
        ke.preventDefault();
        elNode.blur();
        return;
      }
      if (ke.key === 'Escape'){
        // Cancel and exit
        ke.preventDefault();
        cancelled = true;
        elNode.blur();
      }
    };
    elNode.addEventListener('blur', onBlur);
    elNode.addEventListener('keydown', onKey);

    // If we entered edit mode with an existing formula, auto-enable picker
    try {
      const txtNow = String(elNode.textContent || '');
      if (txtNow.trim().startsWith('=')) { startInlineFormulaPicker(elNode); }
    } catch {}
  });

  // edit mode toggle button
  const etb = (typeof editToggleBtn === 'function') ? editToggleBtn() : document.getElementById('editToggleBtn');
  if (etb){
    etb.addEventListener('click', () => setEditMode(!Model.document.editMode));
  }

  // per-page controls exist inside each wrapper; no global page strip

  // undo/redo
  undoBtn().addEventListener('click', undo);
  redoBtn().addEventListener('click', redo);
  // Keyboard shortcuts: Undo/Redo
  // - Ctrl/Cmd + Z => Undo
  // - Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y => Redo
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const isEditing = active && (
      active.contentEditable === 'true' ||
      active.contentEditable === 'plaintext-only' ||
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA'
    );
    if (isEditing) return; // let native undo work while typing

    if (e.ctrlKey || e.metaKey) {
      const k = String(e.key || '').toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) { redo(); } else { undo(); }
      } else if (k === 'y') {
        e.preventDefault();
        redo();
      }
    }
  });

  // keyboard shortcuts for copy/paste (element-level)
  // IMPORTANT: if a table selection exists, DO NOT intercept copy/paste here.
  // But for Ctrl+Shift+V, set a flag to request values-only paste before letting native paste fire.
  document.addEventListener('keydown', (e) => {
    const isEditing = document.activeElement && (
      document.activeElement.contentEditable === 'true' ||
      document.activeElement.contentEditable === 'plaintext-only' ||
      document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagName === 'TEXTAREA'
    );
    if (isEditing) return;

    // If a table selection is active, allow default so our 'copy'/'paste' listeners run.
    // For Ctrl+Shift+V, mark values-only paste before letting the paste event proceed.
    if (tableSel && (e.ctrlKey || e.metaKey)) {
      if (e.key === 'v' || e.key === 'V') {
        if (e.shiftKey) {
          try { window.__valuesOnlyPaste = true; } catch { window.__valuesOnlyPaste = true; }
        }
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedIds.size > 0) {
      e.preventDefault();
      copyToClipboard();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'x' && selectedIds.size > 0) {
      e.preventDefault();
      cutToClipboard();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      pasteFromClipboard();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
      // Ctrl+Shift+V: values-only paste for tables; do not intercept table selection copy/paste above
      if (tableSel) return; // allow table paste listener to handle
      try { window.__valuesOnlyPaste = true; } catch { window.__valuesOnlyPaste = true; }
      // Trigger native paste event to reuse table handler if a table anchor exists, otherwise element-level paste
      const evt = new ClipboardEvent('paste', { bubbles: true });
      document.dispatchEvent(evt);
    }
  });

  // While editing a text/field/rect, if typing begins with '=', switch to formula mode and enable picker
  pagesList().addEventListener('keydown', (e) => {
    const elNode = e.target && e.target.closest && e.target.closest('.element.text, .element.field, .element.rect');
    if (!elNode) return;
    if (elNode.getAttribute('contenteditable') !== 'plaintext-only') return;
    if (e.key === '=' && elNode.textContent === ''){
      // Insert '=' and optionally allow picking elements by clicking while holding Alt
      e.preventDefault();
      elNode.textContent = '=';
      // Place cursor at the end after inserting '='
      const sel = window.getSelection(); if (sel) {
        const range = document.createRange();
        const textNode = elNode.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          range.setStart(textNode, 1);
          range.collapse(true);
          sel.removeAllRanges(); sel.addRange(range);
        }
      }
      try { startInlineFormulaPicker(elNode); } catch {}
    }
  });
  // Inline picker that inserts #id tokens into a contenteditable host while composing a formula
  function startInlineFormulaPicker(host){
    if (window.__PICKING) return () => {};
    const prevSelIds = Array.from(document.querySelectorAll('.page .element.selected'))
      .map(n => n && n.getAttribute('data-id'))
      .filter(Boolean);
    const pageEl = document.querySelector('.page'); if (!pageEl) return;
    let last;
    window.__PICKING = true; document.body.classList.add('app-noselect');
    try { window.__PICKER_HOST = host; } catch {}
    // Allow text selection/caret movement inside the host while picker is active
    const prevUserSelect = host && host.style ? host.style.userSelect : undefined;
    const prevWebkitUserSelect = host && host.style ? host.style.webkitUserSelect : undefined;
    try {
      if (host && host.style) {
        // Use important to win over body.app-noselect
        host.style.setProperty('user-select', 'text', 'important');
        host.style.setProperty('-webkit-user-select', 'text', 'important');
      }
    } catch {}
    // Do not block events inside the host so the caret can be moved within the formula
    const blockDown = (ev) => { if (host && (host === ev.target || host.contains(ev.target))) return; ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('pointerdown', blockDown, true);
    document.addEventListener('mousedown', blockDown, true);
    const onMove = (ev) => {
      const cell = ev.target.closest('.table-cell');
      let el = cell || ev.target.closest('.page .element');
      // Ignore the actively edited host element
      if (el === host || (host && el && host.contains(el))) el = null;
      if (last === el) return; if (last) last.style.outline = ''; last = el; if (last) last.style.outline = '2px solid var(--primary)';
    };
    const done = () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      try { if (onHostInput) host.removeEventListener('input', onHostInput); } catch {}
      document.removeEventListener('pointerdown', blockDown, true);
      document.removeEventListener('mousedown', blockDown, true);
      if (last) last.style.outline = '';
      window.__PICKING = false; document.body.classList.remove('app-noselect');
      try { window.__PICKER_HOST = null; } catch {}
      // Restore host selection behavior
      try {
        if (host && host.style) {
          if (typeof prevUserSelect === 'string') host.style.setProperty('user-select', prevUserSelect || ''); else host.style.removeProperty('user-select');
          if (typeof prevWebkitUserSelect === 'string') host.style.setProperty('-webkit-user-select', prevWebkitUserSelect || ''); else host.style.removeProperty('-webkit-user-select');
        }
      } catch {}
      if (Array.isArray(prevSelIds) && prevSelIds.length && typeof setSelection === 'function') setSelection(prevSelIds);
      try { host._pickerDoneRef = null; } catch {}
    };
    const onKey = (ke) => { if (ke.key === 'Escape'){ ke.preventDefault(); done(); } };
    // Stop picker automatically if the host no longer starts with '='
    const onHostInput = () => {
      try {
        const txt = String(host.textContent || '');
        if (!txt.trim().startsWith('=')) { done(); }
      } catch {}
    };
    try { host.addEventListener('input', onHostInput); } catch {}
    const onClick = (ev) => {
      // Allow normal clicks inside the host so the caret can move
      if (host && (host === ev.target || host.contains(ev.target))) return;
      const cell = ev.target.closest('.table-cell');
      const el = cell || ev.target.closest('.page .element');
      if (!el) { done(); return; }
      ev.preventDefault(); ev.stopPropagation();
      let token = '';
      if (cell){ const cid = cell.getAttribute('data-id'); if (cid) token = `"#${cid}"`; }
      else { const id = el.getAttribute('data-id'); if (id) token = `"#${id}"`; }
      // Insert token at end (no extra spaces; quotes make it distinct)
      const oldContent = String(host.textContent || '');
      host.textContent = oldContent + token;
      // Place cursor at the end after inserting token
      const sel = window.getSelection(); if (sel) {
        const range = document.createRange();
        const textNode = host.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          range.setStart(textNode, textNode.textContent?.length || 0);
          range.collapse(true);
          sel.removeAllRanges(); sel.addRange(range);
        }
      }
      host.focus();
    };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    try { host._pickerDoneRef = done; } catch {}
    return done;
  }
  try { window.startInlineFormulaPicker = startInlineFormulaPicker; } catch {}

  // save and export
  saveBtn().addEventListener('click', saveDocument);
  // Hook up More menu items (Save As / Exports)
  const moreBtn = document.getElementById('moreMenuBtn');
  const moreMenu = document.getElementById('moreMenu');
  if (moreBtn && moreMenu){
    const toggleMenu = (open) => {
      const willOpen = typeof open === 'boolean' ? open : moreMenu.classList.contains('hidden');
      moreMenu.classList.toggle('hidden', !willOpen);
      moreBtn.setAttribute('aria-expanded', String(willOpen));
    };
    moreBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    document.addEventListener('click', (e) => { if (!moreMenu.contains(e.target) && e.target !== moreBtn) toggleMenu(false); });
  }
  // Hub view: minimal More menu (Settings only)
  const hubMoreBtn = document.getElementById('hubMoreMenuBtn');
  const hubMoreMenu = document.getElementById('hubMoreMenu');
  if (hubMoreBtn && hubMoreMenu){
    const toggleHubMenu = (open) => {
      const willOpen = typeof open === 'boolean' ? open : hubMoreMenu.classList.contains('hidden');
      hubMoreMenu.classList.toggle('hidden', !willOpen);
      hubMoreBtn.setAttribute('aria-expanded', String(willOpen));
    };
    hubMoreBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleHubMenu(); });
    document.addEventListener('click', (e) => { if (!hubMoreMenu.contains(e.target) && e.target !== hubMoreBtn) toggleHubMenu(false); });
  }
  // Settings dialog wiring
  (function bindSettings(){
    const openBtn = document.getElementById('settingsBtn');
    const hubOpenBtn = document.getElementById('hubSettingsBtn');
    const dialog = document.getElementById('settingsDialog');
    const closeBtn = document.getElementById('settingsCloseBtn');
    const autoToggle = document.getElementById('autosaveToggle');
    function sync(){ try { if (autoToggle){ const on = Settings.get('autosaveEnabled') !== false; autoToggle.checked = !!on; const span = autoToggle.nextElementSibling; if (span) span.textContent = on ? 'On' : 'Off'; } } catch {} }
    function open(){ if (!dialog) return; sync(); dialog.classList.remove('hidden'); }
    function close(){ if (!dialog) return; dialog.classList.add('hidden'); }
    if (openBtn) openBtn.addEventListener('click', (e)=>{ e.stopPropagation(); open(); });
    if (hubOpenBtn) hubOpenBtn.addEventListener('click', (e)=>{ e.stopPropagation(); try { hubMoreMenu?.classList.add('hidden'); hubMoreBtn?.setAttribute('aria-expanded','false'); } catch{} open(); });
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (dialog) dialog.addEventListener('click', (e)=>{ if (e.target === dialog) close(); });
    document.addEventListener('keydown', (e)=>{ if (dialog && !dialog.classList.contains('hidden') && e.key === 'Escape') close(); });
    if (autoToggle) autoToggle.addEventListener('change', ()=>{ const on = !!autoToggle.checked; Settings.set('autosaveEnabled', on); const span = autoToggle.nextElementSibling; if (span) span.textContent = on ? 'On' : 'Off'; });
  })();
  const saveAs = document.getElementById('saveAsBtn');
  if (saveAs) saveAs.addEventListener('click', saveDocumentAs);
  const pngBtn = document.getElementById('exportPngBtn');
  const jpgBtn = document.getElementById('exportJpgBtn');
  const pdfBtn = document.getElementById('savePdfBtn');
  if (pdfBtn) pdfBtn.addEventListener('click', () => ExportService.exportDocumentToPdf());
  if (pngBtn) pngBtn.addEventListener('click', () => ExportService.exportCurrentPageToImage({ format: 'png' }));
  if (jpgBtn) jpgBtn.addEventListener('click', () => ExportService.exportCurrentPageToImage({ format: 'jpg', quality: 0.85 }));
  
  // floating toolbar wiring
  bindFloatingToolbar();

  // Layers UI removed per request (keep app logic intact)

  // table clipboard handlers
  bindTableClipboard();

  // Initial zoom
  setZoomScale(1);
  if (zoomSlider()){
    zoomSlider().addEventListener('input', (e) => {
      const target = (Number(e.target.value)||100)/100;
      zoomAtViewportCenter(target);
    });
  }
  // Ctrl/Cmd + wheel zoom over page only, keep cursor fixed
  window.addEventListener('wheel', (e) => {
    const overWorkspace = !!(e.target.closest && (e.target.closest('.page') || e.target.closest('#pageViewport')));
    if (!overWorkspace) return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    const factor = dir > 0 ? 1.05 : 0.95;
    const next = getZoom() * factor;
    const vpRect = document.getElementById('pageViewport').getBoundingClientRect();
    const cx = Math.max(vpRect.left, Math.min(e.clientX, vpRect.right));
    const cy = Math.max(vpRect.top,  Math.min(e.clientY, vpRect.bottom));
    zoomAtClientPoint(cx, cy, next);
  }, { passive:false });
  // Safari pinch gestures
  window.addEventListener('gesturestart',  (e) => { if (e.target.closest && (e.target.closest('.page') || e.target.closest('#pageViewport'))) e.preventDefault(); }, { passive:false });
  window.addEventListener('gesturechange', (e) => {
    if (!(e.target.closest && (e.target.closest('.page') || e.target.closest('#pageViewport')))) return;
    e.preventDefault();
    zoomAtClientPoint(e.clientX, e.clientY, getZoom() * e.scale);
  }, { passive:false });

  // element actions wiring
  const actions = elementActions();
  actions.addEventListener('click', (e) => {
    const menuToggle = e.target.closest('[data-menu]');
    if (menuToggle) {
      const key = menuToggle.dataset.menu;
      const panel = actions.querySelector(`[data-menu-panel="${key}"]`);
      panel.classList.toggle('hidden');
      return;
    }
    const btn = e.target.closest('[data-action],[data-z],[data-group],[data-group-toggle],[data-align],[data-distribute]'); if (!btn) return;
    if (btn.hasAttribute('data-group-toggle')) { toggleGroupSelection(); updateGroupToggleButton(); return; }
    if (selectedIds.size===0) return;
    if (btn.dataset.action === 'copy') {
      copySelection();
    } else if (btn.dataset.action === 'delete') {
      deleteSelection();
    } else if (btn.dataset.action === 'duplicate') {
      copySelection();
    } else if (btn.dataset.z) {
      if (btn.dataset.z === 'front') sendSelectionToFront();
      else if (btn.dataset.z === 'back') sendSelectionToBack();
      else if (btn.dataset.z === 'up') bringSelectionForward();
      else if (btn.dataset.z === 'down') sendSelectionBackward();
      // close dropdown after action
      const open = actions.querySelector('[data-menu-panel]'); if (open) open.classList.add('hidden');
    } else if (btn.dataset.align) {
      alignSelection(btn.dataset.align);
    } else if (btn.dataset.distribute) {
      distributeSelection(btn.dataset.distribute);
    }
  });

  // Close dropdown on outside click or ESC
  document.addEventListener('click', (e) => {
    const panel = actions.querySelector('[data-menu-panel]');
    if (!panel) return; if (panel.classList.contains('hidden')) return;
    if (!actions.contains(e.target)) panel.classList.add('hidden');
  });

  // Command palette (Ctrl/Cmd+K)
  const cp = document.getElementById('commandPalette');
  const ci = document.getElementById('commandInput');
  const cl = document.getElementById('commandList');
  const COMMANDS = [
    { id:'duplicate', label:'Duplicate selection (Ctrl+D)', run: ()=> copySelection() },
    { id:'delete', label:'Delete selection (Del)', run: ()=> deleteSelection() },
    { id:'group', label:'Group selection', run: ()=> groupSelection() },
    { id:'ungroup', label:'Ungroup selection', run: ()=> ungroupSelection() },
    { id:'align-left', label:'Align Left', run: ()=> alignSelection('left') },
    { id:'align-center', label:'Align Center', run: ()=> alignSelection('center') },
    { id:'align-right', label:'Align Right', run: ()=> alignSelection('right') },
    { id:'align-top', label:'Align Top', run: ()=> alignSelection('top') },
    { id:'align-middle', label:'Align Middle', run: ()=> alignSelection('middle') },
    { id:'align-bottom', label:'Align Bottom', run: ()=> alignSelection('bottom') },
    { id:'distribute-h', label:'Distribute Horizontally', run: ()=> distributeSelection('h') },
    { id:'distribute-v', label:'Distribute Vertically', run: ()=> distributeSelection('v') },
    { id:'export-png', label:'Export current page (PNG)', run: ()=> ExportService.exportCurrentPageToImage({format:'png'}) },
    { id:'export-jpg', label:'Export current page (JPG)', run: ()=> ExportService.exportCurrentPageToImage({format:'jpg'}) },
    { id:'export-pdf', label:'Export document (PDF)', run: ()=> ExportService.exportDocumentToPdf() },
  ];
  function openPalette(){ if (!cp) return; cp.classList.remove('hidden'); ci.value=''; renderCmds(''); ci.focus(); }
  function closePalette(){ if (!cp) return; cp.classList.add('hidden'); }
  function renderCmds(q){ if (!cl) return; const qq = q.trim().toLowerCase(); cl.innerHTML=''; COMMANDS.filter(c=>c.label.toLowerCase().includes(qq)).forEach(c=>{ const b=document.createElement('button'); b.className='btn'; b.textContent=c.label; b.style.justifyContent='flex-start'; b.addEventListener('click', ()=>{ c.run(); closePalette(); }); cl.appendChild(b); }); }
  document.addEventListener('keydown', (e)=>{
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    if (cp && !cp.classList.contains('hidden') && e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });
  ci?.addEventListener('input', ()=> renderCmds(ci.value));
  cp?.addEventListener('click', (e)=>{ if (e.target === cp) closePalette(); });
  // Deselect elements when clicking anywhere outside of a page (but ignore editor overlays)
  document.addEventListener('mousedown', (e) => {
    const t = e.target;
    // If clicking inside a page, let page handlers manage selection
    if (t.closest && t.closest('.page')) return;
    // Ignore clicks inside overlays/toolbars that operate on the current selection
    const bar = formatToolbar && formatToolbar();
    if (bar && bar.contains && bar.contains(t)) return;
    // Do not clear selection when interacting with side panels
    const propsPanel = document.getElementById('propertiesPanel');
    if (propsPanel && propsPanel.contains && propsPanel.contains(t)) return;
    const elsPanel = document.getElementById('elementsPanel');
    if (elsPanel && elsPanel.contains && elsPanel.contains(t)) return;
    const tblMenu = document.getElementById('tableMenu');
    if (tblMenu && tblMenu.contains && tblMenu.contains(t)) return;
    const tblActions = document.getElementById('tableActions');
    if (tblActions && tblActions.contains && tblActions.contains(t)) return;
    const bubble = elementActions && elementActions();
    if (bubble && bubble.contains && bubble.contains(t)) return;
    const selBox = selectionBoxEl && selectionBoxEl();
    if (selBox && selBox.contains && selBox.contains(t)) return;
    // Otherwise, clear element selection
    if (selectedIds && selectedIds.size > 0) clearSelection();
  });

  // Element context menu (right-click) — reuse the actions bar "..." dropdown
  (function bindElementContextMenu(){
    document.addEventListener('contextmenu', (e) => {
      const el = e.target.closest?.('.element');
      if (!el) return; // allow default context menu elsewhere
      e.preventDefault();
      const id = el.dataset.id;
      if (!selectedIds.has(id)) setSelection([id]);
      // Ensure the element actions bubble is visible and positioned
      try { elementActions().classList.remove('hidden'); positionElementActions(); } catch {}
      // Open the existing actions dropdown panel
      const actionsEl = elementActions && elementActions();
      if (!actionsEl) return;
      const panel = actionsEl.querySelector('[data-menu-panel="actions"]');
      if (panel) panel.classList.remove('hidden');
    });
  })();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const panel = actions.querySelector('[data-menu-panel]'); if (panel) panel.classList.add('hidden');
      // Also deselect elements when Esc is pressed and not editing text or table cell
      const active = document.activeElement;
      const isEditing = active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (!isEditing && (!window.tableSel)) { clearSelection(); }
    }
    // Delete selection via keyboard when not typing in inputs (Backspace no longer deletes elements)
    if (e.key === 'Delete'){
      const active = document.activeElement;
      const isEditing = active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (!isEditing && selectedIds.size > 0){ e.preventDefault(); deleteSelection(); }
    }
    // Duplicate selection: Ctrl/Cmd + D
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')){
      const active = document.activeElement;
      const isEditing = active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (!isEditing && selectedIds.size > 0){ e.preventDefault(); copySelection(); }
    }
  });

  // Keep overlays anchored while scrolling containers
  document.addEventListener('scroll', () => { alignOverlays(); }, true);
  const vp = document.getElementById('pageViewport');
  if (vp) vp.addEventListener('scroll', alignOverlays, { passive: true });

  // Selection-box resize events
  const selBox = selectionBoxEl();
  selBox.addEventListener('mousedown', (e) => {
    // Disallow resizing when edit mode is off (fields should remain editable-only)
    if (!Model.document.editMode) return;
    const h = e.target.closest('.sb-h'); if (!h) return;
    // Hide element actions while resizing/moving/rotating from selection box
    try { elementActions().classList.add('hidden'); } catch {}
    startSelectionResize(h.dataset.handle, e);
    const onMove = (ev) => { applySelectionResize(ev); };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (resizeSelectionState){ commitHistory('resize-multi'); resizeSelectionState = null; hideGuides(); updateSelectionBox(); }
      if (rotateSelectionState){ rotateSelectionState = null; hideGuides(); updateSelectionBox(); }
      // Re-show the actions bubble after gesture end
      try { positionElementActions(); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault(); e.stopPropagation();
  });
}

// Custom Color Picker like Canva
const COLOR_HISTORY_KEY = 'certificateMaker-colorHistory';
const MAX_COLOR_HISTORY = 8;

let currentColorInput = null;
let customColorPicker = null;
let deferredHistoryColor = null; // remember last chosen color while the picker is open

function getColorHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(COLOR_HISTORY_KEY) || '[]');
    // If no history exists, provide MonTech brand colors and essential colors
    if (stored.length === 0) {
      return [
        '#E10600', '#222222', '#F5F5F5', '#FFFFFF', 
        '#000000', '#808080', '#C0C0C0', '#E74C3C'
      ];
    }
    return stored;
  } catch {
    return [
      '#E10600', '#222222', '#F5F5F5', '#FFFFFF', 
      '#000000', '#808080', '#C0C0C0', '#E74C3C'
    ];
  }
}

function addToColorHistory(color) {
  if (!color || color === 'transparent') return;
  
  let history = getColorHistory();
  
  // Remove color if it already exists
  history = history.filter(c => c.toLowerCase() !== color.toLowerCase());
  
  // Add to beginning
  history.unshift(color);
  
  // Limit to max colors
  history = history.slice(0, MAX_COLOR_HISTORY);
  
  localStorage.setItem(COLOR_HISTORY_KEY, JSON.stringify(history));
  
  // Update the color picker if it's open
  if (customColorPicker && !customColorPicker.classList.contains('hidden')) {
    updateCustomColorPickerHistory();
  }
}

function createCustomColorPickerElement() {
  const picker = document.createElement('div');
  picker.className = 'custom-color-picker hidden';
  // Add data-role attributes so we can scope queries even if duplicate IDs existed in static HTML
  picker.innerHTML = `
    <div class="color-picker-section">
      <h4>Recent Colors</h4>
      <div class="color-history-grid" id="colorHistoryGrid" data-role="colorHistoryGrid"></div>
    </div>
    <div class="color-picker-section">
      <h4>Custom Color</h4>
      <div class="color-picker-input-wrapper">
        <input type="color" id="customColorInput" data-role="customColorInput" value="#000000">
        <input type="text" class="color-picker-hex" id="colorHexInput" data-role="colorHexInput" placeholder="#000000">
      </div>
    </div>
  `;

  document.body.appendChild(picker);
  ['pointerdown','mousedown'].forEach((evt) => {
    picker.addEventListener(evt, (e) => { e.stopPropagation(); }, true);
  });
  picker.addEventListener('click', (e) => { e.stopPropagation(); });
  return picker;
}

function updateCustomColorPickerHistory() {
  if (!customColorPicker) return;
  const grid = customColorPicker.querySelector('#colorHistoryGrid, [data-role="colorHistoryGrid"]');
  if (!grid) return;
  const history = getColorHistory();
  grid.innerHTML = '';
  history.forEach(color => {
    const circle = document.createElement('div');
    circle.className = 'color-history-circle';
    circle.style.backgroundColor = color;
    circle.title = color;
    circle.dataset.color = color;
    circle.addEventListener('click', () => {
      const colorInput = customColorPicker.querySelector('#customColorInput, [data-role="customColorInput"]');
      const hexInput = customColorPicker.querySelector('#colorHexInput, [data-role="colorHexInput"]');
      if (colorInput) colorInput.value = color;
      if (hexInput) hexInput.value = color;
      selectColor(color);
    });
    grid.appendChild(circle);
  });
}

function updateColorWithoutClosing(color) {
  if (!currentColorInput) return;
  
  // Update the input value
  currentColorInput.value = color;
  
  // Trigger events but don't close picker
  currentColorInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function selectColor(color) {
  if (!currentColorInput) return;
  // Apply immediately without closing, so the first click takes effect
  updateColorWithoutClosing(color);
  // Defer reordering history until the picker closes to avoid chips jumping
  if (customColorPicker && !customColorPicker.classList.contains('hidden')) {
    deferredHistoryColor = color;
  } else {
    addToColorHistory(color);
  }
  // Fire a change event to signal commit
  currentColorInput.dispatchEvent(new Event('change', { bubbles: true }));
}
function showCustomColorPicker(input, x, y) {
  currentColorInput = input;
  
  if (!customColorPicker) {
    customColorPicker = createCustomColorPickerElement();
    
    // Set up custom color input events
  const colorInput = customColorPicker.querySelector('#customColorInput, [data-role="customColorInput"]');
  const hexInput = customColorPicker.querySelector('#colorHexInput, [data-role="colorHexInput"]');
    
    if (colorInput && hexInput) {
      colorInput.addEventListener('input', () => {
        hexInput.value = colorInput.value;
        updateColorWithoutClosing(colorInput.value);
      });
      colorInput.addEventListener('change', () => { selectColor(colorInput.value); });
      hexInput.addEventListener('input', () => {
        const color = hexInput.value;
        if (/^#[0-9A-F]{6}$/i.test(color)) { colorInput.value = color; updateColorWithoutClosing(color); }
      });
      hexInput.addEventListener('change', () => {
        const color = hexInput.value;
        if (/^#[0-9A-F]{6}$/i.test(color)) selectColor(color);
      });
    }
  }
  
  // Update history display
  updateCustomColorPickerHistory();
  
  // Set current color in the picker (scoped)
  const colorInput = customColorPicker.querySelector('#customColorInput, [data-role="customColorInput"]');
  const hexInput = customColorPicker.querySelector('#colorHexInput, [data-role="colorHexInput"]');
  if (colorInput) colorInput.value = input.value;
  if (hexInput) hexInput.value = input.value;
  
  // Position the picker
  customColorPicker.style.left = x + 'px';
  customColorPicker.style.top = y + 'px';
  
  // Show picker
  customColorPicker.classList.remove('hidden');
  
  // Adjust position if off-screen
  setTimeout(() => {
    const rect = customColorPicker.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (rect.right > viewportWidth) {
      customColorPicker.style.left = (viewportWidth - rect.width - 10) + 'px';
    }
    if (rect.bottom > viewportHeight) {
      customColorPicker.style.top = (viewportHeight - rect.height - 10) + 'px';
    }
  }, 0);
}

function hideCustomColorPicker() {
  if (customColorPicker) {
    customColorPicker.classList.add('hidden');
  }
  // Commit any deferred history update now that the picker is closed
  if (deferredHistoryColor) {
    try { addToColorHistory(deferredHistoryColor); } catch {}
    deferredHistoryColor = null;
  }
  currentColorInput = null;
}

function initializeCustomColorPicker() {
  // If multiple pickers were inlined (e.g. via saved HTML snapshot), remove extras so we manage one instance
  const existing = document.querySelectorAll('.custom-color-picker');
  if (existing.length > 1) {
    existing.forEach((el, idx) => { if (idx !== existing.length - 1) el.remove(); });
  }
  document.addEventListener('click', (e) => {
    const inputEl = e.target.closest('input[type="color"]');
    if (!inputEl) {
      if (customColorPicker && !customColorPicker.contains(e.target)) hideCustomColorPicker();
      return;
    }
    if (inputEl.closest('.custom-color-picker')) return; // native input inside picker
    e.preventDefault();
    e.stopPropagation();
    const rect = inputEl.getBoundingClientRect();
    showCustomColorPicker(inputEl, rect.left, rect.bottom + 5);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && customColorPicker && !customColorPicker.classList.contains('hidden')) hideCustomColorPicker();
  });
}

// Panel management functions
function updateWorkspacePadding() {
  const leftPanel = document.getElementById('elementsPanel');
  const rightPanel = document.getElementById('propertiesPanel');
  const viewport = document.getElementById('pageViewport');
  
  if (!viewport) return;
  
  if (!Model.document.editMode) {
    viewport.style.paddingLeft = '0';
    viewport.style.paddingRight = '0';
    return;
  }
  
  const leftCollapsed = leftPanel?.classList.contains('collapsed');
  const rightCollapsed = rightPanel?.classList.contains('collapsed');
  
  let leftPadding, rightPadding;
  
  if (leftCollapsed) {
    leftPadding = '44px'; // collapsed width + gap
  } else {
    const leftWidth = leftPanel?.offsetWidth || 200;
    leftPadding = `${leftWidth + 12}px`;
  }
  
  if (rightCollapsed) {
    rightPadding = '44px'; // collapsed width + gap
  } else {
    const rightWidth = rightPanel?.offsetWidth || 240;
    rightPadding = `${rightWidth + 12}px`;
  }
  
  viewport.style.paddingLeft = leftPadding;
  viewport.style.paddingRight = rightPadding;
}

function togglePanelCollapse(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  
  const isCollapsed = panel.classList.contains('collapsed');
  panel.classList.toggle('collapsed');
  
  // Update the toggle button icon
  const toggle = panel.querySelector('.panel-toggle');
  if (toggle) {
    // Use data-dir to control arrow orientation via CSS, no text glyphs
    if (panelId === 'elementsPanel') {
      toggle.setAttribute('data-dir', isCollapsed ? 'left' : 'right');
    } else if (panelId === 'propertiesPanel') {
      toggle.setAttribute('data-dir', isCollapsed ? 'right' : 'left');
    }
  }
  
  // Save state to localStorage
  localStorage.setItem(`${panelId}-collapsed`, !isCollapsed);
  
  updateWorkspacePadding();
  // Ensure centering updates after CSS transition finishes
  // Run on next frame and after the transition duration as a fallback
  requestAnimationFrame(() => updateWorkspacePadding());
  setTimeout(updateWorkspacePadding, 350);
}
function initializePanelResizing() {
  let currentResize = null;
  
  // Handle resize start
  document.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.panel-resize-handle');
    if (!handle) return;
    
    const panelId = handle.dataset.panel;
    const panel = document.getElementById(panelId);
    if (!panel) return;
    
    currentResize = {
      panel,
      panelId,
      isLeft: panel.classList.contains('left'),
      startX: e.clientX,
      startWidth: panel.offsetWidth
    };
    
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    
    e.preventDefault();
  });
  
  // Handle resize drag
  document.addEventListener('mousemove', (e) => {
    if (!currentResize) return;
    
    const { panel, panelId, isLeft, startX, startWidth } = currentResize;
    const deltaX = e.clientX - startX;
    
    let newWidth;
    if (isLeft) {
      newWidth = startWidth + deltaX;
    } else {
      newWidth = startWidth - deltaX;
    }
    
    // Clamp width between min and max values
    newWidth = Math.max(150, Math.min(400, newWidth));
    
    // Update panel width
    panel.style.width = `${newWidth}px`;
    
    // Update CSS custom property
    const property = isLeft ? '--left-panel-width' : '--right-panel-width';
    document.documentElement.style.setProperty(property, `${newWidth}px`);
    
    updateWorkspacePadding();
  });
  
  // Handle resize end
  document.addEventListener('mouseup', () => {
    if (currentResize) {
      const { panelId, isLeft } = currentResize;
      const panel = document.getElementById(panelId);
      const newWidth = panel.offsetWidth;
      
      // Save to localStorage
      localStorage.setItem(`${panelId}-width`, newWidth);
      
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      currentResize = null;
    }
  });
}

function restorePanelStates() {
  // Restore panel widths
  const leftWidth = localStorage.getItem('elementsPanel-width');
  if (leftWidth) {
    document.documentElement.style.setProperty('--left-panel-width', `${leftWidth}px`);
    document.getElementById('elementsPanel').style.width = `${leftWidth}px`;
  }
  
  const rightWidth = localStorage.getItem('propertiesPanel-width');
  if (rightWidth) {
    document.documentElement.style.setProperty('--right-panel-width', `${rightWidth}px`);
    document.getElementById('propertiesPanel').style.width = `${rightWidth}px`;
  }
  
  // Restore collapsed states
  const elementsCollapsed = localStorage.getItem('elementsPanel-collapsed') === 'true';
  const propertiesCollapsed = localStorage.getItem('propertiesPanel-collapsed') === 'true';
  
  if (elementsCollapsed) {
    togglePanelCollapse('elementsPanel');
  }
  if (propertiesCollapsed) {
    togglePanelCollapse('propertiesPanel');
  }
  
  updateWorkspacePadding();
}
function initializePanelControls() {
  // Add click handlers for toggle buttons
  document.getElementById('elementsToggle')?.addEventListener('click', () => {
    togglePanelCollapse('elementsPanel');
  });
  
  document.getElementById('propertiesToggle')?.addEventListener('click', () => {
    togglePanelCollapse('propertiesPanel');
  });
  
  initializePanelResizing();
  restorePanelStates();
  
  // Recalculate padding/centering on window resize
  window.addEventListener('resize', updateWorkspacePadding);
  // Also when side panels finish their width/pos transitions
  document.querySelectorAll('.side').forEach((panel) => {
    panel.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'width' || e.propertyName === 'left' || e.propertyName === 'right') {
        updateWorkspacePadding();
      }
    });
  });

  // Wire the Properties filter button
  const filterBtn = document.getElementById('propertiesFilterBtn');
  if (filterBtn){
    filterBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openPropsFilterMenu(filterBtn); });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrap();
  initializePanelControls();
  initializeCustomColorPicker();
  // Ensure save buttons start in a neutral state on load
  try {
    getSaveBtns().forEach((btn) => {
      btn.classList.remove('saving', 'saved');
      btn.removeAttribute('aria-busy');
      if (!btn.dataset.originalText) btn.dataset.originalText = 'Save';
      btn.textContent = btn.dataset.originalText || 'Save';
    });
  } catch {}
  // Initialize panel toggle arrow orientation
  const elT = document.getElementById('elementsToggle');
  const prT = document.getElementById('propertiesToggle');
  if (elT) elT.setAttribute('data-dir', document.getElementById('elementsPanel')?.classList.contains('collapsed') ? 'left' : 'right');
  if (prT) prT.setAttribute('data-dir', document.getElementById('propertiesPanel')?.classList.contains('collapsed') ? 'right' : 'left');
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = APP_VERSION;
  // Initialize hub/router after base editor wiring
  try { initializeHubRouter(); } catch {}
});