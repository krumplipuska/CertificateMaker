// editor.app.js
// Extracted from script.js on 2025-08-20T18:47:33.901424Z
// Range: [53602:132968] bytes

/* ----------------------- Rendering ----------------------- */
function renderAll() {
  renderPagesList();
  clearSelection();
  // Do not force visibility when editing; users expect all elements visible in edit mode
  if (!(Model && Model.document && Model.document.editMode)) enforceVisibilityForAllPages();
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
      <span style="margin-left:6px;color:var(--muted)">${p.name}</span>
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
        Model.document.currentPageId = p.id;
        renderAll();
        e.preventDefault();
        return; // stop initiating drag on a different page
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
      else if (btn.dataset.act === 'toggle-visibility') { wrap.classList.toggle('hidden'); }
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
/* ----------------------- Header & Footer Guides ----------------------- */
function updateHeaderFooterGuides(pageNode){
  try {
    if (!pageNode) return;
    const hh = Number(Model?.document?.headerHeight || 0);
    const fh = Number(Model?.document?.footerHeight || 0);
    const header = pageNode.querySelector('.hf-guide.header');
    const footer = pageNode.querySelector('.hf-guide.footer');
    if (header){ header.style.height = Math.max(0, hh) + 'px'; header.style.display = hh > 0 ? 'block' : 'none'; }
    if (footer){ footer.style.height = Math.max(0, fh) + 'px'; footer.style.display = fh > 0 ? 'block' : 'none'; }
  } catch {}
}

function setHeaderFooterHeights({ header, footer }){
  commitHistory('set-header-footer');
  Model.document.headerHeight = Math.max(0, Number(header || 0));
  Model.document.footerHeight = Math.max(0, Number(footer || 0));
  // Update all page guides and reflow stacks for usable height
  try {
    document.querySelectorAll('.page').forEach(p => updateHeaderFooterGuides(p));
  } catch {}
  try { reflowStacks(getCurrentPage()); } catch {}
}

function attachHeaderFooterResizers(pageNode, pageId){
  try {
    const header = pageNode.querySelector('.hf-guide.header .hf-resize');
    const footer = pageNode.querySelector('.hf-guide.footer .hf-resize');
    const z = (typeof getZoom === 'function') ? (getZoom() || 1) : 1;
    if (header){
      let startY = 0; let startH = 0; let moving = false;
      header.addEventListener('mousedown', (e) => {
        if (!Model.document.editMode) return;
        moving = true; startY = e.clientY; startH = Number(Model.document.headerHeight || 0);
        document.body.classList.add('hf-resizing');
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      });
      window.addEventListener('mousemove', (e) => {
        if (!moving) return;
        const dy = (e.clientY - startY) / (z || 1);
        const nh = Math.max(0, Math.round(startH + dy));
        Model.document.headerHeight = nh;
        updateHeaderFooterGuides(pageNode);
      });
      window.addEventListener('mouseup', () => { if (moving){ moving = false; setHeaderFooterHeights({ header: Model.document.headerHeight, footer: Model.document.footerHeight }); document.body.classList.remove('hf-resizing'); } });
    }
    if (footer){
      let startY = 0; let startH = 0; let moving = false; const pageRect = () => pageNode.getBoundingClientRect();
      footer.addEventListener('mousedown', (e) => {
        if (!Model.document.editMode) return; moving = true; startY = e.clientY; startH = Number(Model.document.footerHeight || 0); document.body.classList.add('hf-resizing'); e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      });
      window.addEventListener('mousemove', (e) => {
        if (!moving) return; const dy = (startY - e.clientY) / (z || 1); const nh = Math.max(0, Math.round(startH + dy)); Model.document.footerHeight = nh; updateHeaderFooterGuides(pageNode);
      });
      window.addEventListener('mouseup', () => { if (moving){ moving = false; setHeaderFooterHeights({ header: Model.document.headerHeight, footer: Model.document.footerHeight }); document.body.classList.remove('hf-resizing'); } });
    }
  } catch {}
}


/* ----------------------- Updates ----------------------- */
function updateElement(id, patch) {
  const page = getCurrentPage();

  // If a CSS selector string is provided (and not a known model id), resolve and apply
  if (typeof id === 'string' && id) {
    const maybeModel = getElementById(id);
    if (!maybeModel) {
      // Preserve current element and table selections
      const prevSelIds = Array.from(document.querySelectorAll('.page .element.selected'))
        .map(n => n && n.getAttribute('data-id'))
        .filter(Boolean);
      const prevTableSel = tableSel ? { ...tableSel } : null;

      const targets = { elementIds: new Set(), cells: [] }; // cells: { tableId, r, c }
      function addElementId(eid){ if (eid) targets.elementIds.add(eid); }
      function addCellTarget(tableId, cellId){
        try {
          const tModel = getElementById(tableId);
          const grid = tModel?.grid || [];
          for (let r = 0; r < grid.length; r++){
            const row = grid[r] || [];
            for (let c = 0; c < row.length; c++){
              if (row[c] === cellId){ targets.cells.push({ tableId, r, c }); return; }
            }
          }
        } catch {}
      }

      let nodes = [];
      try { nodes = Array.from(document.querySelectorAll(id)); } catch {}
      if (!nodes.length) {
        const token = String(id).replace(/^#/, '');
        // Look for element with data-id across all pages
        const byData = document.querySelectorAll(`.page [data-id="${token}"]`);
        if (byData && byData.length) nodes.push(...byData);
      }
      nodes.forEach(node => {
        if (!node) return;
        if (node.classList && node.classList.contains('element') && node.dataset?.id){
          addElementId(node.dataset.id);
          return;
        }
        const container = node.closest('.element[data-id]');
        if (node.dataset?.id && container?.dataset?.id) { addCellTarget(container.dataset.id, node.dataset.id); return; }
        if (container?.dataset?.id) addElementId(container.dataset.id);
      });

      // Apply to elements and specific table cells in a single history entry
      if (targets.elementIds.size || targets.cells.length){
        commitHistory('update-multi');
        let doc = Model.document;
        if (targets.elementIds.size){
          // Apply across any page, not just current
          doc = applyPatchToElementsAnyPage(doc, [...targets.elementIds], patch);
        }
        if (targets.cells.length){
          const styles = (patch && patch.styles) || {};
          // Apply per-cell (table might be on any page)
          targets.cells.forEach(({ tableId, r, c }) => {
            doc = applyPatchToTableCellsAnyPage(doc, tableId, { r0:r, c0:c, r1:r, c1:c }, styles);
          });
        }
        Model.document = doc;
        // Re-render all pages because the change may be off the current page
        renderAll();
        updateSelectionUI();
      }

      // Restore previous selections
      if (prevTableSel && typeof setTableSelection === 'function') {
        setTableSelection(prevTableSel.tableId, prevTableSel.r0, prevTableSel.c0, prevTableSel.r1, prevTableSel.c1);
      }
      if (Array.isArray(prevSelIds) && prevSelIds.length && typeof setSelection === 'function') {
        setSelection(prevSelIds);
      }
      return;
    }
  }

  // Unified behavior: if id is null/undefined, apply to selection or table cells
  if (id == null) {
    // If there is an active table cell selection, apply patch via table helpers
    if (tableSel) {
      commitHistory('update-element');
      Model.document = applyPatchToTableCells(Model.document, tableSel.tableId, tableSel, (patch && patch.styles) || {});
      renderPage(getCurrentPage());
      setTableSelection(tableSel.tableId, tableSel.r0, tableSel.c0, tableSel.r1, tableSel.c1);
      return;
    }
    // Otherwise, apply to all currently selected elements (multi-update)
    if (selectedIds.size === 0) return;
    commitHistory('update-multi');
    Model.document = applyPatchToElements(Model.document, [...selectedIds], patch);
    renderPage(getCurrentPage());
    updateSelectionUI();
    return;
  }

  // Original behavior: update a single element by id
  commitHistory('update-element');
  // Preserve table cell selection if we're updating the same table
  const prevTableSel = (tableSel && tableSel.tableId === id) ? { ...tableSel } : null;
  // If the id is not on the current page, patch it by searching across all pages
  const curHas = !!(page && page.elements && page.elements.some(e => e.id === id));
  Model.document = curHas ? applyPatchToElements(Model.document, [id], patch)
                          : applyPatchToElementsAnyPage(Model.document, [id], patch);
  renderPage(getCurrentPage());
  
  if (prevTableSel) {
    // Re-apply table cell selection after re-render (don't change element selection)
    setTableSelection(prevTableSel.tableId, prevTableSel.r0, prevTableSel.c0, prevTableSel.r1, prevTableSel.c1);
  } else {
    // Only set element selection if we're not preserving table selection
    try {
      if (!Model.document.editMode) { clearSelection(); }
      else {
        const updated = getElementById(id);
        if (updated && isElementHidden(updated)) { clearSelection(); }
        else { setSelection([id]); }
      }
    } catch { if (Model.document.editMode) setSelection([id]); else clearSelection(); }
  }
}

/* ----------------------- Toolbar sync ----------------------- */
function syncFormatToolbar(m){
  const bar = formatToolbar(); if (!bar) return;
  const setVal = (sel, val) => { const el = bar.querySelector(sel); if (el && document.activeElement !== el) el.value = val ?? ''; };
  const press = (sel, on) => { const b = bar.querySelector(sel); if (b){ b.setAttribute('aria-pressed', on ? 'true':'false'); }};

  // If a table cell/range is active, reflect the anchor cell styles in the toolbar
  if (tableSel && m.type === 'table'){
    const tModel = m;
    const ar = Math.min(tableSel.r0, tableSel.r1);
    const ac = Math.min(tableSel.c0, tableSel.c1);
    const id = tModel.grid[ar]?.[ac];
    const cell = id ? tModel.cells[id] : null;
    const cs = cell ? cell.styles || {} : {};
    setVal('input[data-prop="styles.fill"]', cs.bg);
    setVal('input[data-prop="styles.textColor"]', cs.textColor);
    // Stroke properties are per-cell too in our applier
    setVal('input[data-prop="styles.strokeColor"]', cs.strokeColor ?? m.styles.strokeColor);
    setVal('input[data-prop="styles.strokeWidth"]', (cs.strokeWidth ?? m.styles.strokeWidth) || 0);
    setVal('select[data-prop="styles.fontFamily"]', cs.fontFamily ?? 'system-ui');
    setVal('select[data-prop="styles.fontSize"]', cs.fontSize ?? 14);
    press('[data-toggle="styles.bold"]', !!cs.bold);
    press('[data-toggle="styles.italic"]', !!cs.italic);
    press('[data-toggle="styles.underline"]', !!cs.underline);
  } else {
    // Normal element selection
  setVal('input[data-prop="styles.fill"]', m.styles.fill);
  setVal('input[data-prop="styles.textColor"]', m.styles.textColor);
  setVal('input[data-prop="styles.strokeColor"]', m.styles.strokeColor);
  setVal('input[data-prop="styles.strokeWidth"]', m.styles.strokeWidth || 0);
  setVal('input[data-prop="styles.radius"]', m.styles.radius || 0);
  setVal('select[data-prop="styles.fontFamily"]', m.styles.fontFamily);
  setVal('select[data-prop="styles.fontSize"]', m.styles.fontSize || 14);
  press('[data-toggle="styles.bold"]', !!m.styles.bold);
  press('[data-toggle="styles.italic"]', !!m.styles.italic);
  press('[data-toggle="styles.underline"]', !!m.styles.underline);
  }
  // text alignment
  const setPressed = (selector, value, expected) => {
    const btn = bar.querySelector(selector); if (btn) btn.setAttribute('aria-pressed', String(value === expected));
  };
  if (m.type === 'text' || m.type === 'field' || m.type === 'rect'){
    setPressed('[data-align-h="left"]', m.styles.textAlignH || 'left', 'left');
    setPressed('[data-align-h="center"]', m.styles.textAlignH || 'left', 'center');
    setPressed('[data-align-h="right"]', m.styles.textAlignH || 'left', 'right');
    setPressed('[data-align-v="top"]', m.styles.textAlignV || 'top', 'top');
    setPressed('[data-align-v="middle"]', m.styles.textAlignV || 'top', 'middle');
    setPressed('[data-align-v="bottom"]', m.styles.textAlignV || 'top', 'bottom');
  } else {
    ['left','center','right'].forEach(k => { const b = bar.querySelector(`[data-align-h="${k}"]`); if (b) b.setAttribute('aria-pressed','false'); });
    ['top','middle','bottom'].forEach(k => { const b = bar.querySelector(`[data-align-v="${k}"]`); if (b) b.setAttribute('aria-pressed','false'); });
  }
  const tbg = document.getElementById('bgTransparentToggle');
  if (tbg) tbg.checked = m.styles.fill === 'transparent';
}
/* deepMerge moved to editor.core.js */

/* ----------------------- Adding elements ----------------------- */
let pendingAddType = null; // 'text'|'rect'|'line' for single insertion
function armAdd(type){ pendingAddType = type; }

function placePendingAt(x, y, pageId = Model.document.currentPageId){
  if (!pendingAddType) return;
  commitHistory('add-element');
  const base = {
    id: generateId(), type: pendingAddType, x, y, w: 160, h: 60, z: 1,
    styles: { fill:'#ffffff', strokeColor:'#111827', strokeWidth:1, radius:4,
      textColor:'#111827', fontFamily:'system-ui', fontSize:14, bold:false, italic:false, underline:false }
  };
  if (pendingAddType === 'rect') base.styles.fill = '#dbeafe';
  if (pendingAddType === 'line') Object.assign(base, { x2: x+120, y2: y });
  if (pendingAddType === 'text') base.content = '';
  if (pendingAddType === 'field') base.content = '';
  if (pendingAddType === 'image') { base.type = 'image'; base.w = 160; base.h = 120; }
  if (pendingAddType === 'table') {
    const t = makeTableElement(3,4);
    Object.assign(base, t, { x, y });
    // Tables should not have an outer border by default
    base.styles.strokeWidth = 0;
  }
  // New stacked Block container
  if (pendingAddType === 'block') {
    base.type = 'block';
    base.w = 420; base.h = 180;
    base.styles.fill = '#ffffff';
    base.styles.strokeWidth = 1;
    base.styles.radius = 8;
    base.stackChildren = true;
    base.stackByPage = true;
  }
  const page = Model.document.pages.find(p => p.id === pageId) || getCurrentPage();
  page.elements.push(base);
  Model.document.currentPageId = page.id;
  // If dropped inside a block, parent it before reflow
  try { reparentIntoBlocks(page, [base.id]); } catch {}
  // Immediately reflow page stacks so newly added elements snap into place
  try { reflowStacks(page); } catch {}
  pendingAddType = null; // single insertion
  renderPage(page);
  setSelection([base.id]);
}

/* ----------------------- Interaction ----------------------- */
function getCanvasPoint(evt, pageNode = getPageNode()){
  const r = pageNode.getBoundingClientRect();
  const z = getZoom();
  const cx = (evt.clientX ?? evt.touches?.[0]?.clientX);
  const cy = (evt.clientY ?? evt.touches?.[0]?.clientY);
  const x = (cx - r.left) / z;
  const y = (cy - r.top) / z;
  const w = pageNode.clientWidth;
  const h = pageNode.clientHeight;
  return { x: Math.max(0, Math.min(w, x)), y: Math.max(0, Math.min(h, y)) };
}

// Compute which page is most visible within the viewport and return its node and id
function getMostVisiblePageInfo(){
  try {
    const vp = document.getElementById('pageViewport');
    if (!vp) return null;
    const vpr = vp.getBoundingClientRect();
    let best = null; let bestArea = 0;
    document.querySelectorAll('.page-wrapper .page').forEach((page) => {
      const pr = page.getBoundingClientRect();
      const left = Math.max(pr.left, vpr.left);
      const top = Math.max(pr.top, vpr.top);
      const right = Math.min(pr.right, vpr.right);
      const bottom = Math.min(pr.bottom, vpr.bottom);
      const w = Math.max(0, right - left);
      const h = Math.max(0, bottom - top);
      const area = w * h;
      if (area > bestArea){ bestArea = area; best = page; }
    });
    if (!best) return null;
    const wrap = best.closest('.page-wrapper');
    const pageId = wrap && wrap.dataset ? wrap.dataset.pageId : null;
    return pageId ? { pageNode: best, pageId } : null;
  } catch { return null; }
}

// Return a visible, viewport-aware point (logical coords) on the most visible page
function getVisibleInsertionPoint(){
  const info = getMostVisiblePageInfo(); if (!info) return null;
  const vp = document.getElementById('pageViewport'); if (!vp) return null;
  const vpr = vp.getBoundingClientRect();
  const pr = info.pageNode.getBoundingClientRect();
  const z = (typeof getZoom === 'function') ? (getZoom() || 1) : 1;
  const left = Math.max(pr.left, vpr.left);
  const top = Math.max(pr.top, vpr.top);
  const right = Math.min(pr.right, vpr.right);
  const bottom = Math.min(pr.bottom, vpr.bottom);
  let cx = (left + right) / 2;
  let cy = (top + bottom) / 2;
  // Fallback to page center if there is no intersection
  if (!(right > left && bottom > top)) { cx = pr.left + pr.width/2; cy = pr.top + pr.height/2; }
  let x = (cx - pr.left) / z;
  let y = (cy - pr.top) / z;
  // Nudge to stay within visible/safe area, accounting for header/footer
  try {
    const header = Number(Model?.document?.headerHeight || 0);
    const footer = Number(Model?.document?.footerHeight || 0);
    const w = info.pageNode.clientWidth;
    const h = info.pageNode.clientHeight;
    const margin = 20; // logical px
    const minX = margin;
    const maxX = Math.max(margin, w - margin);
    const minY = Math.max(margin, header + margin);
    const maxY = Math.max(minY, h - footer - margin);
    x = Math.max(minX, Math.min(maxX, x));
    y = Math.max(minY, Math.min(maxY, y));
  } catch {}
  return { pageId: info.pageId, x, y };
}

// Add element immediately to the most visible page at a visible point
function addElementToVisiblePage(type){
  const pt = getVisibleInsertionPoint();
  if (!pt) { pendingAddType = type; placePendingAt(40, 40); return; }
  Model.document.currentPageId = pt.pageId;
  pendingAddType = type;
  placePendingAt(pt.x, pt.y, pt.pageId);
}

// Internal guard to suppress click-add when a drag from the palette just occurred
let __addingByDrag = false;

let drag = null; // {id, start:{x,y}, orig:{...}, descendants?: Map}
let dragMaybe = null; // tentative single-element drag starter
let resize = null; // {id, start:{x,y}, orig:{...}, mode:'n|s|e|w|ne|nw|se|sw'}
const Controller = { snapState: { x:null, y:null }, suppressReflow: 0 };
let dragSelection = null; // { startBounds, starts: Map }
let resizeSelectionState = null; // { handle, startBounds, starts: Map }
let rotateSelectionState = null; // { startBounds, center:{x,y}, startAngle, starts: Map(id->startRotate) }

function getDescendantIds(rootId){
  const page = getCurrentPage();
  const out = [];
  const queue = [rootId];
  const seen = new Set([rootId]);
  while (queue.length){
    const cur = queue.shift();
    page.elements.forEach(e => {
      if (e.parentId === cur && !seen.has(e.id)){
        out.push(e.id);
        seen.add(e.id);
        queue.push(e.id);
      }
    });
  }
  return out;
}

function isElementHidden(el){
  try {
    const a = el && el.attrs ? el.attrs : {};
    if (a && (a.hidden === true || a.hidden === 'true')) return true;
    const st = String(a && a.style ? a.style : '');
    if (/display\s*:\s*none/i.test(st)) return true;
  } catch {}
  return false;
}

function reflowStacks(page){
  // Cross-page stack reflow for elements that opt-in via stackByPage.
  // 1) Lay out visible stackers top-to-bottom within each page
  // 2) If an item would overflow the page, move it to the next page and continue
  // 3) Allow elements to move forward AND backward across pages based on space
  // 4) Support an optional pageBreak flag to force element to start on next page
  // 5) After page-level positions are finalized, reflow children inside block containers
  try {
    const doc = Model && Model.document ? Model.document : { pages: [] };
    if (!Array.isArray(doc.pages) || doc.pages.length === 0) return;

    const PADDING_TOP = 16;
    const PADDING_GAP = 16;
    const PADDING_BOTTOM = 16;
    const HEADER_H = Number((Model && Model.document && Model.document.headerHeight) || 0);
    const FOOTER_H = Number((Model && Model.document && Model.document.footerHeight) || 0);

    function getLogicalPageHeightPx(p){
      try {
        const node = typeof getPageNode === 'function' ? getPageNode(p.id) : null;
        if (!node) return 0;
        const z = (typeof getZoom === 'function') ? (getZoom() || 1) : 1;
        return Math.round(node.getBoundingClientRect().height / (z || 1));
      } catch { return 0; }
    }

    function findPageIndexByElementId(eid){
      for (let i = 0; i < doc.pages.length; i++){
        const p = doc.pages[i];
        if ((p.elements || []).some(el => el && el.id === eid)) return i;
      }
      return -1;
    }

    // Collect all descendants (children, grandchildren, …) of a container across all pages
    function collectDescendants(rootId){
      const out = [];
      const queue = [rootId];
      const seen = new Set([rootId]);
      while (queue.length){
        const parent = queue.shift();
        for (let i = 0; i < doc.pages.length; i++){
          const pg = doc.pages[i];
          for (const el of (pg.elements || [])){
            if (!el) continue;
            if (el.parentId === parent && !seen.has(el.id)){
              out.push(el);
              seen.add(el.id);
              queue.push(el.id);
            }
          }
        }
      }
      return out;
    }

    const changedPageIds = new Set();
    let createdPages = false;
    let deletedPages = false;

    // Build a single, ordered list of all visible root-level stackers across pages.
    const allStackers = [];
    for (let pi = 0; pi < doc.pages.length; pi++){
      const p = doc.pages[pi];
      const locals = (p.elements || [])
        .filter(e => e && e.stackByPage === true && !e.parentId && !isElementHidden(e) && !e.repeatOnAllPages)
        .sort((a,b) => (a.y - b.y));
      locals.forEach(el => allStackers.push(el));
    }

    // Helper to ensure a page exists at index and return it
    const ensurePage = (index) => {
      while (doc.pages.length <= index){
        const newPage = createPage(`Page ${doc.pages.length + 1}`);
        doc.pages.push(newPage);
        createdPages = true;
      }
      return doc.pages[index];
    };

    // Lay out the global sequence into pages from the start, allowing backward moves
    let pi = 0;
    let p = ensurePage(pi);
    let pageHeight = getLogicalPageHeightPx(p);
    let limit = Math.max(0, pageHeight - FOOTER_H - PADDING_BOTTOM);
    let y = PADDING_TOP + HEADER_H;

    for (const el of allStackers){
      const h = Math.max(0, Number(el.h || 0));
      const wantsBreak = !!(el.pageBreak === true || el.pageBreak === 'true');

      // Forced page break before this element (unless it's already at the top of a fresh page)
      if (wantsBreak && y !== (PADDING_TOP + HEADER_H)){
        pi += 1; p = ensurePage(pi);
        pageHeight = getLogicalPageHeightPx(p);
        limit = Math.max(0, pageHeight - FOOTER_H - PADDING_BOTTOM);
        y = PADDING_TOP + HEADER_H;
      }

      // If it would overflow, advance pages until it fits or we've started a new page
      while (y + h > limit){
        pi += 1; p = ensurePage(pi);
        pageHeight = getLogicalPageHeightPx(p);
        limit = Math.max(0, pageHeight - FOOTER_H - PADDING_BOTTOM);
        y = PADDING_TOP + HEADER_H;
        // If the element itself is taller than a page, place it at the top and allow overflow
        if (h > (limit - (PADDING_TOP + HEADER_H))) break;
      }

      // Move element to the target page if needed
      const curIdx = findPageIndexByElementId(el.id);
      if (curIdx !== pi && curIdx !== -1){
        const from = doc.pages[curIdx];
        const idx = from.elements.findIndex(x => x && x.id === el.id);
        if (idx !== -1) from.elements.splice(idx, 1);
        changedPageIds.add(from.id);

        // Move all descendants with the block as well so they stay visible
        if (el.type === 'block'){
          const descendants = collectDescendants(el.id);
          for (const d of descendants){
            const dFromIdx = findPageIndexByElementId(d.id);
            if (dFromIdx !== -1){
              const fromPg = doc.pages[dFromIdx];
              const di = fromPg.elements.findIndex(x => x && x.id === d.id);
              if (di !== -1) fromPg.elements.splice(di, 1);
              changedPageIds.add(fromPg.id);
            }
            if (!p.elements.some(x => x && x.id === d.id)) p.elements.push(d);
            changedPageIds.add(p.id);
          }
        }

        if (!p.elements.some(x => x && x.id === el.id)) p.elements.push(el);
        changedPageIds.add(p.id);
      } else {
        // Element already on target page; ensure it's present in elements list
        if (!p.elements.some(x => x && x.id === el.id)) {
          p.elements.push(el);
          changedPageIds.add(p.id);
        }
      }

      // Position element within the page
      el.y = y;
      y += h + PADDING_GAP;
      changedPageIds.add(p.id);
    }

    // Remove trailing empty pages (only at the end to be safe)
    for (let i = doc.pages.length - 1; i >= 0 && doc.pages.length > 1; i--){
      const pg = doc.pages[i];
      const hasAnyElements = Array.isArray(pg.elements) && pg.elements.length > 0;
      if (hasAnyElements) break; // stop at first non-empty from the end
      const removed = doc.pages.pop();
      deletedPages = true;
      // Fix currentPageId if we removed the current one
      if (removed && removed.id === Model.document.currentPageId){
        const newIdx = Math.min(doc.pages.length - 1, i - 1);
        const safeIdx = newIdx >= 0 ? newIdx : 0;
        Model.document.currentPageId = doc.pages[safeIdx]?.id || doc.pages[0].id;
      }
    }

    // After page-level reflow, stack children within blocks on affected pages
    const affectedPages = Array.from(changedPageIds).map(id => doc.pages.find(p => p.id === id)).filter(Boolean);
    const pagesToProcess = affectedPages.length ? affectedPages : [page || getCurrentPage()];
    pagesToProcess.forEach((pg) => {
      const blocks = (pg.elements || []).filter(e => e && e.type === 'block');
      blocks.forEach(b => {
        if (!b.stackChildren) return;
        const kids = pg.elements
          .filter(e => e && e.parentId === b.id && e.type !== 'line' && !isElementHidden(e))
          .sort((a,bm) => (a.y - bm.y));
        let y = 8;
        kids.forEach(k => { k.y = b.y + y; y += (k.h || 0) + 8; });
      });
    });

    // Render only the pages that changed; if structure changed, rebuild the list
    if (changedPageIds.size || createdPages || deletedPages){
      try {
        if (createdPages || deletedPages){
          renderPagesList();
        } else {
          changedPageIds.forEach((pid) => {
            const pg = doc.pages.find(p => p.id === pid);
            if (pg) renderPage(pg);
          });
        }
      } catch {}
    }
  } catch {}
}

// expose for userFunctions
window.reflowStacks = reflowStacks;

// ---------- Block parenting helpers ----------
function elementBounds(el){ return { x: el.x || 0, y: el.y || 0, w: el.w || 0, h: el.h || 0 }; }
function rectContainsPoint(r, px, py){ return px >= r.x && px <= (r.x + r.w) && py >= r.y && py <= (r.y + r.h); }
/** Assign parentId for given element ids when their centers fall inside a block; clear when outside. */
function reparentIntoBlocks(page, ids){
  if (!page) page = getCurrentPage();
  const blocks = page.elements.filter(e => e.type === 'block');
  if (!blocks.length) return;
  // Prefer visually topmost (highest z) when multiple blocks overlap
  const pickHost = (cx, cy) => {
    let host = null; let bestZ = -Infinity;
    for (const b of blocks){
      const r = elementBounds(b);
      if (rectContainsPoint(r, cx, cy)){
        const z = Number(b.z || 0);
        if (z >= bestZ){ bestZ = z; host = b; }
      }
    }
    return host;
  };
  ids.forEach(id => {
    const idx = page.elements.findIndex(e => e.id === id);
    if (idx === -1) return;
    const el = page.elements[idx];
    if (!el || el.type === 'block') return; // don't parent blocks into blocks here
    const r = elementBounds(el);
    const cx = r.x + r.w/2; const cy = r.y + r.h/2;
    const host = pickHost(cx, cy);
    const nextParentId = host ? host.id : null;
    if ((el.parentId || null) !== nextParentId){
      // Mutate in place to be consistent with live gesture updates
      el.parentId = nextParentId;
      page.elements[idx] = el;
    }
  });
}

function onMouseDown(e){
  // Ignore canvas interactions while a picker is active (element/style picker)
  if (window.__PICKING) { e.preventDefault(); return; }
  // Prevent moving/resizing when edit mode is off, but allow clicking/selection
  if (!Model.document.editMode) return;
  // If currently editing text/content, do not initiate drags
  const act = document.activeElement;
  if (act && (act.isContentEditable || act.tagName === 'INPUT' || act.tagName === 'TEXTAREA')) return;
  const target = e.target.closest('.element');
  // Avoid initiating drag on the first click of a double-click for text-like elements
  if (target && e.detail >= 2 && (target.classList.contains('text') || target.classList.contains('field') || target.classList.contains('rect'))){
    // Cancel any pending or active drag when entering edit mode via double-click
    drag = null; dragMaybe = null; dragSelection = null; resize = null;
    return; // let dblclick handler take over to enter edit mode
  }
  if (target && target.isContentEditable) { drag = null; dragMaybe = null; return; } // don't start drag when editing text
  const pt = getCanvasPoint(e);
  if (pendingAddType){ placePendingAt(pt.x, pt.y); return; }
  if (target){
    const id = target.dataset.id;
    console.log('[MOUSE] down on element', id);
    const page = getCurrentPage();
    const model = page.elements.find(el => el.id === id);
    // Respect locked layers
    if (model && model.attrs && (model.attrs.locked === true || model.attrs.locked === 'true')){
      // Allow selection but block drag/resize
      setSelection([id]);
      e.preventDefault();
      return;
    }
    // Alt-drag duplicate: when starting a drag with Alt pressed, clone selection first
    if ((e.altKey || e.metaKey && e.shiftKey) && (selectedIds.has(id) || selectedIds.size === 0)){
      // If nothing selected, select target first then clone
      if (!selectedIds.has(id)) setSelection([id]);
      copySelection(0); // duplicate at same position
      // Keep newly created clones selected and start dragging them
      // Offset start so immediate movement will be visible
    }
    const append = e.shiftKey || e.ctrlKey || e.metaKey;
    const toggle = e.ctrlKey || e.metaKey;
    if (!append && !toggle && model?.groupId) { setSelection(getElementsByGroup(model.groupId).map(e=>e.id)); }
    else if (toggle) toggleSelection(id);
    else if (append) addToSelection(id);
    else {
      setSelection([id]);
      // Fallback behavior: if clicking on table container and we have a last cell selection, restore it
      if (model?.type === 'table' && lastTableSel && lastTableSel.tableId === id) {
        setTableSelection(lastTableSel.tableId, lastTableSel.r0, lastTableSel.c0, lastTableSel.r1, lastTableSel.c1);
      }
    }
    const mode = getResizeMode(e, target, model);
    if (mode) {
      // snapshot before resize starts for undo
      commitHistory('resize');
      resize = { id, start: pt, orig: deepClone(model), mode };
      console.log(`[GESTURE] resize:start id=${id} mode=${mode}`);
    } else {
      if (selectedIds.has(id) && selectedIds.size > 1){
        const starts = new Map();
        [...selectedIds].forEach(sid => starts.set(sid, deepClone(getElementById(sid))));
        const startBounds = getSelectionBounds();
        // snapshot before move starts for undo
        commitHistory('move');
        // keep pointer offset to avoid jumping to top-left
        const pointerOffset = { ox: pt.x - startBounds.x, oy: pt.y - startBounds.y };
        dragSelection = { startBounds, starts, pointerOffset };
        console.log(`[GESTURE] multi-drag:start count=${selectedIds.size}`);
      } else {
        // Defer starting a drag until the pointer actually moves beyond a threshold
        // Capture possible descendants for blocks to move them together
        let descendants = null;
        if (model && model.type === 'block'){
          const ids = getDescendantIds(model.id);
          const map = new Map();
          ids.forEach(cid => { const cm = getElementById(cid); if (cm) map.set(cid, deepClone(cm)); });
          descendants = map;
        }
        dragMaybe = { id, start: pt, orig: deepClone(model), descendants };
        console.log(`[GESTURE] drag:maybe id=${id} x=${pt.x} y=${pt.y}`);
      }
    }
    // hide actions while dragging
    elementActions().classList.add('hidden');
    e.preventDefault();
  } else {
    clearSelection();
  }
}

function onMouseMove(e){
  // Safety: if no mouse button is down but a gesture is active, end it
  if ((e.buttons === 0 || e.type === 'mouseleave') && (drag || resize || dragSelection || resizeSelectionState || rotateSelectionState || dragMaybe)){
    onMouseUp();
    return;
  }
  // If editing text/content and no gesture is active, ignore move events
  const activeEl = document.activeElement;
  const isEditing = !!(activeEl && (activeEl.isContentEditable || activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA'));
  if (isEditing && !drag && !resize && !dragSelection && !resizeSelectionState && !rotateSelectionState && !dragMaybe) return;
  if (!drag && !resize && !dragSelection && !resizeSelectionState && !rotateSelectionState && !dragMaybe) return;
  const pt = getCanvasPoint(e);
  const page = getCurrentPage();
  // Promote tentative drag if moved far enough
  if (!drag && dragMaybe){
    const dx0 = Math.abs(pt.x - dragMaybe.start.x);
    const dy0 = Math.abs(pt.y - dragMaybe.start.y);
    if (dx0 >= 3 || dy0 >= 3){
      console.log(`[GESTURE] drag:promote id=${dragMaybe.id}`);
      commitHistory('move');
      drag = dragMaybe; dragMaybe = null;
    }
  }
  if (rotateSelectionState){
    const sb = rotateSelectionState.startBounds;
    const cx = sb.x + sb.w/2; const cy = sb.y + sb.h/2;
    const curAngle = Math.atan2(pt.y - cy, pt.x - cx);
    const deltaRad = curAngle - rotateSelectionState.startAngle;
    const deltaDeg = deltaRad * (180/Math.PI);
    [...selectedIds].forEach(id => {
      const start = rotateSelectionState.starts.get(id);
      const out = deepClone(start);
      if (out.type !== 'line'){
        out.styles = out.styles || {};
        out.styles.rotate = (start.styles?.rotate || 0) + deltaDeg;
      } else {
        // Rotate line endpoints around selection center
        const cos = Math.cos(deltaRad), sin = Math.sin(deltaRad);
        const x1 = start.x, y1 = start.y; const x2 = start.x2 ?? start.x; const y2 = start.y2 ?? start.y;
        const rx1 = cx + (x1 - cx) * cos - (y1 - cy) * sin;
        const ry1 = cy + (x1 - cx) * sin + (y1 - cy) * cos;
        const rx2 = cx + (x2 - cx) * cos - (y2 - cy) * sin;
        const ry2 = cy + (x2 - cx) * sin + (y2 - cy) * cos;
        out.x = rx1; out.y = ry1; out.x2 = rx2; out.y2 = ry2;
      }
      const idx = page.elements.findIndex(e => e.id === id); if (idx !== -1) page.elements[idx] = out;
      const node = document.querySelector(`.page [data-id="${id}"]`); if (node) applyElementStyles(node, out);
    });
    updateSelectionBox();
    return;
  }
  if (dragSelection){
    const ox = dragSelection.pointerOffset?.ox || 0;
    const oy = dragSelection.pointerOffset?.oy || 0;
    const dx = pt.x - (dragSelection.startBounds.x + ox);
    const dy = pt.y - (dragSelection.startBounds.y + oy);
    const tentative = { x: dragSelection.startBounds.x + dx, y: dragSelection.startBounds.y + dy, w: dragSelection.startBounds.w, h: dragSelection.startBounds.h };
    // Consistent snapping for movement
    const snapped = snapSelectionBounds(tentative, [...selectedIds], undefined, INTERACTIVE_SNAP);
    const snapDx = snapped.x - tentative.x; const snapDy = snapped.y - tentative.y;
    [...selectedIds].forEach(id => {
      const start = dragSelection.starts.get(id);
      const m = deepClone(start);
      m.x = start.x + dx + snapDx; m.y = start.y + dy + snapDy;
      if (m.type === 'line' && typeof m.x2 === 'number'){ m.x2 = (start.x2||start.x) + dx + snapDx; m.y2 = (start.y2||start.y) + dy + snapDy; }
      const idx = page.elements.findIndex(el => el.id === id); if (idx !== -1) page.elements[idx] = m;
      const node = document.querySelector(`.page [data-id="${id}"]`); if (node) applyElementStyles(node, m);
    });
    showGuidesForBounds(snapped, getPageNode());
    updateSelectionBox();
    return;
  }
  // If we're not actively dragging or resizing a single element, bail out.
  if (!drag && !resize) {
    return;
  }
  const active = drag || resize; // guaranteed non-null here
  const idx = page.elements.findIndex(el => el.id === active.id); if (idx === -1) return;
  const dx = pt.x - active.start.x; const dy = pt.y - active.start.y;
  const m = deepClone(active.orig);
  if (resize) {
    applyResize(m, dx, dy, resize.mode);
    // Apply snapping to single element resize
    const tentativeBounds = getBoundsForModel(m);
    // Provide preference so snapping uses the active resized edges
    const prefer = { x: resize.mode.includes('e') ? 'right' : resize.mode.includes('w') ? 'left' : undefined,
                     y: resize.mode.includes('s') ? 'bottom' : resize.mode.includes('n') ? 'top' : undefined };
    // Consistent snapping for resize
    const snappedBounds = snapSelectionBounds(tentativeBounds, [active.id], prefer, INTERACTIVE_SNAP);
    // Instead of shifting the whole element (which moves the opposite edge),
    // adjust the resized edge to the snapped coordinate.
    const tentLeft = tentativeBounds.x;
    const tentRight = tentativeBounds.x + tentativeBounds.w;
    const tentTop = tentativeBounds.y;
    const tentBottom = tentativeBounds.y + tentativeBounds.h;
    const snapLeft = snappedBounds.x;
    const snapRight = snappedBounds.x + snappedBounds.w;
    const snapTop = snappedBounds.y;
    const snapBottom = snappedBounds.y + snappedBounds.h;

    // Horizontal adjustment
    if (resize.mode.includes('e')) {
      const deltaRight = snapRight - tentRight;
      if (m.type === 'line' && typeof m.x2 === 'number'){
        m.x2 += deltaRight;
      } else {
        m.w = Math.max(10, (m.w || 0) + deltaRight);
      }
    } else if (resize.mode.includes('w')) {
      const newLeft = snapLeft;
      const newWidth = Math.max(10, tentRight - newLeft);
      if (m.type === 'line' && typeof m.x2 === 'number'){
        // Move left endpoint while keeping right endpoint fixed
        const rightX = Math.max(m.x, m.x2);
        const leftWas = Math.min(m.x, m.x2);
        const shift = newLeft - tentLeft;
        if (m.x <= m.x2) { m.x += shift; } else { m.x2 += shift; }
      } else {
        m.x = newLeft; m.w = newWidth;
      }
    }

    // Vertical adjustment
    if (resize.mode.includes('s')) {
      const deltaBottom = snapBottom - tentBottom;
      if (m.type === 'line' && typeof m.y2 === 'number'){
        m.y2 += deltaBottom;
      } else {
        m.h = Math.max(10, (m.h || 0) + deltaBottom);
      }
    } else if (resize.mode.includes('n')) {
      const newTop = snapTop;
      const newHeight = Math.max(10, tentBottom - newTop);
      if (m.type === 'line' && typeof m.y2 === 'number'){
        const topWas = Math.min(m.y, m.y2);
        const shift = newTop - tentTop;
        if (m.y <= m.y2) { m.y += shift; } else { m.y2 += shift; }
      } else {
        m.y = newTop; m.h = newHeight;
      }
    }
    showGuidesForBounds(snappedBounds, getPageNode());
  } else {
    if (m.type === 'line') { m.x += dx; m.y += dy; m.x2 += dx; m.y2 += dy; } else { m.x += dx; m.y += dy; }
    // snap and show guides for single element
    const tentative = getBoundsForModel(m);
    // Consistent snapping for movement
    const snapped = snapSelectionBounds(tentative, [active.id], undefined, INTERACTIVE_SNAP);
    const snapDx = snapped.x - tentative.x; const snapDy = snapped.y - tentative.y;
    if (m.type === 'line' && typeof m.x2 === 'number'){
      m.x += snapDx; m.y += snapDy; m.x2 += snapDx; m.y2 += snapDy;
    } else { m.x += snapDx; m.y += snapDy; }
    showGuidesForBounds(snapped, getPageNode());
    // If dragging a block, translate its descendants by the block's total displacement (including snapping)
    if (active.descendants && active.orig && active.orig.type === 'block'){
      const totalDx = (m.x - active.orig.x);
      const totalDy = (m.y - active.orig.y);
      active.descendants.forEach((startChild, childId) => {
        const childIdx = page.elements.findIndex(el => el.id === childId);
        if (childIdx === -1) return;
        const ch = deepClone(startChild);
        if (ch.type === 'line' && typeof ch.x2 === 'number'){
          ch.x += totalDx; ch.y += totalDy; ch.x2 += totalDx; ch.y2 += totalDy;
        } else {
          ch.x += totalDx; ch.y += totalDy;
        }
        page.elements[childIdx] = ch;
        const nodeCh = document.querySelector(`.page [data-id="${childId}"]`);
        if (nodeCh) applyElementStyles(nodeCh, ch);
      });
    }
  }
  page.elements[idx] = m;
  applyElementStyles(document.querySelector(`.page [data-id="${active.id}"]`), m);
  updateFormatToolbarVisibility(); positionElementActions(); updateSelectionBox();
}

function onMouseUp(){
  // Detect whether a gesture actually occurred (move/resize/rotate)
  const hadGesture = !!drag || !!resize || !!dragSelection || !!resizeSelectionState || !!rotateSelectionState;
  const type = dragSelection ? 'multi-drag' : (resize ? 'resize' : (drag ? 'drag' : (rotateSelectionState ? 'rotate' : (dragMaybe ? 'dragMaybe' : 'none'))));
  if (hadGesture) {
    console.log(`[GESTURE] ${type}:end`);
  } else if (dragMaybe) {
    console.log('[GESTURE] drag:cancel');
  }
  // After a move/resize/rotate, reparent elements into blocks (if applicable) and reflow stacks
  if (hadGesture){
    const page = getCurrentPage();
    try {
      reparentIntoBlocks(page, [...selectedIds]);
      reflowStacks(page);
      renderPage(page);
      if (selectedIds.size) setSelection([...selectedIds]);
    } catch {}
  }
  // History was already captured at gesture start
  if (drag){ drag = null; }
  if (resize){ resize = null; }
  if (dragSelection){ dragSelection = null; }
  if (rotateSelectionState){ rotateSelectionState = null; }
  // Clear any pending, not-yet-promoted drag from a prior click to avoid accidental moves
  if (dragMaybe){ dragMaybe = null; }
  // hide guides and reshow actions
  hideGuides();
  positionElementActions();
  Controller.snapState = { x: null, y: null };
}

/* ----------------------- Resize helpers ----------------------- */
function getResizeMode(e, node){
  // Provide visual resize cursors when near element edges (single selection cue)
  const rect = node.getBoundingClientRect();
  const margin = 6;
  const x = e.clientX - rect.left; const y = e.clientY - rect.top;
  const left = x < margin; const right = x > rect.width - margin;
  const top = y < margin; const bottom = y > rect.height - margin;
  if ((left && top)) return 'nw';
  if ((right && top)) return 'ne';
  if ((left && bottom)) return 'sw';
  if ((right && bottom)) return 'se';
  if (top) return 'n'; if (bottom) return 's'; if (left) return 'w'; if (right) return 'e';
  return null;
}

function updateResizeCursor(e, node){
  // In view mode, never show resize cursors
  if (!Model || !Model.document || !Model.document.editMode){ node.style.cursor = ''; return; }
  const id = node.dataset.id; const page = getCurrentPage();
  const m = page?.elements.find(el => el.id === id) || {};
  const mode = getResizeMode(e, node, m);
  const map = { n: 'ns-resize', s:'ns-resize', e:'ew-resize', w:'ew-resize', ne:'nesw-resize', sw:'nesw-resize', nw:'nwse-resize', se:'nwse-resize' };
  node.style.cursor = map[mode] || '';
}

function applyResize(m, dx, dy, mode){
  if (m.type === 'line') return;
  const minW = 10, minH = 10;
  let minTableW = minW, minTableH = minH;
  if (m.type === 'table'){
    minTableW = (m.colWidths || []).reduce((a,b)=>a+b, 0) || minW;
    minTableH = (m.rowHeights || []).reduce((a,b)=>a+b, 0) || minH;
  }
  const clampW = (w) => Math.max(m.type==='table'?minTableW:minW, w);
  const clampH = (h) => Math.max(m.type==='table'?minTableH:minH, h);
  if (mode.includes('e')) m.w = clampW((m.w || 0) + dx);
  if (mode.includes('s')) m.h = clampH((m.h || 0) + dy);
  if (mode.includes('w')) { m.x += dx; m.w = clampW((m.w || 0) - dx); }
  if (mode.includes('n')) { m.y += dy; m.h = clampH((m.h || 0) - dy); }
}

/* -------- Selection resize helpers (multi) -------- */
function startSelectionResize(handle, event){
  if (selectedIds.size === 0) return;
  const startBounds = getSelectionBounds(); if (!startBounds) return;
  const pageNode = getPageNode();
  const pt = getCanvasPoint(event, pageNode);
  const starts = new Map();
  [...selectedIds].forEach(id => starts.set(id, deepClone(getElementById(id))));
  if (handle === 'move'){
    const pointerOffset = { ox: pt.x - startBounds.x, oy: pt.y - startBounds.y };
    commitHistory('move');
    dragSelection = { startBounds, starts, pointerOffset };
    return;
  }
  if (handle === 'rotate'){
    const cx = startBounds.x + startBounds.w/2; const cy = startBounds.y + startBounds.h/2;
    const startAngle = Math.atan2(pt.y - cy, pt.x - cx);
    commitHistory('rotate-multi');
    rotateSelectionState = { startBounds, starts, startAngle };
    return;
  }
  resizeSelectionState = { handle, startBounds, starts, startPoint: pt };
}

function applySelectionResize(event){
  if (!resizeSelectionState) return;
  const pageNode = getPageNode();
  const pt = getCanvasPoint(event, pageNode);
  const sb = resizeSelectionState.startBounds;
  const minW = 10, minH = 10; // Allow elements to be resized to minimum size
  let nx = sb.x, ny = sb.y, nw = sb.w, nh = sb.h;
  const h = resizeSelectionState.handle;
  const right = sb.x + sb.w, bottom = sb.y + sb.h;
  if (h.includes('e')) { nw = Math.max(minW, pt.x - sb.x); }
  if (h.includes('s')) { nh = Math.max(minH, pt.y - sb.y); }
  if (h.includes('w')) { nx = Math.min(pt.x, right - minW); nw = Math.max(minW, right - nx); }
  if (h.includes('n')) { ny = Math.min(pt.y, bottom - minH); nh = Math.max(minH, bottom - ny); }
  // Apply snapping to the new bounds before applying transformations
  const tentativeBounds = { x: nx, y: ny, w: nw, h: nh };
  const prefer = { x: resizeSelectionState?.handle?.includes('e') ? 'right' : resizeSelectionState?.handle?.includes('w') ? 'left' : undefined,
                   y: resizeSelectionState?.handle?.includes('s') ? 'bottom' : resizeSelectionState?.handle?.includes('n') ? 'top' : undefined };
  // Consistent snapping for resize
  const snappedBounds = snapSelectionBounds(tentativeBounds, [...selectedIds], prefer, INTERACTIVE_SNAP);
  
  // Adjust only the actively resized edges to the snapped coordinates,
  // keeping the opposite edges anchored to the original selection bounds.
  const tentLeft = tentativeBounds.x;
  const tentRight = tentativeBounds.x + tentativeBounds.w;
  const tentTop = tentativeBounds.y;
  const tentBottom = tentativeBounds.y + tentativeBounds.h;
  const snapLeft = snappedBounds.x;
  const snapRight = snappedBounds.x + snappedBounds.w;
  const snapTop = snappedBounds.y;
  const snapBottom = snappedBounds.y + snappedBounds.h;

  // Horizontal adjustments
  if (h.includes('e')) {
    const deltaRight = snapRight - tentRight;
    nw = Math.max(minW, nw + deltaRight);
  }
  if (h.includes('w')) {
    const newLeft = snapLeft;
    nx = newLeft;
    nw = Math.max(minW, right - nx);
  }

  // Vertical adjustments
  if (h.includes('s')) {
    const deltaBottom = snapBottom - tentBottom;
    nh = Math.max(minH, nh + deltaBottom);
  }
  if (h.includes('n')) {
    const newTop = snapTop;
    ny = newTop;
    nh = Math.max(minH, bottom - ny);
  }
  
  // Recalculate scaling factors with snapped bounds
  const sx = nw / sb.w;
  const sy = nh / sb.h;
  
  const page = getCurrentPage();
  [...selectedIds].forEach(id => {
    const start = resizeSelectionState.starts.get(id);
    const out = deepClone(start);
    if (start.type === 'line' && typeof start.x2 === 'number' && typeof start.y2 === 'number'){
      const rx1 = start.x - sb.x; const ry1 = start.y - sb.y;
      const rx2 = (start.x2 ?? start.x) - sb.x; const ry2 = (start.y2 ?? start.y) - sb.y;
      out.x = nx + rx1 * sx; out.y = ny + ry1 * sy;
      out.x2 = nx + rx2 * sx; out.y2 = ny + ry2 * sy;
    } else {
      const rx = start.x - sb.x; const ry = start.y - sb.y;
      out.x = nx + rx * sx; out.y = ny + ry * sy;
      if (typeof start.w === 'number') out.w = Math.max(minW, (start.w || 0) * sx);
      if (typeof start.h === 'number') out.h = Math.max(minH, (start.h || 0) * sy);
    }
    const idx = page.elements.findIndex(e => e.id === id); if (idx !== -1) page.elements[idx] = out;
    const node = document.querySelector(`.page [data-id="${id}"]`); if (node) applyElementStyles(node, out);
  });
  
  // Show guidelines with snapped bounds
  showGuidesForBounds(snappedBounds, getPageNode());
  
  updateSelectionBox();
}

/* ----------------------- Guides ----------------------- */
function getGuidesNodes(pageNode = getPageNode()) {
  const page = pageNode; if (!page) return {};
  return {
    v: page.querySelector('.guide.v'),
    h: page.querySelector('.guide.h'),
    rect: page.getBoundingClientRect(),
  };
}

function hideGuides(){
  const { v, h } = getGuidesNodes();
  if (v) v.classList.add('hidden');
  if (h) h.classList.add('hidden');
}

// Softer snapping so it feels less aggressive
const SNAP_THRESHOLD = 5; const STICKY_RANGE = 5;
// Use the same interactive snap config for move and resize gestures
const INTERACTIVE_SNAP = { threshold: SNAP_THRESHOLD, sticky: 0, noSticky: true };
function getGuidesForCurrentPage(excludeIds = []){
  const pageNode = getPageNode(); const page = getCurrentPage();
  const v = [0, pageNode.clientWidth/2, pageNode.clientWidth];
  const h = [0, pageNode.clientHeight/2, pageNode.clientHeight];
  page.elements.filter(e => !excludeIds.includes(e.id)).forEach(e => {
    const w = e.w || 0, hgt = e.h || 0; v.push(e.x, e.x + w/2, e.x + w); h.push(e.y, e.y + hgt/2, e.y + hgt);
  });
  return { v, h, pageNode };
}

function getBoundsForModel(m){
  if (m.type === 'line' && typeof m.x2 === 'number' && typeof m.y2 === 'number'){
    const left = Math.min(m.x, m.x2), top = Math.min(m.y, m.y2);
    const right = Math.max(m.x, m.x2), bottom = Math.max(m.y, m.y2);
    return { x:left, y:top, w:right-left, h:bottom-top };
  }
  return { x:m.x, y:m.y, w:m.w || 0, h:m.h || 0 };
}
function snapSelectionBounds(b, excludeIds = [], prefer, options){
  // Allow toggling snap off via UI
  if (typeof SNAP_ENABLED !== 'undefined' && !SNAP_ENABLED) {
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  }
  const { v, h } = getGuidesForCurrentPage(excludeIds);
  const threshold = options?.threshold ?? SNAP_THRESHOLD;
  const stickyRange = options?.sticky ?? STICKY_RANGE;
  const disableSticky = options?.noSticky === true;
  const left=b.x, cx=b.x+b.w/2, right=b.x+b.w; const top=b.y, cy=b.y+b.h/2, bottom=b.y+b.h;
  const targetsX = prefer?.x === 'left' ? [left] : prefer?.x === 'center' ? [cx] : prefer?.x === 'right' ? [right] : [left,cx,right];
  const targetsY = prefer?.y === 'top' ? [top] : prefer?.y === 'middle' ? [cy] : prefer?.y === 'bottom' ? [bottom] : [top,cy,bottom];
  const nx = findNearest(v, targetsX, threshold); const ny = findNearest(h, targetsY, threshold);
  let outX = b.x, outY = b.y;
  // Only apply sticky snapping when no preference is set (i.e., moving) or when sticky matches preferred edge
  const canStickX = !disableSticky && (!prefer || (Math.min(...targetsX.map(t => Math.abs(t - (Controller.snapState.x ?? Infinity)))) <= stickyRange));
  const canStickY = !disableSticky && (!prefer || (Math.min(...targetsY.map(t => Math.abs(t - (Controller.snapState.y ?? Infinity)))) <= stickyRange));
  if (nx || (Controller.snapState.x!=null && canStickX)){
    const [c,whichIdx] = nx || [Controller.snapState.x, (targetsX.length===1?0:1)];
    // Map whichIdx back to left/center/right index against [left,cx,right]
    let which = whichIdx;
    if (targetsX.length !== 3){
      // derive which from preferred
      which = prefer?.x === 'left' ? 0 : prefer?.x === 'center' ? 1 : prefer?.x === 'right' ? 2 : 1;
    }
    outX = which===0? c : (which===1? c - b.w/2 : c - b.w); Controller.snapState.x = c;
  }
  if (ny || (Controller.snapState.y!=null && canStickY)){
    const [c,whichIdx] = ny || [Controller.snapState.y, (targetsY.length===1?0:1)];
    let which = whichIdx;
    if (targetsY.length !== 3){
      which = prefer?.y === 'top' ? 0 : prefer?.y === 'middle' ? 1 : prefer?.y === 'bottom' ? 2 : 1;
    }
    outY = which===0? c : (which===1? c - b.h/2 : c - b.h); Controller.snapState.y = c;
  }
  return { x: outX, y: outY, w: b.w, h: b.h };
}
function showGuidesForBounds(b, pageNode){
  if (typeof GUIDES_ENABLED !== 'undefined' && !GUIDES_ENABLED) { hideGuides(); return; }
  const { v, h } = getGuidesNodes(pageNode); if (!v || !h) return;
  // Compute nearest guides and prefer the currently active resize edge if any
  const left = b.x, cx = b.x + b.w/2, right = b.x + b.w;
  const top = b.y, cy = b.y + b.h/2, bottom = b.y + b.h;
  const { v: vg, h: hg } = getGuidesForCurrentPage([...selectedIds]);

  // Determine active edges for visualization
  const mode = (resize && resize.mode) || (resizeSelectionState && resizeSelectionState.handle) || '';
  const preferLeft = !!mode && mode.includes('w');
  const preferRight = !!mode && mode.includes('e');
  const preferTop = !!mode && mode.includes('n');
  const preferBottom = !!mode && mode.includes('s');

  const nx = preferRight ? findNearest(vg, [right], SNAP_THRESHOLD)
           : preferLeft ? findNearest(vg, [left], SNAP_THRESHOLD)
           : findNearest(vg, [left, cx, right], SNAP_THRESHOLD);
  const ny = preferBottom ? findNearest(hg, [bottom], SNAP_THRESHOLD)
           : preferTop ? findNearest(hg, [top], SNAP_THRESHOLD)
           : findNearest(hg, [top, cy, bottom], SNAP_THRESHOLD);

  const vx = nx ? nx[0] : (Controller.snapState.x != null ? Controller.snapState.x : (preferRight ? right : (preferLeft ? left : cx)));
  const vy = ny ? ny[0] : (Controller.snapState.y != null ? Controller.snapState.y : (preferBottom ? bottom : (preferTop ? top : cy)));

  v.style.left = vx + 'px'; v.style.top = '0px'; v.style.height = pageNode.clientHeight + 'px';
  h.style.left = '0px'; h.style.top = vy + 'px'; h.style.width = pageNode.clientWidth + 'px';
  v.classList.remove('hidden'); h.classList.remove('hidden');
}

function findNearest(candidates, targets, threshold){
  let best = null; let bestDist = Infinity; let bestWhich = -1;
  for (let i = 0; i < candidates.length; i++){
    const c = candidates[i];
    for (let t = 0; t < targets.length; t++){
      const d = Math.abs(c - targets[t]);
      if (d <= threshold && d < bestDist) { best = c; bestDist = d; bestWhich = t; }
    }
  }
  return best != null ? [best, bestWhich] : null;
}

/* ----------------------- Selection utilities ----------------------- */
/* getElementById moved to editor.core.js */

function getSelectionBounds(){
  const els = [...selectedIds].map(getElementById).filter(Boolean);
  if (!els.length) return null;
  const left = Math.min(...els.map(e => e.x));
  const top = Math.min(...els.map(e => e.y));
  const right = Math.max(...els.map(e => e.x + (e.w||0)));
  const bottom = Math.max(...els.map(e => e.y + (e.h||0)));
  return { x:left, y:top, w:right-left, h:bottom-top };
}

function applyPatchToSelection(patch, historyLabel = 'update-multi'){
  if (selectedIds.size === 0) return;
  commitHistory(historyLabel);
  const page = getCurrentPage();
  [...selectedIds].forEach(id => {
    const idx = page.elements.findIndex(e => e.id === id);
    if (idx !== -1) page.elements[idx] = deepMerge(page.elements[idx], patch);
  });
  renderPage(page); updateSelectionUI();
}

/* ----------------------- Align/Distribute ----------------------- */
function alignSelection(where){
  if (selectedIds.size < 2) return;
  const p = getCurrentPage(); const ids = [...selectedIds];
  const bounds = getSelectionBounds(); if (!bounds) return;
  commitHistory('align');
  ids.forEach(id => {
    const m = getElementById(id); if (!m) return; const out = deepClone(m);
    if (where === 'left') out.x = bounds.x;
    if (where === 'center') out.x = Math.round(bounds.x + (bounds.w - (m.w||0)) / 2);
    if (where === 'right') out.x = bounds.x + bounds.w - (m.w||0);
    if (where === 'top') out.y = bounds.y;
    if (where === 'middle') out.y = Math.round(bounds.y + (bounds.h - (m.h||0)) / 2);
    if (where === 'bottom') out.y = bounds.y + bounds.h - (m.h||0);
    const idx = p.elements.findIndex(e => e.id === id); if (idx !== -1) p.elements[idx] = out;
  });
  renderPage(p); updateSelectionUI();
}
function distributeSelection(axis){
  if (selectedIds.size < 3) return;
  const p = getCurrentPage(); const ids = [...selectedIds];
  // Order by position along axis
  const ordered = ids.map(id => getElementById(id)).filter(Boolean).sort((a,b)=> (axis==='h'?a.x:b.y) - (axis==='h'?b.x:a.y));
  if (ordered.length < 3) return;
  commitHistory('distribute');
  if (axis === 'h'){
    const left = Math.min(...ordered.map(e=>e.x));
    const right = Math.max(...ordered.map(e=>e.x + (e.w||0)));
    const totalW = ordered.reduce((s,e)=> s + (e.w||0), 0);
    const gap = (right - left - totalW) / (ordered.length - 1);
    let cur = left;
    ordered.forEach((el, i) => {
      const out = deepClone(el); out.x = Math.round(cur); cur += (el.w||0) + gap; const idx = p.elements.findIndex(e=>e.id===el.id); if (idx!==-1) p.elements[idx]=out; });
  } else {
    const top = Math.min(...ordered.map(e=>e.y));
    const bottom = Math.max(...ordered.map(e=>e.y + (e.h||0)));
    const totalH = ordered.reduce((s,e)=> s + (e.h||0), 0);
    const gap = (bottom - top - totalH) / (ordered.length - 1);
    let cur = top;
    ordered.forEach((el, i) => {
      const out = deepClone(el); out.y = Math.round(cur); cur += (el.h||0) + gap; const idx = p.elements.findIndex(e=>e.id===el.id); if (idx!==-1) p.elements[idx]=out; });
  }
  renderPage(p); updateSelectionUI();
}

/* ----------------------- Grouping helpers & actions ----------------------- */
function ensureGroupId(){ return 'grp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,6); }
function getElementsByGroup(groupId){ return getCurrentPage().elements.filter(e => e.groupId === groupId); }
function getElementGroupId(id){ const m = getElementById(id); return m?.groupId ?? null; }
function assignGroup(ids, groupId){ const p = getCurrentPage(); ids.forEach(id => { const m = p.elements.find(e => e.id === id); if (m) m.groupId = groupId; }); }
function clearGroup(ids){ const p = getCurrentPage(); ids.forEach(id => { const m = p.elements.find(e => e.id === id); if (m) m.groupId = null; }); }

function groupSelection(){
  if (selectedIds.size < 2) return;
  const gid = ensureGroupId();
  commitHistory('group');
  assignGroup([...selectedIds], gid);
  renderPage(getCurrentPage()); updateSelectionUI();
}
function ungroupSelection(){
  if (selectedIds.size === 0) return;
  const first = getElementById([...selectedIds][0]);
  const gid = first?.groupId; if (!gid) return;
  const allSame = [...selectedIds].every(id => getElementById(id)?.groupId === gid);
  if (!allSame) return;
  commitHistory('ungroup');
  clearGroup([...selectedIds]);
  renderPage(getCurrentPage()); updateSelectionUI();
}

// Toggle group/ungroup for action bar button
function updateGroupToggleButton(){
  const actions = elementActions(); if (!actions) return;
  const btn = actions.querySelector('[data-group-toggle]'); if (!btn) return;
  const first = selectedIds.size ? getElementById([...selectedIds][0]) : null;
  const gid = first?.groupId;
  const allSame = gid && [...selectedIds].every(id => getElementById(id)?.groupId === gid);
  btn.textContent = allSame ? 'Ungroup' : 'Group';
  btn.disabled = selectedIds.size < 2 && !allSame;
}
function toggleGroupSelection(){
  const first = selectedIds.size ? getElementById([...selectedIds][0]) : null;
  const gid = first?.groupId;
  const allSame = gid && [...selectedIds].every(id => getElementById(id)?.groupId === gid);
  if (allSame) { ungroupSelection(); }
  else if (selectedIds.size >= 2) { groupSelection(); }
}

/* ----------------------- Multi copy/delete ----------------------- */
let clipboardElements = []; // Internal clipboard for elements

function copyToClipboard() {
  if (selectedIds.size === 0) return;
  clipboardElements = [...selectedIds].map(id => {
    const element = deepClone(getElementById(id));
    return element;
  });
}

function pasteFromClipboard() {
  if (clipboardElements.length === 0) return;
  
  const page = getCurrentPage();
  const clones = [];
  const offset = 12; // Offset for pasted elements
  
  clipboardElements.forEach(src => {
    const clone = deepClone(src);
    clone.id = generateId();
    clone.x += offset; 
    clone.y += offset;
    if (clone.type === 'line' && typeof clone.x2 === 'number' && typeof clone.y2 === 'number') {
      clone.x2 += offset; 
      clone.y2 += offset;
    }
    clones.push(clone);
  });
  
  if (clones.length === 0) return;
  commitHistory('paste-multi');
  page.elements.push(...clones);
  setSelection(clones.map(c => c.id));
  renderPage(page);
}

function copySelection(offset = 12){
  if (selectedIds.size === 0) return;
  const page = getCurrentPage();
  const clones = [];
  [...selectedIds].forEach(id => {
    const src = deepClone(getElementById(id));
    if (!src) return;
    src.id = generateId();
    src.x += offset; src.y += offset;
    if (src.type === 'line' && typeof src.x2 === 'number' && typeof src.y2 === 'number'){
      src.x2 += offset; src.y2 += offset;
    }
    clones.push(src);
  });
  if (clones.length === 0) return;
  commitHistory('copy-multi');
  page.elements.push(...clones);
  setSelection(clones.map(c => c.id));
  renderPage(page);
}

function deleteSelection(){
  if (selectedIds.size === 0) return;
  const page = getCurrentPage();
  commitHistory('delete-multi');
  page.elements = page.elements.filter(e => !selectedIds.has(e.id));
  clearSelection();
  renderPage(page);
  // Hide actions bubble after delete
  elementActions().classList.add('hidden');
}

/* ----------------------- Properties & Toolbar ----------------------- */
function bindFloatingToolbar(){
  const bar = formatToolbar();
  const hBtn = document.getElementById('alignHBtn');
  const vBtn = document.getElementById('alignVBtn');
  const tbg = document.getElementById('bgTransparentToggle');
  const readAlignForContext = () => {
    if (tableSel){
      const tModel = getElementById(tableSel.tableId);
      if (tModel){
        const ar = Math.min(tableSel.r0, tableSel.r1);
        const ac = Math.min(tableSel.c0, tableSel.c1);
        const id = tModel.grid[ar]?.[ac];
        const cell = id ? tModel.cells[id] : null;
        if (cell) return { h: cell.styles.alignH || 'left', v: cell.styles.alignV || 'top' };
      }
    }
    return readAlign();
  };
  bar.addEventListener('input', (e) => {
    const t = e.target;
    const prop = t.getAttribute('data-prop');
    if (!prop) return;
    
    const raw = (t.type === 'number' || t.type === 'range') ? Number(t.value) : t.value;
    
    // PRIORITY 1: If we have active table cell selection, always apply to cells
    if (tableSel) {
      const tModel = getElementById(tableSel.tableId);
      if (!tModel) return;
      
      // Handle different property types
      if (prop === 'styles.fill') {
        updateElement(tModel.id, tableApplyCellBg(tModel, tableSel, raw));
        return;
      }
      if (prop === 'styles.textColor') {
        updateElement(tModel.id, tableApplyTextColor(tModel, tableSel, raw));
        return;
      }
      
      // Handle cell-level styles (stroke, font, etc.)
      const cellStyleProps = ['styles.strokeColor', 'styles.strokeWidth', 'styles.fontFamily', 'styles.fontSize'];
      if (cellStyleProps.includes(prop)) {
        const key = prop.split('.')[1]; // Extract property name after 'styles.'
        updateElement(tModel.id, tableApplyCellStyle(tModel, tableSel, key, raw));
        return;
      }
    }
    
    // PRIORITY 2: If table elements are selected but no cells, try to restore last cell selection
    const selectedElements = [...selectedIds].map(id => getElementById(id)).filter(Boolean);
    const hasOnlyTables = selectedElements.length > 0 && selectedElements.every(el => el.type === 'table');
    
    if (hasOnlyTables && !tableSel && lastTableSel) {
      // Try to restore the last table selection for the selected table
      const selectedTable = selectedElements[0];
      if (selectedTable.id === lastTableSel.tableId) {
        setTableSelection(lastTableSel.tableId, lastTableSel.r0, lastTableSel.c0, lastTableSel.r1, lastTableSel.c1);
        // Now apply the formatting to the restored selection
        const tModel = getElementById(lastTableSel.tableId);
        if (tModel) {
          if (prop === 'styles.fill') {
            updateElement(tModel.id, tableApplyCellBg(tModel, tableSel, raw));
            return;
          }
          if (prop === 'styles.textColor') {
            updateElement(tModel.id, tableApplyTextColor(tModel, tableSel, raw));
            return;
          }
          const cellStyleProps = ['styles.strokeColor', 'styles.strokeWidth', 'styles.fontFamily', 'styles.fontSize'];
          if (cellStyleProps.includes(prop)) {
            const key = prop.split('.')[1];
            updateElement(tModel.id, tableApplyCellStyle(tModel, tableSel, key, raw));
            return;
          }
        }
      }
    }
    
    // PRIORITY 3: Prevent styling table containers when no cell selection exists
    if (hasOnlyTables && !tableSel) {
      // Block styling of table containers - user should select cells instead
      return;
    }
    
    // PRIORITY 4: Apply to regular element selection (non-table elements)
    if (selectedIds.size === 0) return;
    applyPatchToSelection(toPatch(prop, raw));
  });
  bar.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle],[data-z]');
    if (!t) return;
    if (t.dataset.toggle){
      const key = t.dataset.toggle;
      
      // PRIORITY 1: If we have active table cell selection, always apply to cells
      if (tableSel && key.startsWith('styles.')){
        const tModel = getElementById(tableSel.tableId); 
        if (!tModel) return;
        const styleKey = key.split('.')[1];
        const anyOff = tableAnyCellStyleOff(tModel, tableSel, styleKey);
        updateElement(tModel.id, tableApplyCellStyle(tModel, tableSel, styleKey, anyOff));
        t.setAttribute('aria-pressed', String(anyOff));
        return;
      }
      
      // PRIORITY 2: If table elements are selected but no cells, try to restore last cell selection  
      const selectedElements = [...selectedIds].map(id => getElementById(id)).filter(Boolean);
      const hasOnlyTables = selectedElements.length > 0 && selectedElements.every(el => el.type === 'table');
      
      if (hasOnlyTables && !tableSel && lastTableSel && key.startsWith('styles.')) {
        const selectedTable = selectedElements[0];
        if (selectedTable.id === lastTableSel.tableId) {
          setTableSelection(lastTableSel.tableId, lastTableSel.r0, lastTableSel.c0, lastTableSel.r1, lastTableSel.c1);
          // Now apply the toggle to the restored selection
          const tModel = getElementById(lastTableSel.tableId);
          if (tModel) {
            const styleKey = key.split('.')[1];
            const anyOff = tableAnyCellStyleOff(tModel, tableSel, styleKey);
            updateElement(tModel.id, tableApplyCellStyle(tModel, tableSel, styleKey, anyOff));
            t.setAttribute('aria-pressed', String(anyOff));
            return;
          }
        }
      }
      
      // PRIORITY 3: Prevent styling table containers when no cell selection exists
      if (hasOnlyTables && !tableSel) {
        // Block styling of table containers - user should select cells instead
        return;
      }
      
      // PRIORITY 4: Apply to regular element selection (non-table elements)
      if (selectedIds.size === 0) return;
      const anyOff = [...selectedIds].some(id => !getByPath(getElementById(id), key));
      applyPatchToSelection(toPatch(key, anyOff));
      t.setAttribute('aria-pressed', String(anyOff));
    } else if (t.dataset.z){
      if (t.dataset.z === 'front') sendSelectionToFront();
      else if (t.dataset.z === 'back') sendSelectionToBack();
      else if (t.dataset.z === 'up') bringSelectionForward();
      else if (t.dataset.z === 'down') sendSelectionBackward();
    }
  });

  if (tbg) {
    tbg.addEventListener('change', () => {
      if (selectedIds.size === 0) return;
      const on = tbg.checked;
      if (on) {
        const first = getElementById([...selectedIds][0]);
        tbg.dataset.prevFill = String(first?.styles?.fill ?? '');
        applyPatchToSelection(toPatch('styles.fill', 'transparent'));
      } else {
        const prev = tbg.dataset.prevFill || '#ffffff';
        applyPatchToSelection(toPatch('styles.fill', prev));
        delete tbg.dataset.prevFill;
      }
    });
  }

  const cycle = (val, list) => list[(list.indexOf(val) + 1) % list.length];
  const readAlign = () => {
    if (selectedIds.size !== 1) return { h:'left', v:'top' };
    const m = getElementById([...selectedIds][0]);
    return { h: m?.styles?.textAlignH || 'left', v: m?.styles?.textAlignV || 'top' };
  };
  window.applyAlignButtonState = function applyAlignButtonState(){
    const {h,v} = readAlign();
    hBtn.classList.remove('h-left','h-center','h-right');
    vBtn.classList.remove('v-top','v-middle','v-bottom');
    hBtn.classList.add('h-'+h);
    vBtn.classList.add(v === 'middle' ? 'v-middle' : 'v-'+v);
    const t = selectedIds.size === 1 ? getElementById([...selectedIds][0])?.type : null;
    const pressed = selectedIds.size === 1 && (t === 'text' || t === 'field' || t === 'rect');
    hBtn.setAttribute('aria-pressed', String(pressed));
    vBtn.setAttribute('aria-pressed', String(pressed));
  };
  hBtn.addEventListener('click', () => {
    const {h} = readAlignForContext();
    const next = cycle(h, ['left','center','right']);
    if (tableSel){
      const tModel = getElementById(tableSel.tableId);
      if (tModel) updateElement(tModel.id, tableApplyAlign(tModel, tableSel, next, undefined));
    } else {
      applyPatchToSelection(toPatch('styles.textAlignH', next));
      window.applyAlignButtonState();
    }
  });
  vBtn.addEventListener('click', () => {
    const {v} = readAlignForContext();
    const next = cycle(v, ['top','middle','bottom']);
    if (tableSel){
      const tModel = getElementById(tableSel.tableId);
      if (tModel) updateElement(tModel.id, tableApplyAlign(tModel, tableSel, undefined, next));
    } else {
      applyPatchToSelection(toPatch('styles.textAlignV', next));
      window.applyAlignButtonState();
    }
  });

  // Initialize align toggle state on load
  window.applyAlignButtonState();
}

function toPatch(path, value){
  const keys = path.split('.');
  let obj = {}; let cur = obj;
  keys.forEach((k, i) => { if (i === keys.length - 1) cur[k] = value; else { cur[k] = {}; cur = cur[k]; } });
  return obj;
}
function getByPath(obj, path){
  const ks = path.split('.'); let cur = obj; for (const k of ks){ if (cur==null) return undefined; cur = cur[k]; } return cur;
}
function togglePatch(path){
  const keys = path.split('.');
  const page = getCurrentPage();
  const m = page.elements.find(e => selectedIds.has(e.id));
  let cur = m;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  const last = keys[keys.length - 1];
  return toPatch(path, !cur[last]);
}

// Parse a string from the properties panel into a JS value
function parsePropertyValue(raw){
  const txt = String(raw ?? '').trim();
  if (txt === '') return '';
  if (txt === 'true') return true;
  if (txt === 'false') return false;
  if (txt === 'null') return null;
  // Try number
  const asNum = Number(txt);
  if (!Number.isNaN(asNum) && /^-?\d*(?:\.\d+)?$/.test(txt)) return asNum;
  // Try JSON for arrays/objects
  if ((txt.startsWith('{') && txt.endsWith('}')) || (txt.startsWith('[') && txt.endsWith(']'))){
    try { return JSON.parse(txt); } catch {}
  }
  return raw; // fallback to original string
}

// Keys that are part of the element model and should not be treated as HTML attributes
const RESERVED_MODEL_KEYS = new Set(['id','type','groupId','parentId','stackChildren','stackByPage','pageBreak','repeatOnAllPages','x','y','w','h','z','x2','y2','content','src','styles','grid','rows','cols','rowHeights','colWidths']);

function getCustomAttributesFromModel(model){
  const attrs = Object.assign({}, model && model.attrs ? model.attrs : {});
  // Also treat unknown top-level primitives as attributes for backward-compat
  if (model && typeof model === 'object'){
    Object.keys(model).forEach((k) => {
      if (RESERVED_MODEL_KEYS.has(k)) return;
      if (k === 'attrs') return;
      const v = model[k];
      const isPrimitive = (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
      if (isPrimitive) attrs[k] = v;
    });
  }
  return attrs;
}

function renderProperties(){
  const box = propertiesContent();
  try { console.log('[RENDER] renderProperties: selectionSize=', selectedIds.size, 'tableSel=', !!tableSel); } catch {}
  box.innerHTML = '';
  if (selectedIds.size === 0 && !tableSel) return;
  const page = getCurrentPage();
  let m = null; let groupId = null; let cellId = '';
  if (tableSel){
    // Show cell id for the anchor cell when a table selection exists
    const tModel = getElementById(tableSel.tableId);
    if (tModel){
      const ar = Math.min(tableSel.r0, tableSel.r1);
      const ac = Math.min(tableSel.c0, tableSel.c1);
      const cid = tModel.grid[ar]?.[ac];
      if (cid) cellId = cid;
      m = tModel; // fall through to show table properties too
    }
  }
  if (!m){
    if (selectedIds.size === 1){
      const one = [...selectedIds][0];
      m = page.elements.find(e => e.id === one);
      groupId = m?.groupId || '';
    } else if (selectedIds.size > 1){
      // multi: if all have same group, show it
      const ids = [...selectedIds];
      const first = page.elements.find(e => e.id === ids[0]);
      const gid = first?.groupId;
      const same = gid && ids.every(id => page.elements.find(e => e.id === id)?.groupId === gid);
      if (same) groupId = gid;
      m = first;
    }
  }
  if (!m) m = page.elements.find(e => selectedIds.has(e.id));
  // Base rows from core model
  const rows = [
    ['id', m?.id || 'multi'], ['type', m?.type || 'multi'], ['groupId', groupId || ''], ['x', m?.x], ['y', m?.y], ['w', m?.w], ['h', m?.h], ['z', m?.z]
  ];
  if (cellId) rows.unshift(['cellId', cellId]);
  
  // Add editable text content + formula field for text-like elements
  if (m && (m.type === 'text' || m.type === 'field' || m.type === 'rect')) {
    rows.push(['content', m.content || '']);
    const formula = (m && m.attrs && typeof m.attrs.formula === 'string') ? m.attrs.formula : '';
    rows.push(['formula', formula]);
  }
  
  // Include custom attributes as flat props for editing
  let customAttrs = getCustomAttributesFromModel(m || {});
  // Avoid duplicating builtin formula row when attrs also contains formula
  if (m && (m.type === 'text' || m.type === 'field' || m.type === 'rect')){
    if (customAttrs && Object.prototype.hasOwnProperty.call(customAttrs, 'formula')){
      delete customAttrs.formula;
    }
  }
  const customAttrKeys = new Set(Object.keys(customAttrs));
  Object.keys(customAttrs).forEach((name) => {
    rows.push([name, customAttrs[name]]);
  });

  // When a table cell is selected, also expose its per-cell attrs.* for editing
  if (m && m.type === 'table' && tableSel) {
    const rr = Math.min(tableSel.r0, tableSel.r1);
    const cc = Math.min(tableSel.c0, tableSel.c1);
    const cid = m.grid?.[rr]?.[cc];
    const cell = cid ? m.cells?.[cid] : null;
    if (cell && cell.attrs){
      Object.keys(cell.attrs).forEach((name) => {
        rows.push([`cell.${name}`, cell.attrs[name]]);
      });
    }
  }

  rows.forEach(([k,v]) => {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('label');
    name.textContent = k;
    let control;
    // Controls by type
    if (k === 'fontSize') {
      control = document.createElement('select');
      control.innerHTML = '<option>8</option><option>9</option><option>10</option><option>11</option><option>12</option><option>14</option><option>16</option><option>18</option><option>20</option><option>24</option><option>28</option><option>32</option><option>36</option><option>48</option><option>72</option>';
      control.dataset.prop = 'styles.'+k;
      control.value = String(v);
    } else if (k === 'fontFamily') {
      control = document.createElement('select');
      control.innerHTML = '<option value="system-ui">System</option><option value="Arial">Arial</option><option value="Helvetica Neue">Helvetica</option><option value="Times New Roman">Times</option><option value="Georgia">Georgia</option><option value="Courier New">Courier</option>';
      control.dataset.prop = 'styles.'+k;
      control.value = String(v);
    } else if (k === 'textColor') {
      control = document.createElement('input'); control.type = 'color'; control.value = v || '#111827'; control.dataset.prop = 'styles.'+k;
    } else if (k === 'bold' || k === 'italic') {
      control = document.createElement('input'); control.type = 'checkbox'; control.checked = !!v; control.dataset.prop = 'styles.'+k;
    } else if (k === 'content' || k === 'formula' || (customAttrKeys.has(k) && typeof v === 'string')) {
      control = document.createElement('textarea');
      control.rows = 3;
      control.value = v ?? '';
      control.dataset.prop = k;
      if (k === 'formula'){
        // Element picker button beside textarea (inline)
        // Keep simple: when clicking, it inserts a '#id' token at caret
        const wrap = document.createElement('div'); wrap.style.display='grid'; wrap.style.gridTemplateColumns='1fr 28px'; wrap.style.gap='6px';
        const pick = document.createElement('button'); pick.type='button'; pick.className='btn mini';
        pick.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
        const area = control;
        wrap.appendChild(area); wrap.appendChild(pick); control = wrap; // replace control with wrap
        // picker behavior: choose element or table cell and insert token
        pick.addEventListener('click', () => {
          // preserve selection
          const prevSelIds = Array.from(document.querySelectorAll('.page .element.selected')).map(n=>n.getAttribute('data-id')).filter(Boolean);
          const pageEl = document.querySelector('.page'); if (!pageEl) return;
          let last; window.__PICKING = true; document.body.classList.add('app-noselect');
          const block = (ev)=>{ ev.stopPropagation(); ev.preventDefault(); };
          document.addEventListener('pointerdown', block, true);
          document.addEventListener('mousedown', block, true);
          const onMove = (ev)=>{ const cell=ev.target.closest('.table-cell'); const el=cell||ev.target.closest('.page .element'); if (last===el) return; if (last) last.style.outline=''; last=el; if (last) last.style.outline='2px solid var(--primary)'; };
          const done = ()=>{ document.removeEventListener('mousemove', onMove, true); document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', block, true); document.removeEventListener('mousedown', block, true); if (last) last.style.outline=''; window.__PICKING=false; document.body.classList.remove('app-noselect'); if (Array.isArray(prevSelIds) && prevSelIds.length && typeof setSelection==='function') setSelection(prevSelIds); };
          const onKey = (e)=>{ if (e.key==='Escape'){ e.preventDefault(); done(); } };
          const onClick = (e)=>{ const cell=e.target.closest('.table-cell'); const el=cell||e.target.closest('.page .element'); if (!el){ done(); return; } e.preventDefault(); e.stopPropagation(); let token=''; if (cell){ const cid=cell.getAttribute('data-id'); if (cid) token = `#${cid}`; } else { const id=el.getAttribute('data-id'); if (id) token = `#${id}`; } const ta = wrap.querySelector('textarea'); if (ta){ const start = ta.selectionStart ?? ta.value.length; const end = ta.selectionEnd ?? ta.value.length; ta.value = ta.value.slice(0,start) + token + ta.value.slice(end); ta.dispatchEvent(new Event('change', { bubbles:true })); ta.focus(); ta.selectionStart = ta.selectionEnd = start + token.length; } done(); };
          document.addEventListener('mousemove', onMove, true);
          document.addEventListener('click', onClick, true);
          document.addEventListener('keydown', onKey, true);
        });
      }
    } else {
      control = document.createElement('input'); control.value = v ?? ''; control.dataset.prop = k;
    }
    row.appendChild(name);
    row.appendChild(control);
    box.appendChild(row);
  });

  // Block-specific: stacking children toggle
  if (m && m.type === 'block'){
    const row = document.createElement('div'); row.className = 'row'; row.style.display = 'flex'; row.style.alignItems = 'center';
    const lab = document.createElement('label'); lab.textContent = 'stackChildren';
    const ctl = document.createElement('input'); ctl.type='checkbox'; ctl.dataset.prop = 'stackChildren'; ctl.checked = !!m.stackChildren;
    row.appendChild(lab); row.appendChild(ctl); box.appendChild(row);
  }

  // Generic: stackByPage toggle available for all element types
  if (m){
    const row2 = document.createElement('div'); row2.className = 'row'; row2.style.display = 'flex'; row2.style.alignItems = 'center';
    const lab2 = document.createElement('label'); lab2.textContent = 'stackByPage';
    const ctl2 = document.createElement('input'); ctl2.type='checkbox'; ctl2.dataset.prop = 'stackByPage'; ctl2.checked = !!m.stackByPage;
    row2.appendChild(lab2); row2.appendChild(ctl2); box.appendChild(row2);

    // Page break toggle: forces this element to start on a new page
    const row3 = document.createElement('div'); row3.className = 'row'; row3.style.display = 'flex'; row3.style.alignItems = 'center';
    const lab3 = document.createElement('label'); lab3.textContent = 'pageBreak';
    const ctl3 = document.createElement('input'); ctl3.type='checkbox'; ctl3.dataset.prop = 'pageBreak'; ctl3.checked = !!m.pageBreak;
    row3.appendChild(lab3); row3.appendChild(ctl3); box.appendChild(row3);

    // Repeat flag (single checkbox)
    const row4 = document.createElement('div'); row4.className = 'row'; row4.style.display = 'flex'; row4.style.alignItems = 'center';
    const lab4 = document.createElement('label'); lab4.textContent = 'repeatOnAllPages';
    const ctl4 = document.createElement('input'); ctl4.type='checkbox'; ctl4.dataset.prop = 'repeatOnAllPages'; ctl4.checked = !!m.repeatOnAllPages;
    row4.appendChild(lab4); row4.appendChild(ctl4); box.appendChild(row4);
  }

  // Actions UI (bubble layout): choose function, trigger, and inputs; stack multiple
  try {
    const actionsRow = document.createElement('div');
    actionsRow.className = 'row';
    const lbl = document.createElement('label');
    lbl.textContent = 'Actions';
    const container = document.createElement('div');
    container.setAttribute('data-actions','');
    container.style.width = '100%';
    actionsRow.appendChild(lbl);
    actionsRow.appendChild(container);
    box.appendChild(actionsRow);

    // Supported DOM events -> attribute names
    const SUPPORTED = [ 'click','change','input','dblclick','focus','blur' ];

   

    function splitCalls(expr){
      const out = [];
      if (!expr) return out;
      let cur = '', depth = 0, quote = '';
      for (let i=0;i<expr.length;i++){
        const ch = expr[i];
        if (quote){ if (ch === quote && expr[i-1] !== '\\') quote = ''; cur += ch; continue; }
        if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
        if (ch === '(') { depth++; cur += ch; continue; }
        if (ch === ')') { depth = Math.max(0, depth-1); cur += ch; continue; }
        if ((ch === ';' || ch === ',') && depth === 0){ if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    }
    function parseCall(call){
      const m = call.match(/^\s*([\w$]+)\s*\((.*)\)\s*$/);
      if (!m) return { fn:'', args:[] };
      const fn = m[1];
      const argsRaw = m[2].trim();
      if (!argsRaw) return { fn, args:[] };
      const parts = splitCalls(argsRaw).map(s => s.trim()).filter(Boolean);
      return { fn, args: parts };
    }
    function buildExpr(calls){
      return calls.filter(c => c && c.fn).map(c => `${c.fn}(${c.args.join(', ')})`).join('; ');
    }

    function collectExisting(){
      // If a table cell is selected, read actions from the cell's attrs
      if (m && m.type === 'table' && cellId){
        const cell = m.cells ? m.cells[cellId] : null;
        const attrs = (cell && cell.attrs) ? cell.attrs : {};
        const items = [];
        SUPPORTED.forEach(evt => {
          const key = 'on' + evt;
          const expr = String(attrs[key] || '');
          splitCalls(expr).map(parseCall).forEach(c => items.push({ event: evt, fn: c.fn, args: c.args }));
        });
        return items;
      }
      // Otherwise use element-level attrs
      const attrs = getCustomAttributesFromModel(m || {});
      const items = [];
      SUPPORTED.forEach(evt => {
        const key = 'on' + evt;
        const expr = String(attrs[key] || '');
        splitCalls(expr).map(parseCall).forEach(c => items.push({ event: evt, fn: c.fn, args: c.args }));
      });
      return items;
    }

    function writeBack(items){
      // Preserve current selection (elements or table cells) to avoid deselection during updates
      const prevSelIds = Array.from(document.querySelectorAll('.page .element.selected'))
        .map(n => n && n.getAttribute('data-id'))
        .filter(Boolean);
      // Group by event and write complete expressions for each
      const per = {};
      SUPPORTED.forEach(e => per[e] = []);
      items.forEach(it => { if (SUPPORTED.includes(it.event) && it.fn) per[it.event].push({ fn: it.fn, args: it.args || [] }); });

      // If a table cell is selected, write actions into that cell's attrs
      if (m && m.type === 'table' && cellId){
        const next = deepClone(m);
        if (!next.cells[cellId]) next.cells[cellId] = { attrs: {} };
        if (!next.cells[cellId].attrs) next.cells[cellId].attrs = {};
        SUPPORTED.forEach(evt => {
          const expr = buildExpr(per[evt]);
          next.cells[cellId].attrs['on' + evt] = expr;
        });
        updateElement(next.id, next);
        // Restore selection after update
        if (Array.isArray(prevSelIds) && prevSelIds.length && typeof setSelection === 'function') {
          setSelection(prevSelIds);
        }
        return;
      }

      // Otherwise, element-level attrs
      SUPPORTED.forEach(evt => {
        const path = `attrs.on${evt}`;
        const expr = buildExpr(per[evt]);
        applyPatchToSelection(toPatch(path, expr), 'actions-update');
      });
      // Restore selection after attributes update
      if (Array.isArray(prevSelIds) && prevSelIds.length && typeof setSelection === 'function') {
        setSelection(prevSelIds);
      }
    }

    function render(){
      container.innerHTML = '';
      const funcs = getUserFunctionChoices();
      let items = collectExisting();
      const openSet = (window.__ACTION_OPEN || (window.__ACTION_OPEN = new Set()));

      // Add header with + button
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.marginBottom = '6px';
        const title = document.createElement('div');
      title.textContent = 'Adding function (add a bubble)';
      title.style.color = 'var(--muted)';
      title.style.fontSize = '11px';
      const addBtn = document.createElement('button'); addBtn.type='button'; addBtn.className='btn mini';
      addBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      header.appendChild(title); header.appendChild(addBtn);
      container.appendChild(header);

      function addEmpty(){
        const firstFn = funcs[0]?.name || '';
        const inputs = funcs[0]?.inputs || 0;
        items.push({ event: 'click', fn: firstFn, args: Array(inputs).fill("'"+""+"'") });
        writeBack(items); render();
      }
      addBtn.addEventListener('click', addEmpty);

      // List bubbles
      items.forEach((it, idx) => {
        const bubble = document.createElement('div');
        bubble.style.border = '1px solid var(--border)';
        bubble.style.borderRadius = '8px';
        bubble.style.padding = '8px';
        bubble.style.marginBottom = '8px';
        bubble.style.background = '#fafafa';
        bubble.style.width = '100%';
        bubble.style.boxSizing = 'border-box';

        // Top row: function + trigger + remove
        const top = document.createElement('div');
        top.style.display = 'grid';
        top.style.gridTemplateColumns = '28px minmax(0,1fr) 110px 28px';
        top.style.gap = '6px';

        // expand/collapse toggle
        const keyOf = () => `${idx}:${it.event}:${it.fn}`;
        let collapsed = !openSet.has(keyOf());
        const expBtn = document.createElement('button');
        expBtn.type = 'button';
        expBtn.className = 'btn mini';
        expBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 10l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

        // Function dropdown (same style as trigger)
        const fnSel = document.createElement('select');
        fnSel.innerHTML = '<option value="">Select function…</option>' + funcs.map(f => `<option value="${f.name}">${f.label}</option>`).join('');
        fnSel.value = it.fn || '';
        fnSel.style.width = '100%';

        const trgSel = document.createElement('select');
        trgSel.innerHTML = SUPPORTED.map(e => `<option value="${e}">${'on'+e}</option>`).join('');
        trgSel.value = it.event;
        trgSel.style.width = '100%';

        const delBtn = document.createElement('button'); delBtn.type='button'; delBtn.className='btn mini';
        delBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        delBtn.style.width = '24px';
        delBtn.style.height = '24px';
        delBtn.style.padding = '0';
        delBtn.style.display = 'inline-flex';
        delBtn.style.alignItems = 'center';
        delBtn.style.justifyContent = 'center';
        delBtn.style.borderRadius = '999px';

        top.appendChild(expBtn); top.appendChild(fnSel); top.appendChild(trgSel); top.appendChild(delBtn);
        bubble.appendChild(top);

        const inputsWrap = document.createElement('div');
        inputsWrap.style.display = 'grid';
        inputsWrap.style.gap = '6px';
        inputsWrap.style.marginTop = '6px';

        function rebuildInputs(){
          inputsWrap.innerHTML = '';
          const meta = funcs.find(f => f.name === fnSel.value);
          const count = meta ? (meta.inputs || 0) : 0;
          for (let i=0;i<count;i++){
            const r = document.createElement('div'); r.className='row'; r.style.display='contents';
            const lab = document.createElement('label'); lab.textContent = `input ${i+1}`;
            // input + pickers container
            const line = document.createElement('div');
            line.style.display = 'grid';
            line.style.gridTemplateColumns = '1fr 28px 28px';
            line.style.gap = '6px';
            const inp = document.createElement('input');
            // Prefer custom placeholders from function metadata, else default for first arg
            if (meta && Array.isArray(meta.placeholders) && meta.placeholders[i]) {
              inp.placeholder = String(meta.placeholders[i]);
            } else {
              inp.placeholder = i === 0 ? 'selected element (css selector)' : '';
            }
            // show clean value without surrounding quotes
            const raw = it.args?.[i] ? String(it.args[i]) : '';
            const unquoted = (raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"')) ? raw.slice(1,-1) : raw;
            inp.value = unquoted;
            // Only commit on change/blur (finished editing)
            const finished = () => commit();
            inp.addEventListener('change', finished);
            inp.addEventListener('blur', finished);
            // element picker button (target icon)
            const pickBtn = document.createElement('button'); pickBtn.type='button'; pickBtn.className='btn mini';
            pickBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
            // style picker button (eyedropper)
            const styleBtn = document.createElement('button'); styleBtn.type='button'; styleBtn.className='btn mini';
            styleBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 21l6-6m6-6l3 3-9 9H6v-3l9-9 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

            line.appendChild(inp); line.appendChild(pickBtn); line.appendChild(styleBtn);
            r.appendChild(lab); r.appendChild(line);
            inputsWrap.appendChild(r);

            // Picker helpers
            function rgbToHex(rgb){
              const m = String(rgb||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i); if (!m) return '#000000';
              const r = Number(m[1]).toString(16).padStart(2,'0');
              const g = Number(m[2]).toString(16).padStart(2,'0');
              const b = Number(m[3]).toString(16).padStart(2,'0');
              return `#${r}${g}${b}`;
            }
            function startElementPicker(kind){
              // Preserve selection before entering picker mode
              const prevSelIds = Array.from(document.querySelectorAll('.page .element.selected'))
                .map(n => n && n.getAttribute('data-id'))
                .filter(Boolean);
              const pageEl = document.querySelector('.page'); if (!pageEl) return;
              let last;
              window.__PICKING = true;
              document.body.classList.add('app-noselect');
              // Block pointer down inside the page so nothing re-targets selection
              const blockDown = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
              document.addEventListener('pointerdown', blockDown, true);
              document.addEventListener('mousedown', blockDown, true);
              document.addEventListener('touchstart', blockDown, { capture:true, passive:false });
              const onMove = (ev) => {
                // Prefer highlighting a table cell if under pointer; otherwise the element box
                const cell = ev.target.closest('.table-cell');
                const el = cell || ev.target.closest('.page .element');
                if (last === el) return;
                if (last) last.style.outline = '';
                last = el;
                if (last) last.style.outline = '2px solid var(--primary)';
              };
              const done = () => {
                document.removeEventListener('mousemove', onMove, true);
                document.removeEventListener('click', onClick, true);
                document.removeEventListener('keydown', onKey, true);
                document.removeEventListener('pointerdown', blockDown, true);
                document.removeEventListener('mousedown', blockDown, true);
                document.removeEventListener('touchstart', blockDown, true);
                if (last) last.style.outline = '';
                document.body.classList.remove('app-noselect');
                window.__PICKING = false;
                // Restore selection after picking
                if (Array.isArray(prevSelIds) && prevSelIds.length && typeof setSelection === 'function') {
                  setSelection(prevSelIds);
                }
              };
              const onKey = (e) => { if (e.key === 'Escape'){ e.preventDefault(); done(); } };
              const onClick = (e) => {
                // Support picking individual table cells as well as whole elements
                const cell = e.target.closest('.table-cell');
                const el = cell || e.target.closest('.page .element');
                if (!el) { done(); return; }
                e.preventDefault(); e.stopPropagation();
                if (kind === 'selector'){
                  if (cell){
                    const cid = cell.getAttribute('data-id');
                    if (cid) inp.value = `'[data-id="${cid}"]'`;
                  } else {
                    const id = el.getAttribute('data-id');
                    if (id) inp.value = `'[data-id="${id}"]'`;
                  }
                } else if (kind === 'style'){
                  const EXCLUDE = /^(?:width|height|left|top|right|bottom|inset|transform|translate|scale|rotate|position|z-index|x|y|outline(?:-.+)?)$/i;
                  const parts = [];
                  // Use the exact inline style attribute (as shown in DevTools)
                  try {
                    // Ensure picker outline is cleared before reading inline styles
                    el.style.outline = '';
                    const attr = el.getAttribute('style') || '';
                    attr.split(';').forEach(chunk => {
                      const seg = chunk.trim();
                      if (!seg) return;
                      const [kRaw, ...rest] = seg.split(':');
                      const k = (kRaw || '').trim();
                      const v = rest.join(':').trim(); // preserve any colons in values
                      if (!k || !v) return;
                      if (EXCLUDE.test(k)) return;
                      parts.push(`${k}:${v}`);
                    });
                  } catch {}
                  if (parts.length === 0){
                    // Fallback: pick a curated set from computed styles
                    const cs = getComputedStyle(el);
                    const keys = [
                      'background-color','color','border','border-color','border-width','border-style','border-radius',
                      'box-shadow','font-family','font-size','font-weight','font-style','text-decoration','text-align','line-height',
                      'opacity'
                    ];
                    keys.forEach(k => { const v = cs.getPropertyValue(k); if (v && v !== 'auto' && v !== 'normal' && v !== 'none') parts.push(`${k}:${v.trim()}`); });
                  }
                  const styleStr = parts.join('; ');
                  const escaped = styleStr.replace(/'/g, "\\'");
                  inp.value = `'${escaped}'`;
                }
                inp.dispatchEvent(new Event('change', { bubbles:true }));
                done();
              };
              document.addEventListener('mousemove', onMove, true);
              document.addEventListener('click', onClick, true);
              document.addEventListener('keydown', onKey, true);
            }
            pickBtn.addEventListener('click', () => startElementPicker('selector'));
            styleBtn.addEventListener('click', () => startElementPicker('style'));
          }
          // preserve args array length
          it.args = (it.args || []).slice(0, count);
        }

        function commit(){
          it.fn = fnSel.value || '';
          it.event = trgSel.value || 'click';
          // Read current inputs
          const vals = Array.from(inputsWrap.querySelectorAll('input')).map((inputEl) => {
            const v = String(inputEl.value || '').trim();
            if (v === '') return "''";
            if (v.startsWith("'") || v.startsWith('"')) return v; // already quoted
            // JSON-like only if it parses successfully
            if (v.startsWith('{') || v.startsWith('[')) {
              try { JSON.parse(v); return v; } catch {/* fall through to quote as string */}
            }
            if (/^-?\d+(?:\.\d+)?$/.test(v) || /^(true|false|null|undefined)$/i.test(v)) return v;
            const escaped = v.replace(/'/g, "\\'");
            return `'${escaped}'`;
          });
          it.args = vals;
          writeBack(items);
          // nothing else
          // keep expansion state for this updated signature
          if (!collapsed) openSet.add(keyOf()); else openSet.delete(keyOf());
        }

        fnSel.addEventListener('change', () => { rebuildInputs(); commit(); });
        trgSel.addEventListener('change', () => { commit(); });
        delBtn.addEventListener('click', () => {
          items.splice(idx, 1);
          writeBack(items);
          render();
        });

        bubble.appendChild(inputsWrap);
        rebuildInputs();
        // collapse by default
        const applyCollapsed = () => { inputsWrap.style.display = collapsed ? 'none' : 'grid'; expBtn.innerHTML = collapsed
          ? '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 8l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
          : '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 10l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
        };
        applyCollapsed();
        expBtn.addEventListener('click', () => { collapsed = !collapsed; if (collapsed) openSet.delete(keyOf()); else openSet.add(keyOf()); applyCollapsed(); });
        container.appendChild(bubble);
      });
    }

    render();
  } catch {}

  // Add-property trigger button (centered)
  const addWrap = document.createElement('div');
  addWrap.className = 'add-wrap';
  addWrap.innerHTML = `
    <button type="button" title="Add property" aria-label="Add property" data-add-prop-trigger
      style="width:28px;height:28px;border-radius:6px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;font-size:18px;line-height:26px;">+</button>`;
  box.appendChild(addWrap);
  const trigger = addWrap.querySelector('[data-add-prop-trigger]');
  if (trigger) trigger.addEventListener('click', () => showAddPropRow(box), { once: true });
  // Apply edits only when the field commits (blur/change)
  box.addEventListener('change', onPropsInput, { once: true });
  // While typing in content textarea, switch to formula automatically if starts with '='
  box.addEventListener('input', (ev) => {
    const t = ev.target; if (!t || !t.matches('textarea[data-prop="content"]')) return;
    const val = String(t.value || '');
    if (val.startsWith('=')){
      // move value to formula field and clear content field
      const formCtl = box.querySelector('textarea[data-prop="formula"]');
      if (formCtl && formCtl !== t){ formCtl.value = val; formCtl.dispatchEvent(new Event('change', { bubbles:true })); }
      t.value = '';
    }
  });
}
function onPropsInput(e){
  const t = e.target; if (!t.matches('[data-prop]')) return;
  const key = t.dataset.prop; 
  let val;
  if (t.type === 'checkbox') {
    val = t.checked;
  } else {
    val = parsePropertyValue(t.value);
  }
  // Special case: validate id uniqueness across the document
  if (key === 'id'){
    const newId = String(val || '');
    const currentIds = new Set();
    try {
      (Model.document?.pages || []).forEach(p => (p.elements || []).forEach(el => currentIds.add(el.id)));
    } catch {}
    // Allow keeping the same id of the first selected element
    const firstSelected = (selectedIds && selectedIds.size) ? [...selectedIds][0] : null;
    if (firstSelected) currentIds.delete(firstSelected);
    const exists = currentIds.has(newId);
    if (exists || newId.trim() === ''){
      // Mark invalid and stop
      t.setAttribute('aria-invalid','true');
      t.style.borderColor = '#ef4444';
      t.style.background = '#fee2e2';
      // Rebind for next change
  propertiesContent().addEventListener('change', onPropsInput, { once: true });
      return;
    } else {
      t.removeAttribute('aria-invalid');
      t.style.borderColor = '';
      t.style.background = '';
    }
  }
  // Special handling for per-cell attrs when a cell is active
  if (key.startsWith('cell.') && tableSel){
    const tModel = getElementById(tableSel.tableId);
    if (tModel && tModel.type === 'table'){
      const ar = Math.min(tableSel.r0, tableSel.r1);
      const ac = Math.min(tableSel.c0, tableSel.c1);
      const cid = tModel.grid[ar]?.[ac];
      if (cid){
        const next = deepClone(tModel);
        next.cells[cid] = next.cells[cid] || { attrs: {} };
        next.cells[cid].attrs = Object.assign({}, next.cells[cid].attrs);
        const name = key.slice('cell.'.length);
        next.cells[cid].attrs[name] = val;
        updateElement(next.id, next);
        // Keep selection
        setTableSelection(next.id, ar, ac);
      }
    }
    propertiesContent().addEventListener('change', onPropsInput, { once: true });
    return;
  }

  // Special case: 'formula' maps to attrs.formula
  if (key === 'formula'){
    applyPatchToSelection(toPatch('attrs.formula', String(val || '')));
    try { if (typeof window.recalculateAllFormulas === 'function') window.recalculateAllFormulas(); } catch {}
    renderPage(getCurrentPage());
    propertiesContent().addEventListener('change', onPropsInput, { once: true });
    return;
  }
  // If editing a reserved key or styles.* keep path, otherwise map to attrs.*
  const topKey = key.split('.')[0];
  const isReserved = RESERVED_MODEL_KEYS.has(topKey) || key.startsWith('styles.');
  const path = isReserved ? key : `attrs.${key}`;
  applyPatchToSelection(toPatch(path, val));
  // If stackByPage was toggled on/off, reflow immediately so element jumps in place
  if (key === 'stackByPage' || key === 'pageBreak' || key === 'repeatOnAllPages') {
    try { reflowStacks(getCurrentPage()); } catch {}
  }
  propertiesContent().addEventListener('change', onPropsInput, { once: true });
}

function showAddPropRow(container){
  // Replace trigger with input row
  const row = document.createElement('div');
  row.className = 'row';
  row.setAttribute('data-add-prop-row','');
  row.innerHTML = `
    <label>key</label>
    <input name="k" placeholder="path.like.styles.custom">
    <label>value</label>
    <textarea name="v" rows="3" placeholder="number / text / true / {…}"></textarea>
    <div class="row-hint"></div>
    <div style="display:flex; gap:6px; justify-content:flex-end;">
      <button type="button" data-confirm-add class="btn mini">Add</button>
      <button type="button" data-cancel-add class="btn mini">Cancel</button>
    </div>`;
  // Remove the trigger wrapper if it exists
  const trigWrap = container.querySelector('[data-add-prop-trigger]')?.parentElement;
  if (trigWrap) container.replaceChild(row, trigWrap); else container.appendChild(row);

  const keyInput = row.querySelector('input[name="k"]');
  const valInput = row.querySelector('[name="v"]');
  const confirmBtn = row.querySelector('[data-confirm-add]');
  const cancelBtn = row.querySelector('[data-cancel-add]');
  const confirm = () => {
    const key = keyInput.value.trim();
    const raw = valInput.value;
    if (!key) { keyInput.focus(); return; }
    const val = parsePropertyValue(raw);
    const topKey = key.split('.')[0];
    const isReserved = RESERVED_MODEL_KEYS.has(topKey) || key.startsWith('styles.');
    const path = isReserved ? key : `attrs.${key}`;
    applyPatchToSelection(toPatch(path, val), 'add-prop');
    renderProperties();
  };
  const cancel = () => { renderProperties(); };

  confirmBtn.addEventListener('click', confirm);
  cancelBtn.addEventListener('click', cancel);
  row.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); confirm(); }
    if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
  });
  keyInput.focus();
}

function normalizeZOrder(){
  const page = getCurrentPage();
  const sorted = [...page.elements].sort((a,b) => (a.z ?? 0) - (b.z ?? 0));
  sorted.forEach((el, i) => el.z = (i + 1) * 10);
}
function sendSelectionToFront(){
  normalizeZOrder(); const page = getCurrentPage();
  const maxZ = Math.max(...page.elements.map(e => e.z ?? 0), 0);
  [...selectedIds].forEach(id => { const m = getElementById(id); if (m) m.z = maxZ + 10; });
  normalizeZOrder(); renderPage(page); updateSelectionUI();
}
function sendSelectionToBack(){
  normalizeZOrder(); const page = getCurrentPage();
  const minZ = Math.min(...page.elements.map(e => e.z ?? 0), 10);
  [...selectedIds].forEach(id => { const m = getElementById(id); if (m) m.z = minZ - 10; });
  normalizeZOrder(); renderPage(page); updateSelectionUI();
}
function bringSelectionForward(){
  normalizeZOrder(); const page = getCurrentPage();
  [...selectedIds].forEach(id => { const m = getElementById(id); if (m) m.z += 15; });
  normalizeZOrder(); renderPage(page); updateSelectionUI();
}
function sendSelectionBackward(){
  normalizeZOrder(); const page = getCurrentPage();
  [...selectedIds].forEach(id => { const m = getElementById(id); if (m) m.z -= 15; });
  normalizeZOrder(); renderPage(page); updateSelectionUI();
}

/* ===== PDF Export Utilities ===== */
//onclick of the export pdf button, export the page to pdf
document.getElementById('savePdfBtn').addEventListener('click', () => ExportService.exportDocumentToPdf());



// Dynamically ensure required libs are available without changing app logic
async function loadExternalScript(src){
  return new Promise((resolve, reject) => {
    // Deduplicate loads
    let existing = document.querySelector(`script[data-dynamic-src="${src}"]`);
    if (existing){
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load: '+src)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.referrerPolicy = 'no-referrer';
    s.dataset.dynamicSrc = src;
    s.addEventListener('load', () => { s.dataset.loaded = 'true'; resolve(); });
    s.addEventListener('error', () => reject(new Error('Failed to load: '+src)));
    document.head.appendChild(s);
  });
}

// Export implementation moved to export.service.js

function serializeDocument(){
  const payload = {
    schema: (typeof SCHEMA_VERSION === 'number' ? SCHEMA_VERSION : 1),
    app: (typeof APP_VERSION === 'string' ? APP_VERSION : ''),
    document: Model.document
  };
  return JSON.stringify(payload);
}
function normalizeDocument(doc){
  const out = (doc && typeof doc === 'object') ? doc : { pages: [], currentPageId:'', nextElementId:1, editMode:false };
  if (!Array.isArray(out.pages)) out.pages = [];
  if (typeof out.currentPageId !== 'string') out.currentPageId = out.pages[0]?.id || '';
  if (typeof out.nextElementId !== 'number') out.nextElementId = 1;
  if (typeof out.editMode !== 'boolean') out.editMode = false;
  return out;
}
function migrateDocument(doc, fromVersion){
  let d = normalizeDocument(doc);
  const to = (typeof SCHEMA_VERSION === 'number' ? SCHEMA_VERSION : 1);
  // For now schemas are identical. Place future migrations here.
  if (fromVersion === to) return d;
  // Example: if (fromVersion === 0) { /* mutate d to new shape */ }
  return d;
}
function deserializeDocument(json){
  const parsed = JSON.parse(json);
  // Back-compat: older saves stored raw document object
  if (parsed && Array.isArray(parsed.pages)) {
    Model.document = normalizeDocument(parsed);
    return;
  }
  // New format wrapper
  if (parsed && parsed.document) {
    const fromSchema = Number(parsed.schema || 1);
    const doc = migrateDocument(parsed.document, fromSchema);
    Model.document = normalizeDocument(doc);
    return;
  }
  // Fallback: keep existing in-memory document
}
function download(filename, content, type='text/html'){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

// Save button UI feedback
function getSaveBtn(){ return document.getElementById('saveBtn'); }
function indicateSaving(){
  const btn = getSaveBtn();
  if (!btn) return;
  btn.classList.remove('saved');
  btn.classList.add('saving');
  if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent || 'Save';
  btn.textContent = 'Saving…';
}
function indicateSaved(){
  const btn = getSaveBtn();
  if (!btn) return;
  btn.classList.remove('saving');
  btn.classList.add('saved');
  btn.textContent = 'Saved';
  if (btn._saveResetTimer) clearTimeout(btn._saveResetTimer);
  btn._saveResetTimer = setTimeout(() => {
    btn.classList.remove('saved');
    btn.textContent = btn.dataset.originalText || 'Save';
  }, 2000);
}

// ---------------- OPFS (Origin Private File System) helpers ----------------
// Scope autosave per file by deriving a stable key from the current path
function getFileScopeId(){
  try {
    const path = (window && window.location && window.location.pathname) ? window.location.pathname : '';
    const key = path.replace(/[^a-z0-9\-_.]/gi, '_').toLowerCase();
    return key || 'index';
  } catch (_) {
    return 'index';
  }
}
function getOpfsAutosaveName(){
  return `autosave-${getFileScopeId()}.json`;
}
function supportsOPFS(){
  return typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory;
}
async function opfsGetRoot(){
  return await navigator.storage.getDirectory();
}
async function opfsWriteFile(filename, text){
  const root = await opfsGetRoot();
  const fh = await root.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}
async function opfsReadTextIfExists(filename){
  try {
    const root = await opfsGetRoot();
    const fh = await root.getFileHandle(filename, { create: false });
    const file = await fh.getFile();
    return await file.text();
  } catch (_) {
    return null;
  }
}

// LocalStorage fallback for silent autosave when OPFS isn't available
function localAutosaveKey(){
  return `certificateMaker:autosave:v1:${getFileScopeId()}`;
}
function localSaveDocument(){
  try {
    const json = serializeDocument();
    localStorage.setItem(localAutosaveKey(), json);
    return true;
  } catch (_) { return false; }
}
function localLoadDocument(){
  try {
    const json = localStorage.getItem(localAutosaveKey());
    return json || null;
  } catch (_) { return null; }
}

// File System Access API helpers for silent saves after initial user selection
let currentFileHandle = null;
function supportsFileSystemAccess(){
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}
function buildSaveHtml(){
  const documentData = serializeDocument();
  const currentHtml = document.documentElement.outerHTML;
  return currentHtml.replace(
    '<body>',
    `<body>\n  <pre id="__doc__" style="display:none">${documentData}</pre>`
  );
}
async function verifyPermission(fileHandle, withWrite){
  const opts = {};
  if (withWrite) opts.mode = 'readwrite';
  if ((await fileHandle.queryPermission(opts)) === 'granted') return true;
  if ((await fileHandle.requestPermission(opts)) === 'granted') return true;
  return false;
}
async function writeFile(handle, content){
  const ok = await verifyPermission(handle, true);
  if (!ok) throw new Error('Permission denied');
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}


async function saveDocument(){
  indicateSaving();
  try {
    const res = await Persistence.saveDocument();
    if (res && res.ok) { indicateSaved(); return; }
  } catch {}
}

function getCurrentFilename(){
  // Extract filename from the current URL
  const path = window.location.pathname;
  const filename = path.split('/').pop();
  
  // Return filename if it's an HTML file, otherwise null
  if (filename && filename.toLowerCase().endsWith('.html')) {
    return filename;
  }
  
  return null;
}

async function saveDocumentAs(){
  indicateSaving();
  try {
    const res = await Persistence.saveDocumentAs();
    if (res && res.ok) { indicateSaved(); return; }
  } catch {}
}


/* ----------------------- Init & Events ----------------------- */
async function bootstrap(){
  // Use persistence facade to load
  let loaded = false;
  try { const res = await Persistence.tryAutoLoad(); loaded = !!(res && res.ok); } catch {}

  // If nothing loaded, create an initial document
  if (!loaded){
    Model.document.pages = [createPage('Page 1')];
    Model.document.currentPageId = Model.document.pages[0].id;
  }
  // Apply initial mode before rendering to avoid flicker
  setEditMode(!!Model.document.editMode);
  renderAll();

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
        const pt = getCanvasPoint(e, page);
        Model.document.currentPageId = pageId;
        pendingAddType = type;
        placePendingAt(pt.x, pt.y, pageId);
        __addingByDrag = true;
      } else {
        const info = getMostVisiblePageInfo(); if (!info) return;
        e.preventDefault();
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

  // Document header/footer inputs
  const docHeaderInput = document.getElementById('docHeaderHeight');
  const docFooterInput = document.getElementById('docFooterHeight');
  if (docHeaderInput) docHeaderInput.value = String(Model?.document?.headerHeight || 0);
  if (docFooterInput) docFooterInput.value = String(Model?.document?.footerHeight || 0);
  function onHFChange(){
    const h = Number(docHeaderInput?.value || 0);
    const f = Number(docFooterInput?.value || 0);
    setHeaderFooterHeights({ header: h, footer: f });
  }
  docHeaderInput?.addEventListener('change', onHFChange);
  docFooterInput?.addEventListener('change', onHFChange);

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
        const m = getElementById(id);
        updateElement(id, { content: m?.content || '' });
      } else {
        updateElement(id, { content: text });
      }
      
      // Re-render to show placeholder if content is empty
      if (!text) {
        renderPage(getCurrentPage());
      }
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

  // keyboard shortcuts for copy/paste (element-level)
  // IMPORTANT: if a table selection exists, DO NOT intercept here.
  // Let native copy/paste events handle spreadsheet-style data.
  document.addEventListener('keydown', (e) => {
    const isEditing = document.activeElement && (
      document.activeElement.contentEditable === 'true' ||
      document.activeElement.contentEditable === 'plaintext-only' ||
      document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagName === 'TEXTAREA'
    );
    if (isEditing) return;

    // If a table selection is active, allow default so our 'copy'/'paste' listeners run.
    if (tableSel && (e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v')) {
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedIds.size > 0) {
      e.preventDefault();
      copyToClipboard();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      pasteFromClipboard();
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
    const blockDown = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('pointerdown', blockDown, true);
    document.addEventListener('mousedown', blockDown, true);
    const onMove = (ev) => {
      const cell = ev.target.closest('.table-cell');
      const el = cell || ev.target.closest('.page .element');
      if (last === el) return; if (last) last.style.outline = ''; last = el; if (last) last.style.outline = '2px solid var(--primary)';
    };
    const done = () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', blockDown, true);
      document.removeEventListener('mousedown', blockDown, true);
      if (last) last.style.outline = '';
      window.__PICKING = false; document.body.classList.remove('app-noselect');
      if (Array.isArray(prevSelIds) && prevSelIds.length && typeof setSelection === 'function') setSelection(prevSelIds);
      try { host._pickerDoneRef = null; } catch {}
    };
    const onKey = (ke) => { if (ke.key === 'Escape'){ ke.preventDefault(); done(); } };
    const onClick = (ev) => {
      const cell = ev.target.closest('.table-cell');
      const el = cell || ev.target.closest('.page .element');
      if (!el) { done(); return; }
      ev.preventDefault(); ev.stopPropagation();
      let token = '';
      if (cell){ const cid = cell.getAttribute('data-id'); if (cid) token = `"#${cid}"`; }
      else { const id = el.getAttribute('data-id'); if (id) token = `"#${id}"`; }
      // Insert token at end (no extra spaces; quotes make it distinct)
      host.textContent = String(host.textContent || '') + token;
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
  saveAsBtn().addEventListener('click', saveDocumentAs);
  const pngBtn = document.getElementById('exportPngBtn');
  const jpgBtn = document.getElementById('exportJpgBtn');
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

  // Element context menu (right-click)
  (function bindElementContextMenu(){
    const menu = document.getElementById('elementMenu'); if (!menu) return;
    document.addEventListener('contextmenu', (e) => {
      const el = e.target.closest?.('.element');
      if (!el) return; // let default elsewhere
      e.preventDefault();
      const id = el.dataset.id;
      if (!selectedIds.has(id)) setSelection([id]);
      menu.style.left = e.clientX+'px'; menu.style.top = e.clientY+'px';
      menu.classList.remove('hidden');
    });
    document.addEventListener('click', (e)=>{ if (!menu.contains(e.target)) menu.classList.add('hidden'); });
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') menu.classList.add('hidden'); });
    menu.addEventListener('click', (e)=>{
      const b = e.target.closest('[data-em]'); if (!b) return; const act = b.dataset.em;
      if (act === 'duplicate') { copySelection(); }
      else if (act === 'delete') { deleteSelection(); }
      else if (act === 'group') { groupSelection(); }
      else if (act === 'ungroup') { ungroupSelection(); }
      else if (act === 'z-front') { sendSelectionToFront(); }
      else if (act === 'z-back') { sendSelectionToBack(); }
      else if (act === 'align-left') { alignSelection('left'); }
      else if (act === 'align-center') { alignSelection('center'); }
      else if (act === 'align-right') { alignSelection('right'); }
      else if (act === 'align-top') { alignSelection('top'); }
      else if (act === 'align-middle') { alignSelection('middle'); }
      else if (act === 'align-bottom') { alignSelection('bottom'); }
      else if (act === 'distribute-h') { distributeSelection('h'); }
      else if (act === 'distribute-v') { distributeSelection('v'); }
      menu.classList.add('hidden');
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
    // Delete selection via keyboard when not typing in inputs
    if (e.key === 'Delete' || e.key === 'Backspace'){
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
    startSelectionResize(h.dataset.handle, e);
    const onMove = (ev) => { applySelectionResize(ev); };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (resizeSelectionState){ commitHistory('resize-multi'); resizeSelectionState = null; hideGuides(); updateSelectionBox(); }
      if (rotateSelectionState){ rotateSelectionState = null; hideGuides(); updateSelectionBox(); }
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
  picker.innerHTML = `
    <div class="color-picker-section">
      <h4>Recent Colors</h4>
      <div class="color-history-grid" id="colorHistoryGrid"></div>
    </div>
    <div class="color-picker-section">
      <h4>Custom Color</h4>
      <div class="color-picker-input-wrapper">
        <input type="color" id="customColorInput" value="#000000">
        <input type="text" class="color-picker-hex" id="colorHexInput" placeholder="#000000">
      </div>
    </div>
  `;
  
  document.body.appendChild(picker);
  // Prevent interactions inside the picker from closing toolbars or clearing selection
  // Use capture for down events to avoid outside handlers; use bubble for click so inner
  // click handlers (e.g., recent color chips) still fire correctly.
  ['pointerdown','mousedown'].forEach((evt) => {
    picker.addEventListener(evt, (e) => { e.stopPropagation(); }, true);
  });
  picker.addEventListener('click', (e) => { e.stopPropagation(); });
  return picker;
}

function updateCustomColorPickerHistory() {
  const grid = document.getElementById('colorHistoryGrid');
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
      // When picking a recent color, also sync the custom color input UI
      const colorInput = document.getElementById('customColorInput');
      const hexInput = document.getElementById('colorHexInput');
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
    const colorInput = document.getElementById('customColorInput');
    const hexInput = document.getElementById('colorHexInput');
    
    colorInput.addEventListener('input', () => {
      hexInput.value = colorInput.value;
      // Update the original input value without closing the picker
      updateColorWithoutClosing(colorInput.value);
    });
    
    colorInput.addEventListener('change', () => {
      // Add to history and close picker on final selection
      selectColor(colorInput.value);
    });
    
    hexInput.addEventListener('input', () => {
      const color = hexInput.value;
      if (/^#[0-9A-F]{6}$/i.test(color)) {
        colorInput.value = color;
        updateColorWithoutClosing(color);
      }
    });
    
    hexInput.addEventListener('change', () => {
      const color = hexInput.value;
      if (/^#[0-9A-F]{6}$/i.test(color)) {
        selectColor(color);
      }
    });
  }
  
  // Update history display
  updateCustomColorPickerHistory();
  
  // Set current color in the picker
  const colorInput = document.getElementById('customColorInput');
  const hexInput = document.getElementById('colorHexInput');
  colorInput.value = input.value;
  hexInput.value = input.value;
  
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
  // Prevent default color picker on click, show custom picker instead
  document.addEventListener('click', (e) => {
    const colorInput = e.target.closest('input[type="color"]');
    
    // Check if this is the custom color input inside our picker
    if (colorInput && colorInput.id === 'customColorInput') {
      // Allow the custom color input to work normally
      return;
    }
    
    if (colorInput) {
      e.preventDefault();
      e.stopPropagation();
      
      const rect = colorInput.getBoundingClientRect();
      showCustomColorPicker(
        colorInput, 
        rect.left, 
        rect.bottom + 5
      );
    } else if (customColorPicker && !customColorPicker.contains(e.target)) {
      hideCustomColorPicker();
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && customColorPicker && !customColorPicker.classList.contains('hidden')) {
      hideCustomColorPicker();
    }
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
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrap();
  initializePanelControls();
  initializeCustomColorPicker();
  // Initialize panel toggle arrow orientation
  const elT = document.getElementById('elementsToggle');
  const prT = document.getElementById('propertiesToggle');
  if (elT) elT.setAttribute('data-dir', document.getElementById('elementsPanel')?.classList.contains('collapsed') ? 'left' : 'right');
  if (prT) prT.setAttribute('data-dir', document.getElementById('propertiesPanel')?.classList.contains('collapsed') ? 'right' : 'left');
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = APP_VERSION;
});




