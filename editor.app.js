// editor.app.js
// Extracted from script.js on 2025-08-20T18:47:33.901424Z
// Range: [53602:132968] bytes

/* ----------------------- Rendering ----------------------- */
function renderAll() {
  renderPagesList();
  clearSelection();
}

function getPageNode(id = Model.document.currentPageId) {
  return document.querySelector(`.page-wrapper[data-page-id="${id}"] .page`);
}

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
        <button class="btn mini" data-act="move-up" title="Move up">▲</button>
        <button class="btn mini" data-act="move-down" title="Move down">▼</button>
        <button class="btn mini" data-act="toggle-visibility" title="Show/Hide">👁</button>
        <button class="btn mini" data-act="duplicate" title="Duplicate">⎘</button>
        <button class="btn mini" data-act="delete" title="Delete">🗑</button>
        <button class="btn mini" data-act="add-below" title="Add page below">＋</button>
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
  });
}

function ensureElementNode(elModel) {
  const pageNode = getPageNode(elModel.pageId || Model.document.currentPageId);
  let node = pageNode.querySelector(`[data-id="${elModel.id}"]`);
  if (!node) {
    node = document.createElement('div');
    node.className = `element ${elModel.type}`;
    node.dataset.id = elModel.id;
    pageNode.appendChild(node);
    // Resizable via hit-testing on edges/corners
    node.addEventListener('mousemove', (e) => updateResizeCursor(e, node));
    node.addEventListener('mouseleave', () => { node.style.cursor = ''; });
  }
  return node;
}

function applyElementStyles(node, m) {
  node.style.left = m.x + 'px';
  node.style.top = m.y + 'px';
  if (m.type !== 'line') {
    // Enforce table's intrinsic min size so selection box can't shrink below content
    if (m.type === 'table'){
      const minW = (m.colWidths || []).reduce((a,b)=>a+b, 0) || 0;
      const minH = (m.rowHeights || []).reduce((a,b)=>a+b, 0) || 0;
      m.w = Math.max(m.w || 0, minW);
      m.h = Math.max(m.h || 0, minH);
    }
    node.style.width = (m.w || 0) + 'px';
    node.style.height = (m.h || 0) + 'px';
    node.style.borderRadius = (m.styles.radius || 0) + 'px';
    // Don't apply background color to image elements to avoid covering the picture
    if (m.type !== 'image') {
      node.style.background = m.styles.fill || 'transparent';
    }
    node.style.border = `${m.styles.strokeWidth || 0}px solid ${m.styles.strokeColor || 'transparent'}`;
    node.style.color = m.styles.textColor || '#111827';
    node.style.fontFamily = m.styles.fontFamily || 'system-ui';
    node.style.fontSize = (m.styles.fontSize || 14) + 'pt';
    node.style.fontWeight = m.styles.bold ? '700' : '400';
    node.style.fontStyle = m.styles.italic ? 'italic' : 'normal';
    node.style.textDecoration = m.styles.underline ? 'underline' : 'none';
    const rot = Number(m.styles.rotate || 0);
    node.style.transformOrigin = '50% 50%';
    node.style.transform = rot ? `rotate(${rot}deg)` : '';
    if (m.type === 'text' || m.type === 'field'){
      node.style.display = 'flex';
      node.style.flexDirection = 'column';
      const h = m.styles.textAlignH || 'left';
      const v = m.styles.textAlignV || 'top';
      node.style.alignItems = h === 'left' ? 'flex-start' : (h === 'center' ? 'center' : 'flex-end');
      node.style.justifyContent = v === 'top' ? 'flex-start' : (v === 'middle' ? 'center' : 'flex-end');
    }
    if (m.type === 'text' || m.type === 'field') {
      if (m.content) {
        node.textContent = m.content;
        node.classList.remove('has-placeholder');
      } else {
        const placeholder = m.type === 'text' ? 'Text' : 'Field';
        node.textContent = placeholder;
        node.classList.add('has-placeholder');
      }
    }
  } else {
    // line: use rotated div like before
    const dx = (m.x2 ?? m.x) - m.x; const dy = (m.y2 ?? m.y) - m.y;
    const len = Math.hypot(dx, dy) || 1;
    const angleRad = Math.atan2(dy, dx);
    node.style.left = m.x + 'px';
    node.style.top = m.y + 'px';
    node.style.width = len + 'px';
    node.style.height = (m.styles.strokeWidth || 2) + 'px';
    node.style.background = m.styles.strokeColor || '#111827';
    node.style.transformOrigin = '0 0';
    node.style.transform = `rotate(${angleRad}rad)`;
  }
  node.style.zIndex = String(m.z || 1);
  if (m.type === 'text' || m.type === 'field') {
    if (!node.hasAttribute('contenteditable')) node.setAttribute('contenteditable', 'false');
  }
}

function renderPage(page) {
  const container = getPageNode(page.id);
  if (!container) return;
  // remove old elements except guides
  Array.from(container.querySelectorAll('.element')).forEach(n => n.remove());
  if (!page) return;
  page.elements.forEach(elm => {
    const node = ensureElementNode({ ...elm, pageId: page.id });
    applyElementStyles(node, elm);
    // Special rendering for image element
    if (elm.type === 'image') {
      if (!node.querySelector('img')) {
        const img = document.createElement('img');
        img.alt = '';
        // Remove inline styles - let CSS handle the styling
        node.appendChild(img);
        node.addEventListener('dblclick', async () => {
          if (!Model.document.editMode) return; // pick only in edit mode
          const input = document.createElement('input');
          input.type = 'file'; input.accept = 'image/*';
          input.onchange = () => {
            const file = input.files?.[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = () => { 
              const src = String(reader.result || '');
              img.src = src;
              // Store image source in the element model
              updateElement(elm.id, { src: src });
            };
            reader.readAsDataURL(file);
          };
          input.click();
        });
      }
      // Set image source from the model if it exists
      const img = node.querySelector('img');
      if (img && elm.src) {
        img.src = elm.src;
      }
    } else if (elm.type === 'table') {
      renderTable(elm, node);
    }
    container.appendChild(node);
  });
  updateSelectionBox();
}

/* ----------------------- Updates ----------------------- */
function updateElement(id, patch) {
  const page = getCurrentPage();
  const idx = page.elements.findIndex(e => e.id === id);
  if (idx === -1) return;
  commitHistory('update-element');
  // Preserve table cell selection if we're updating the same table
  const prevTableSel = (tableSel && tableSel.tableId === id) ? { ...tableSel } : null;
  const merged = Object.assign({}, page.elements[idx], deepMerge(page.elements[idx], patch));
  page.elements[idx] = merged;
  renderPage(page);
  
  if (prevTableSel) {
    // Re-apply table cell selection after re-render (don't change element selection)
    setTableSelection(prevTableSel.tableId, prevTableSel.r0, prevTableSel.c0, prevTableSel.r1, prevTableSel.c1);
  } else {
    // Only set element selection if we're not preserving table selection
    setSelection([id]);
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
  if (m.type === 'text' || m.type === 'field'){
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
function deepMerge(target, patch){
  const out = deepClone(target);
  Object.keys(patch).forEach(k => {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])) {
      out[k] = deepMerge(out[k] || {}, patch[k]);
    } else {
      out[k] = patch[k];
    }
  });
  return out;
}

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
  const page = Model.document.pages.find(p => p.id === pageId) || getCurrentPage();
  page.elements.push(base);
  Model.document.currentPageId = page.id;
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

let drag = null; // {id, start:{x,y}, orig:{...}}
let resize = null; // {id, start:{x,y}, orig:{...}, mode:'n|s|e|w|ne|nw|se|sw'}
let snapState = { x: null, y: null }; // sticky snapping memory
let dragSelection = null; // { startBounds, starts: Map }
let resizeSelectionState = null; // { handle, startBounds, starts: Map }
let rotateSelectionState = null; // { startBounds, center:{x,y}, startAngle, starts: Map(id->startRotate) }

function onMouseDown(e){
  // Prevent moving/resizing when edit mode is off, but allow clicking/selection
  if (!Model.document.editMode) return;
  const target = e.target.closest('.element');
  if (target && target.isContentEditable) return; // don't start drag when editing text
  const pt = getCanvasPoint(e);
  if (pendingAddType){ placePendingAt(pt.x, pt.y); return; }
  if (target){
    const id = target.dataset.id;
    const page = getCurrentPage();
    const model = page.elements.find(el => el.id === id);
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
      } else {
        // snapshot before move starts for undo
        commitHistory('move');
        drag = { id, start: pt, orig: deepClone(model) };
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
  if (!drag && !resize && !dragSelection && !resizeSelectionState && !rotateSelectionState) return;
  const pt = getCanvasPoint(e);
  const page = getCurrentPage();
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
    const snapped = snapSelectionBounds(tentative, [...selectedIds]);
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
    const snappedBounds = snapSelectionBounds(tentativeBounds, [active.id]);
    const snapDx = snappedBounds.x - tentativeBounds.x;
    const snapDy = snappedBounds.y - tentativeBounds.y;
    if (m.type === 'line' && typeof m.x2 === 'number'){
      m.x += snapDx; m.y += snapDy; m.x2 += snapDx; m.y2 += snapDy;
    } else { m.x += snapDx; m.y += snapDy; }
    showGuidesForBounds(snappedBounds, getPageNode());
  } else {
    if (m.type === 'line') { m.x += dx; m.y += dy; m.x2 += dx; m.y2 += dy; } else { m.x += dx; m.y += dy; }
    // snap and show guides for single element
    const tentative = getBoundsForModel(m);
    const snapped = snapSelectionBounds(tentative, [active.id]);
    const snapDx = snapped.x - tentative.x; const snapDy = snapped.y - tentative.y;
    if (m.type === 'line' && typeof m.x2 === 'number'){
      m.x += snapDx; m.y += snapDy; m.x2 += snapDx; m.y2 += snapDy;
    } else { m.x += snapDx; m.y += snapDy; }
    showGuidesForBounds(snapped, getPageNode());
  }
  page.elements[idx] = m;
  applyElementStyles(document.querySelector(`.page [data-id="${active.id}"]`), m);
  updateFormatToolbarVisibility(); positionElementActions(); updateSelectionBox();
}

function onMouseUp(){
  // History was already captured at gesture start
  if (drag){ drag = null; }
  if (resize){ resize = null; }
  if (dragSelection){ dragSelection = null; }
  if (rotateSelectionState){ rotateSelectionState = null; }
  // hide guides and reshow actions
  hideGuides();
  positionElementActions();
  snapState = { x: null, y: null };
  updateSelectionBox();
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
  const snappedBounds = snapSelectionBounds(tentativeBounds, [...selectedIds]);
  
  // Use the snapped bounds
  nx = snappedBounds.x;
  ny = snappedBounds.y;
  nw = snappedBounds.w;
  nh = snappedBounds.h;
  
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
const SNAP_THRESHOLD = 8; const STICKY_RANGE = 6;
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
function snapSelectionBounds(b, excludeIds = []){
  const { v, h } = getGuidesForCurrentPage(excludeIds);
  const left=b.x, cx=b.x+b.w/2, right=b.x+b.w; const top=b.y, cy=b.y+b.h/2, bottom=b.y+b.h;
  const nx = findNearest(v, [left,cx,right], SNAP_THRESHOLD); const ny = findNearest(h, [top,cy,bottom], SNAP_THRESHOLD);
  let outX = b.x, outY = b.y;
  if (nx || (snapState.x!=null && Math.min(Math.abs(left-snapState.x),Math.abs(cx-snapState.x),Math.abs(right-snapState.x))<=STICKY_RANGE)){
    const [c,which] = nx || [snapState.x,1]; outX = which===0? c : (which===1? c - b.w/2 : c - b.w); snapState.x = c;
  }
  if (ny || (snapState.y!=null && Math.min(Math.abs(top-snapState.y),Math.abs(cy-snapState.y),Math.abs(bottom-snapState.y))<=STICKY_RANGE)){
    const [c,which] = ny || [snapState.y,1]; outY = which===0? c : (which===1? c - b.h/2 : c - b.h); snapState.y = c;
  }
  return { x: outX, y: outY, w: b.w, h: b.h };
}
function showGuidesForBounds(b, pageNode){
  const { v, h } = getGuidesNodes(pageNode); if (!v || !h) return;
  v.style.left = (snapState.x!=null? snapState.x : b.x + b.w/2) + 'px'; v.style.top = '0px'; v.style.height = pageNode.clientHeight + 'px';
  h.style.left = '0px'; h.style.top = (snapState.y!=null? snapState.y : b.y + b.h/2) + 'px'; h.style.width = pageNode.clientWidth + 'px';
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
function getElementById(id){
  const page = getCurrentPage();
  return page.elements.find(e => e.id === id);
}

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
    const pressed = selectedIds.size === 1 && (t === 'text' || t === 'field');
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

function renderProperties(){
  const box = propertiesContent();
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
  const rows = [
    ['id', m?.id || 'multi'], ['type', m?.type || 'multi'], ['groupId', groupId || ''], ['x', m?.x], ['y', m?.y], ['w', m?.w], ['h', m?.h], ['z', m?.z]
  ];
  if (cellId) rows.unshift(['cellId', cellId]);
  
  // Add style properties for text and field elements
  if (m && (m.type === 'text' || m.type === 'field')) {
    rows.push(
      ['textColor', m.styles?.textColor || '#111827'],
      ['fontFamily', m.styles?.fontFamily || 'system-ui'],
      ['fontSize', m.styles?.fontSize || 14],
      ['bold', m.styles?.bold || false],
      ['italic', m.styles?.italic || false]
    );
  }
  
  rows.forEach(([k,v]) => {
    const div = document.createElement('div');
    div.className = 'row';
    
    // Special handling for different input types
    if (k === 'fontSize') {
      div.innerHTML = `<label>${k}<select data-prop="styles.${k}" style="width:90px">
        <option value="8">8</option>
        <option value="9">9</option>
        <option value="10">10</option>
        <option value="11">11</option>
        <option value="12">12</option>
        <option value="14">14</option>
        <option value="16">16</option>
        <option value="18">18</option>
        <option value="20">20</option>
        <option value="24">24</option>
        <option value="28">28</option>
        <option value="32">32</option>
        <option value="36">36</option>
        <option value="48">48</option>
        <option value="72">72</option>
      </select></label>`;
      // Set the selected value
      const select = div.querySelector('select');
      select.value = v;
    } else if (k === 'fontFamily') {
      div.innerHTML = `<label>${k}<select data-prop="styles.${k}" style="width:90px">
        <option value="system-ui">System</option>
        <option value="Arial">Arial</option>
        <option value="Helvetica Neue">Helvetica</option>
        <option value="Times New Roman">Times</option>
        <option value="Georgia">Georgia</option>
        <option value="Courier New">Courier</option>
      </select></label>`;
      const select = div.querySelector('select');
      select.value = v;
    } else if (k === 'textColor') {
      div.innerHTML = `<label>${k}<input type="color" data-prop="styles.${k}" value="${v}" style="width:90px"></label>`;
    } else if (k === 'bold' || k === 'italic') {
      div.innerHTML = `<label>${k}<input type="checkbox" data-prop="styles.${k}" ${v ? 'checked' : ''}></label>`;
    } else if (k.startsWith('styles.')) {
      div.innerHTML = `<label>${k}<input data-prop="${k}" value="${v ?? ''}" style="width:90px"></label>`;
    } else {
      div.innerHTML = `<label>${k}<input data-prop="${k}" value="${v ?? ''}" style="width:90px"></label>`;
    }
    box.appendChild(div);
  });
  box.addEventListener('input', onPropsInput, { once: true });
  box.addEventListener('change', onPropsInput, { once: true });
}
function onPropsInput(e){
  const t = e.target; if (!t.matches('[data-prop]')) return;
  const key = t.dataset.prop; 
  let val;
  if (t.type === 'checkbox') {
    val = t.checked;
  } else {
    val = Number.isNaN(Number(t.value)) ? t.value : Number(t.value);
  }
  applyPatchToSelection(toPatch(key, val));
  propertiesContent().addEventListener('input', onPropsInput, { once: true });
  propertiesContent().addEventListener('change', onPropsInput, { once: true });
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
document.getElementById('savePdfBtn').addEventListener('click', exportPdf);



async function exportPdf({ filename = 'myfile.pdf', dpi = 220, orientation = 'portrait' } = {}) {
  const page = document.querySelector('.page'); // <- should be the paper itself
  if (!page) return;

  // Save and normalize current zoom so export always uses real dimensions
  const originalZoom = typeof getZoom === 'function' ? getZoom() : 1;
  if (typeof setZoomScale === 'function') setZoomScale(1);

  // Temporarily remove visual effects that extend outside the page box
  const prevShadow = page.style.boxShadow;
  const prevRadius = page.style.borderRadius;
  page.style.boxShadow = 'none';
  page.style.borderRadius = '0';

  // Prefer layout dimensions to avoid viewport rounding drift
  const widthPx = page.offsetWidth;
  const heightPx = page.offsetHeight;
  // Prefer integer render scales to reduce sub-pixel rounding artifacts
  const scale = Math.max(1, Math.round(dpi / 96));

  // Ensure web fonts are fully loaded to avoid reflow during capture
  try { if (document.fonts && document.fonts.ready) { await document.fonts.ready; } } catch {}

  // Neutralize viewport scroll so the capture isn't shifted
  const canvasScrollX = -window.scrollX || -7;///keeep the -7!!!
  const canvasScrollY = -window.scrollY || 0;

  const opt = {
    margin: 0,
    filename,
    image: { type: 'jpeg', quality: 0.75 },
    // html2canvas scale determines print DPI (96 CSS px = 1")
    html2canvas: { scale, useCORS: true, backgroundColor: '#ffffff', scrollX: canvasScrollX, scrollY: canvasScrollY },
    // Match PDF page size to the live DOM size in pixels for 1:1 layout
    jsPDF: { unit: 'px', format: [widthPx, heightPx], orientation, compress: true },
    pagebreak: { mode: ['avoid-all'] } // keep single page if heights match
  };

  return html2pdf().set(opt).from(page).save().finally(() => {
    // Restore zoom and page visuals after export
    page.style.boxShadow = prevShadow;
    page.style.borderRadius = prevRadius;
    if (typeof setZoomScale === 'function') setZoomScale(originalZoom);
  });
}

/* -------------------End of PDF Export Utilities ------------------- */

function serializeDocument(){
  return JSON.stringify(Model.document);
}
function deserializeDocument(json){
  Model.document = JSON.parse(json);
}
function download(filename, content, type='text/html'){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
}


function saveDocument(){
  // Save function - reads filename from URL and overwrites that file
  const currentFilename = getCurrentFilename();
  
  if (currentFilename) {
    // Use the current file's name
    const documentData = serializeDocument();
    const currentHtml = document.documentElement.outerHTML;
    const saveHtml = currentHtml.replace(
      '<body>',
      `<body>\n  <pre id="__doc__" style="display:none">${documentData}</pre>`
    );
    download(currentFilename, saveHtml, 'text/html');
  } else {
    // No filename detected, act like Save As
    saveDocumentAs();
  }
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

function saveDocumentAs(){
  // Save As function - uses browser's file dialog
  const defaultName = `certificate-maker-${new Date().toISOString().slice(0,19).replace(/[:.]/g,'-')}.html`;
  
  const documentData = serializeDocument();
  const currentHtml = document.documentElement.outerHTML;
  const saveHtml = currentHtml.replace(
    '<body>',
    `<body>\n  <pre id="__doc__" style="display:none">${documentData}</pre>`
  );
  
  // Use browser's file dialog
  download(defaultName, saveHtml, 'text/html');
}


/* ----------------------- Init & Events ----------------------- */
function bootstrap(){
  // Load from embedded data if present
  const saved = document.getElementById('__doc__');
  if (saved && saved.textContent) {
    try { deserializeDocument(saved.textContent.replaceAll('&lt;','<')); } catch {}
  } else {
    // initial document with one page
    Model.document.pages = [createPage('Page 1')];
    Model.document.currentPageId = Model.document.pages[0].id;
  }
  renderAll();

  // elements panel
  elementsPanel().addEventListener('click', (e) => {
    const btn = e.target.closest('.add-el');
    if (!btn) return;
    armAdd(btn.dataset.add);
  });

  // canvas interactions: delegate to clicked page; support add-to-clicked-page
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
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('resize', () => { updateFormatToolbarVisibility(); alignOverlays(); });
  window.addEventListener('scroll', () => { alignOverlays(); }, true);

  // text/field editing (field editable even when edit mode is off)
  pagesList().addEventListener('dblclick', (e) => {
    const active = getPageNode();
    if (!active || !active.contains(e.target)) return;

    const elNode = e.target.closest('.element.text, .element.field');
    if (!elNode) return;

    // Only block editing when it's a text element AND edit mode is off
    if (elNode.classList.contains('text') && !Model.document.editMode) return;

    const id = elNode.dataset.id;
    setSelection([id]);

    // If element has placeholder, clear it when starting to edit
    if (elNode.classList.contains('has-placeholder')) {
      elNode.textContent = '';
      elNode.classList.remove('has-placeholder');
    }

    elNode.setAttribute('contenteditable', 'true');
    elNode.classList.add('editing');
    elNode.focus();

    const onBlur = () => {
      elNode.removeEventListener('blur', onBlur);
      elNode.setAttribute('contenteditable', 'false');
      elNode.classList.remove('editing');
      const content = elNode.textContent.trim();
      updateElement(id, { content: content });
      
      // Re-render to show placeholder if content is empty
      if (!content) {
        renderPage(getCurrentPage());
      }
    };
    elNode.addEventListener('blur', onBlur);
  });

  // edit mode
  editToggle().addEventListener('change', () => setEditMode(editToggle().checked));

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

  // save and export
  saveBtn().addEventListener('click', saveDocument);
  saveAsBtn().addEventListener('click', saveDocumentAs);
  
  // floating toolbar wiring
  bindFloatingToolbar();

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
    const btn = e.target.closest('[data-action],[data-z],[data-group],[data-group-toggle]'); if (!btn) return;
    if (btn.hasAttribute('data-group-toggle')) { toggleGroupSelection(); updateGroupToggleButton(); return; }
    if (selectedIds.size===0) return;
    if (btn.dataset.action === 'copy') {
      copySelection();
    } else if (btn.dataset.action === 'delete') {
      deleteSelection();
    } else if (btn.dataset.z) {
      if (btn.dataset.z === 'front') sendSelectionToFront();
      else if (btn.dataset.z === 'back') sendSelectionToBack();
      else if (btn.dataset.z === 'up') bringSelectionForward();
      else if (btn.dataset.z === 'down') sendSelectionBackward();
      // close dropdown after action
      const open = actions.querySelector('[data-menu-panel]'); if (open) open.classList.add('hidden');
    }
  });

  // Close dropdown on outside click or ESC
  document.addEventListener('click', (e) => {
    const panel = actions.querySelector('[data-menu-panel]');
    if (!panel) return; if (panel.classList.contains('hidden')) return;
    if (!actions.contains(e.target)) panel.classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const panel = actions.querySelector('[data-menu-panel]'); if (panel) panel.classList.add('hidden');
    }
    // Delete selection via keyboard when not typing in inputs
    if (e.key === 'Delete' || e.key === 'Backspace'){
      const active = document.activeElement;
      const isEditing = active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (!isEditing && selectedIds.size > 0){ e.preventDefault(); deleteSelection(); }
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
  
  // Update the input value
  currentColorInput.value = color;
  
  // Add to history
  addToColorHistory(color);
  
  // Trigger events
  currentColorInput.dispatchEvent(new Event('input', { bubbles: true }));
  currentColorInput.dispatchEvent(new Event('change', { bubbles: true }));
  
  // Close picker
  hideCustomColorPicker();
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
    if (panelId === 'elementsPanel') {
      toggle.textContent = isCollapsed ? '⇤' : '⇥';
    } else if (panelId === 'propertiesPanel') {
      toggle.textContent = isCollapsed ? '⇥' : '⇤';
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
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = APP_VERSION;
});




