// Minimal editor logic refactor: model-driven, side panels, floating toolbar, edit mode, pages

/* ----------------------- Model ----------------------- */
const Model = {
  document: {
    pages: [],
    currentPageId: '',
    nextElementId: 1,
    editMode: true,
  },
};

// Centralized history (keep out of the document snapshot so multiple undos work)
const HISTORY_LIMIT = 10;
const History = { past: [], future: [] };
const APP_VERSION = 'v1.0.0';

function generateId(prefix = 'el') {
  return `${prefix}-${Model.document.nextElementId++}`;
}

/* ----------------------- DOM refs ----------------------- */
const pagesList = () => document.getElementById('pagesList');
const elementsPanel = () => document.getElementById('elementsPanel');
const propertiesContent = () => document.getElementById('propertiesContent');
const formatToolbar = () => document.getElementById('formatToolbar');
const elementActions = () => document.getElementById('elementActions');
// Zoom
const zoomSlider = () => document.getElementById('zoomSlider');
const zoomLabel  = () => document.getElementById('zoomLabel');
let __zoom = 1; // scale (1 = 100%)
function getZoom(){ return __zoom; }
function setZoomScale(scale){
  const clamped = Math.min(3, Math.max(0.25, Number(scale) || 1));
  __zoom = clamped;
  document.documentElement.style.setProperty('--zoom', String(clamped));
  if (zoomSlider()) zoomSlider().value = String(Math.round(clamped * 100));
  if (zoomLabel())  zoomLabel().textContent = `${Math.round(clamped * 100)}%`;
  alignOverlays();
}
function setZoomPercent(pct){ setZoomScale((Number(pct)||100) / 100); }

// Zoom helpers that keep a focal point stable on screen
function zoomAtClientPoint(clientX, clientY, nextScale){
  const vp = document.getElementById('pageViewport');
  const page = getPageNode(); if (!vp || !page) return setZoomScale(nextScale);
  const before = page.getBoundingClientRect();
  const z0 = getZoom();
  const px = (clientX - before.left) / z0; // logical point on page
  const py = (clientY - before.top)  / z0;
  setZoomScale(nextScale);
  const after = page.getBoundingClientRect();
  const z1 = getZoom();
  const nx = px * z1; const ny = py * z1; // new on-screen offset from page top-left
  const dx = nx - (clientX - after.left);
  const dy = ny - (clientY - after.top);
  vp.scrollLeft += dx;
  vp.scrollTop  += dy;
}
function zoomAtViewportCenter(nextScale){
  const vp = document.getElementById('pageViewport'); if (!vp) return setZoomScale(nextScale);
  const r = vp.getBoundingClientRect();
  const cx = r.left + r.width/2; const cy = r.top + r.height/2;
  zoomAtClientPoint(cx, cy, nextScale);
}

const undoBtn = () => document.getElementById('undoBtn');
const redoBtn = () => document.getElementById('redoBtn');
const editToggle = () => document.getElementById('editToggle');
const saveBtn = () => document.getElementById('saveBtn');
const saveAsBtn = () => document.getElementById('saveAsBtn');
const savePdfBtn = () => document.getElementById('savePdfBtn');

/* ----------------------- Utilities ----------------------- */
function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
function nowSnapshot() { return deepClone(Model.document); }
function commitHistory(label) {
  History.past.push(nowSnapshot());
  if (History.past.length > HISTORY_LIMIT) History.past.shift();
  History.future = [];
  updateUndoRedoButtons();
}
function undo() {
  if (!History.past.length) return;
  History.future.push(nowSnapshot());
  Model.document = History.past.pop();
  renderAll();
  updateUndoRedoButtons();
}
function redo() {
  if (!History.future.length) return;
  History.past.push(nowSnapshot());
  Model.document = History.future.pop();
  renderAll();
  updateUndoRedoButtons();
}
function updateUndoRedoButtons() {
  undoBtn().disabled = History.past.length === 0;
  redoBtn().disabled = History.future.length === 0;
}

function setEditMode(on) {
  Model.document.editMode = on;
  document.body.classList.toggle('edit-off', !on);
  // hide selection and toolbar if turning off
  if (!on) clearSelection();
}

/* ----------------------- Page & Elements ----------------------- */
function createPage(name = `Page ${Model.document.pages.length + 1}`) {
  const id = `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return { id, name, elements: [] };
}

function getCurrentPage() {
  return Model.document.pages.find(p => p.id === Model.document.currentPageId);
}

function addPage() {
  commitHistory('add-page');
  const p = createPage();
  Model.document.pages.push(p);
  Model.document.currentPageId = p.id;
  renderAll();
}

function removeCurrentPage() {
  if (Model.document.pages.length <= 1) return;
  commitHistory('remove-page');
  const idx = Model.document.pages.findIndex(p => p.id === Model.document.currentPageId);
  Model.document.pages.splice(idx, 1);
  const newIdx = Math.max(0, idx - 1);
  Model.document.currentPageId = Model.document.pages[newIdx].id;
  renderAll();
}

function duplicateCurrentPage() {
  const page = getCurrentPage();
  commitHistory('duplicate-page');
  const clone = deepClone(page);
  clone.id = createPage(page.name + ' copy').id;
  // ensure unique element ids
  clone.elements = clone.elements.map(e => ({ ...e, id: generateId() }));
  const idx = Model.document.pages.findIndex(p => p.id === page.id);
  Model.document.pages.splice(idx + 1, 0, clone);
  Model.document.currentPageId = clone.id;
  renderAll();
}

function moveCurrentPage(delta) {
  const idx = Model.document.pages.findIndex(p => p.id === Model.document.currentPageId);
  const target = idx + delta;
  if (target < 0 || target >= Model.document.pages.length) return;
  commitHistory('move-page');
  const [pg] = Model.document.pages.splice(idx, 1);
  Model.document.pages.splice(target, 0, pg);
  renderAll();
}

/* ----------------------- Selection (multi-select) ----------------------- */
let selectedIds = new Set();

function clearSelection(){ 
  selectedIds.clear(); 
  clearTableSelection(); 
  updateSelectionUI(); 
}
function setSelection(ids){ 
  selectedIds = new Set((ids||[]).filter(Boolean)); 
  // Clear table selection unless we're selecting the same table that has active cell selection
  if (tableSel && (selectedIds.size !== 1 || !selectedIds.has(tableSel.tableId))) {
    clearTableSelection();
  }
  updateSelectionUI(); 
}
function addToSelection(id){ 
  if (!id) return; 
  selectedIds.add(id); 
  // Clear table selection when adding non-table elements or different tables
  if (tableSel && (!selectedIds.has(tableSel.tableId) || selectedIds.size > 1)) {
    clearTableSelection();
  }
  updateSelectionUI(); 
}
function toggleSelection(id){ 
  if (!id) return; 
  selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id); 
  // Clear table selection when toggling creates a multi-selection or removes the table
  if (tableSel && (!selectedIds.has(tableSel.tableId) || selectedIds.size > 1)) {
    clearTableSelection();
  }
  updateSelectionUI(); 
}
function isSelected(id){ return selectedIds.has(id); }

function updateSelectionUI(){
  document.querySelectorAll('.page .element').forEach(el => {
    const isTableElement = el.classList.contains('table');
    const should = selectedIds.has(el.dataset.id) && !isTableElement;
    el.classList.toggle('selected', should);
  });
  updateFormatToolbarVisibility();
  if (selectedIds.size === 1) {
    const m = getElementById([...selectedIds][0]);
    if (m) syncFormatToolbar(m);
  } else if (!tableSel) {
    // Only clear toolbar when there's no table selection active
    const bar = formatToolbar();
    if (bar){
      bar.querySelectorAll('[data-prop]').forEach(i => { if (i.type !== 'range' && i.type !== 'number') i.value = ''; });
      bar.querySelectorAll('[data-toggle]').forEach(b => b.setAttribute('aria-pressed','false'));
    }
  }
  updateSelectionBox();
  if (typeof window.applyAlignButtonState === 'function') window.applyAlignButtonState();
  // keep properties panel in sync
  renderProperties();
  // update group toggle state
  if (typeof updateGroupToggleButton === 'function') updateGroupToggleButton();
  // NEW: keep the action bubble in sync with selection
  positionElementActions();
}

function updateFormatToolbarVisibility(){
  const bar = formatToolbar();
  if ((selectedIds.size === 0 && !tableSel) || !Model.document.editMode) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
}
function hideFormatToolbar(){ formatToolbar().classList.add('hidden'); }

function positionElementActions(){
  const bubble = elementActions();
  if (selectedIds.size === 0 || !Model.document.editMode) { bubble.classList.add('hidden'); return; }
  const firstId = [...selectedIds][0];
  const el = document.querySelector(`.page .element[data-id="${firstId}"]`);
  if (!el) { bubble.classList.add('hidden'); return; }
  const r = el.getBoundingClientRect();
  bubble.style.left = (r.left + r.width / 2) + 'px';
  bubble.style.top = (r.top - 8) + 'px';
  bubble.classList.remove('hidden');
}

/* ----------------------- Selection box ----------------------- */
function selectionBoxEl(){ return document.getElementById('selectionBox'); }
function updateSelectionBox(){
  const box = selectionBoxEl(); if (!box) return;
  const b = getSelectionBounds();
  const page = getPageNode();
  // Hide selection box entirely for field(s) when edit mode is off
  if (!Model.document.editMode && selectedIds.size > 0) {
    const allFields = [...selectedIds].every(id => getElementById(id)?.type === 'field');
    if (allFields) { box.classList.add('hidden'); return; }
  }
  if (!b || !page){ box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  // Calculate viewport position from page rect so it survives page changes/scrolling
  const pr = page.getBoundingClientRect();
  const z = getZoom();
  const style = box.style;
  style.left = pr.left + b.x * z + 'px';
  style.top = pr.top + b.y * z + 'px';
  style.width = b.w * z + 'px';
  style.height = b.h * z + 'px';
  // Ensure selection box z-order sits just above page but below toolbars
  style.zIndex = '800';
  // Update actions bubble to the selection bounds center in viewport coords
  const bubble = elementActions();
  if (bubble && selectedIds.size > 0) {
    const cx = pr.left + (b.x + b.w / 2) * z;
    const cy = pr.top + b.y * z - 8;
    bubble.style.left = cx + 'px';
    bubble.style.top = cy + 'px';
  }
}

// Re-align viewport overlays (selection box + action bubble) once per frame
let __alignReq = null;
function alignOverlays() {
  if (__alignReq) return;
  __alignReq = requestAnimationFrame(() => {
    __alignReq = null;
    updateSelectionBox();
    positionElementActions();
  });
}

/* ===================== Table: model, pure ops, rendering, selection, commands ===================== */
// ----- utils -----
const clone = (obj) => JSON.parse(JSON.stringify(obj));
function generateCellId(tableId, r, c){
  return `cell_${tableId}_${r}x${c}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
}
function normalizeRange(r0,c0,r1,c1){ return { r0: Math.min(r0,r1), c0: Math.min(c0,c1), r1: Math.max(r0,r1), c1: Math.max(c0,c1) }; }
function getElementNode(id){ return document.querySelector(`.page .element[data-id="${id}"]`); }

// ===== Table model types =====
function makeTableElement(rows=3, cols=4) {
  const id = generateId('tbl');
  const colWidths = Array(cols).fill(Math.round(600/cols));
  const rowHeights = Array(rows).fill(40);
  const cells = {}; const grid = []; let counter = 0;
  for (let r=0; r<rows; r++){
    grid[r] = [];
    for (let c=0; c<cols; c++){
      const cid = generateCellId(id, r, c);
      cells[cid] = { id: cid, row:r, col:c, rowSpan:1, colSpan:1, hidden:false, content: "", styles: { alignH:'left', alignV:'top', padding:8, bg:null, borders:{ top:true,right:true,bottom:true,left:true } } };
      grid[r][c] = cid;
    }
  }
  return { id, type:'table', x:100, y:100, w:Math.max(200, colWidths.reduce((a,b)=>a+b,0)), h: rowHeights.reduce((a,b)=>a+b,0), rows, cols, colWidths, rowHeights, border:{ inner:1, outer:1, color:'#000', style:'solid' }, cells, grid };
}

// ----- pure ops -----
function tableAddRow(t, at) {
  t = clone(t);
  at = Math.min(Math.max(at, 0), t.rows);

  const rowHeights = t.rowHeights.slice();
  rowHeights.splice(at, 0, 40);

  const cells = clone(t.cells);
  const newGrid = [];
  const newlyCreated = new Set();
  const cols = t.cols;

  // Build grid with the inserted row
  for (let r = 0; r <= t.rows; r++) {
    if (r === at) {
      const newRow = [];
      for (let c = 0; c < cols; c++) {
        const cid = generateCellId(t.id, at, c);
        cells[cid] = {
          id: cid, row: at, col: c,
          rowSpan: 1, colSpan: 1, hidden: false,
          content: "", styles: { alignH:'left', alignV:'top', padding:8, bg:null,
            borders:{ top:true, right:true, bottom:true, left:true } }
        };
        newRow[c] = cid;
        newlyCreated.add(cid);
      }
      newGrid[r] = newRow;
    } else {
      const srcR = r > at ? r - 1 : r;
      newGrid[r] = t.grid[srcR].slice();
    }
  }

  // Shift row index for all existing cells at/after 'at' except the ones we just made
  Object.values(cells).forEach(cell => {
    if (!newlyCreated.has(cell.id) && cell.row >= at) cell.row += 1;
  });

  const h = rowHeights.reduce((a,b)=>a+b,0);
  return { ...t, rows: t.rows + 1, rowHeights, grid: newGrid, cells, h };
}
function tableAddColumn(t, at) {
  t = clone(t);
  at = Math.min(Math.max(at, 0), t.cols);

  const colWidths = t.colWidths.slice();
  colWidths.splice(at, 0, 100);

  const cells = clone(t.cells);
  const newGrid = [];
  const newlyCreated = new Set();

  for (let r = 0; r < t.rows; r++) {
    const row = [];
    for (let c = 0; c <= t.cols; c++) {
      if (c === at) {
        const cid = generateCellId(t.id, r, at);
        cells[cid] = {
          id: cid, row: r, col: at,
          rowSpan: 1, colSpan: 1, hidden: false,
          content: "", styles: { alignH:'left', alignV:'top', padding:8, bg:null,
            borders:{ top:true, right:true, bottom:true, left:true } }
        };
        row[c] = cid;
        newlyCreated.add(cid);
      } else {
        const srcC = c > at ? c - 1 : c;
        row[c] = t.grid[r][srcC];
      }
    }
    newGrid[r] = row;
  }

  // Shift column index for all existing cells at/after 'at' except the newly created ones
  Object.values(cells).forEach(cell => {
    if (!newlyCreated.has(cell.id) && cell.col >= at) cell.col += 1;
  });

  const w = colWidths.reduce((a,b)=>a+b,0);
  return { ...t, cols: t.cols + 1, colWidths, grid: newGrid, cells, w };
}
function tableDeleteRow(t, at) {
  if (t.rows <= 1) return t; t = clone(t);
  const cells = clone(t.cells); t.grid[at].forEach(id => { delete cells[id]; });
  const grid = t.grid.slice(); grid.splice(at,1); const rowHeights = t.rowHeights.slice(); rowHeights.splice(at,1);
  Object.values(cells).forEach(cell => { if (cell.row > at) cell.row -= 1; });
  return { ...t, rows:t.rows-1, grid, rowHeights, cells };
}
function tableDeleteColumn(t, at) {
  if (t.cols <= 1) return t; t = clone(t);
  const cells = clone(t.cells); for (let r=0;r<t.rows;r++) delete cells[t.grid[r][at]];
  const grid = t.grid.map(r => { const x = r.slice(); x.splice(at,1); return x; });
  const colWidths = t.colWidths.slice(); colWidths.splice(at,1);
  Object.values(cells).forEach(cell => { if (cell.col > at) cell.col -= 1; });
  return { ...t, cols:t.cols-1, grid, colWidths, cells };
}
function tableSplitAnchor(t, r, c){ const id = t.grid[r][c]; const cell = t.cells[id]; if (!cell) return t; if (cell.rowSpan===1 && cell.colSpan===1) return t; const {row, col, rowSpan, colSpan} = cell; for (let rr=row; rr<row+rowSpan; rr++){ for (let cc=col; cc<col+colSpan; cc++){ const cid = (rr===row && cc===col) ? id : generateCellId(t.id, rr, cc); if (!t.cells[cid]) t.cells[cid] = { id:cid, row:rr, col:cc, rowSpan:1, colSpan:1, hidden:false, content:"", styles:clone(cell.styles) }; t.grid[rr][cc] = cid; t.cells[cid].hidden = false; t.cells[cid].rowSpan = 1; t.cells[cid].colSpan = 1; } } cell.rowSpan = 1; cell.colSpan = 1; return t; }
function tableNormalizeRange(t, r0,c0,r1,c1){ t = clone(t); const {r0:rr0,c0:cc0,r1:rr1,c1:cc1} = normalizeRange(r0,c0,r1,c1); const seen = new Set(); for (let r=rr0;r<=rr1;r++){ for (let c=cc0;c<=cc1;c++){ const id = t.grid[r][c]; if (!seen.has(id)){ seen.add(id); const a = t.cells[id]; if (a.rowSpan>1 || a.colSpan>1) t = tableSplitAnchor(t, a.row, a.col); } } } return t; }
function tableMergeRange(t, r0,c0,r1,c1) { t = tableNormalizeRange(t, r0,c0,r1,c1); const { r0:rr0,c0:cc0,r1:rr1,c1:cc1 } = normalizeRange(r0,c0,r1,c1); const anchorId = t.grid[rr0][cc0]; const cell = t.cells[anchorId]; cell.row = rr0; cell.col = cc0; cell.rowSpan = rr1-rr0+1; cell.colSpan = cc1-cc0+1; for (let r=rr0;r<=rr1;r++){ for (let c=cc0;c<=cc1;c++){ const id = t.grid[r][c]; if (id !== anchorId){ t.cells[id].hidden = true; t.grid[r][c] = anchorId; } } } return t; }
function tableUnmerge(t, r, c) { t = clone(t); const anchorId = t.grid[r][c]; const cell = t.cells[anchorId]; if (!cell || (cell.rowSpan===1 && cell.colSpan===1)) return t; return tableSplitAnchor(t, cell.row, cell.col); }

// ===== Table rendering =====
function renderTable(elModel, host) {
  host.classList.add('table'); host.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'table-grid';
  // A11y: grid semantics
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-rowcount', String(elModel.rows));
  grid.setAttribute('aria-colcount', String(elModel.cols));
  grid.style.gridTemplateColumns = elModel.colWidths.map(px=>`${px}px`).join(' ');
  grid.style.gridTemplateRows    = elModel.rowHeights.map(px=>`${px}px`).join(' ');
  for (let r=0; r<elModel.rows; r++){
    for (let c=0; c<elModel.cols; c++){
      const id = elModel.grid[r][c]; const cell = elModel.cells[id];
      // Render only anchor positions of cells (skip duplicates mapped to the anchor id)
      if (!cell || cell.hidden || cell.row !== r || cell.col !== c) continue;
      const div = document.createElement('div'); div.className = 'table-cell'; div.dataset.tableId = elModel.id; div.dataset.r = r; div.dataset.c = c;
      div.setAttribute('role', 'gridcell');
      div.setAttribute('aria-rowindex', String(r+1));
      div.setAttribute('aria-colindex', String(c+1));
      div.setAttribute('aria-selected', 'false');
      // Roving tabindex: active cell focusable, others -1
      const isActive = tableSel ? (tableSel.tableId===elModel.id && r===Math.min(tableSel.r0, tableSel.r1) && c===Math.min(tableSel.c0, tableSel.c1)) : (r===0 && c===0);
      div.tabIndex = isActive ? 0 : -1;
      div.style.gridColumn = `span ${cell.colSpan}`; div.style.gridRow = `span ${cell.rowSpan}`;
      applyCellStyles(div, cell); 
      div.textContent = cell.content || '';
      div.addEventListener('mousedown', onTableCellMouseDown);
      // Double-click: enter edit mode and place caret at click position
      div.addEventListener('dblclick', (ev) => startEditCell(ev, { caret: 'at-click' }));
      grid.appendChild(div);
    }
  }
  const outer = document.createElement('div'); outer.className = 'table-outer'; outer.style.borderColor = elModel.border.color;
  host.appendChild(grid); host.appendChild(outer);
  host.dataset.id = elModel.id;

  // Ghost resizer
  const ghostV = document.createElement('div'); ghostV.className = 'table-resizer v'; ghostV.style.display='none';
  const ghostH = document.createElement('div'); ghostH.className = 'table-resizer h'; ghostH.style.display='none';
  host.appendChild(ghostV); host.appendChild(ghostH);

  // Hover & drag on grid
  let dragRC = null; // { kind:'row'|'col', index, start, startSizes }
  grid.addEventListener('mousemove', (e)=>{
    if (dragRC) return; // dragging, ghost is driven elsewhere
    const hit = hitTableBoundary(host, elModel, e.clientX, e.clientY, 6);
    ghostV.style.display='none'; ghostH.style.display='none';
    grid.classList.remove('resizing','row');

    if (hit?.kind === 'col'){
      grid.classList.add('resizing'); grid.classList.remove('row');
      const x = getTableAccumSizes(elModel.colWidths)[hit.index+1];
      ghostV.style.left = x + 'px'; ghostV.style.top = 0; ghostV.style.bottom = 0; ghostV.style.display='block';
    } else if (hit?.kind === 'row'){
      grid.classList.add('resizing','row');
      const y = getTableAccumSizes(elModel.rowHeights)[hit.index+1];
      ghostH.style.top = y + 'px'; ghostH.style.left = 0; ghostH.style.right = 0; ghostH.style.display='block';
    }
  });

  grid.addEventListener('mouseleave', ()=>{
    if (!dragRC){ ghostV.style.display='none'; ghostH.style.display='none'; grid.classList.remove('resizing','row'); }
  });

  // Allow grabbing the ghost line itself
  function startResizeFromEvent(e){
    const hit = hitTableBoundary(host, elModel, e.clientX, e.clientY, 6);
    if (!hit) return; e.stopPropagation(); e.preventDefault();
    commitHistory('table-resize'); // single history entry
    dragRC = { kind: hit.kind, index: hit.index, start: {x:e.clientX, y:e.clientY}, startSizes: { cols:[...elModel.colWidths], rows:[...elModel.rowHeights] } };
    document.addEventListener('mousemove', onDrag); document.addEventListener('mouseup', onUp);
    function onDrag(ev){
      const z = getZoom();
      const dx = (ev.clientX - dragRC.start.x) / z; const dy = (ev.clientY - dragRC.start.y) / z;
      const T = clone(elModel);
      if (dragRC.kind === 'col'){
        const i = dragRC.index;
        const next = Math.max(10, dragRC.startSizes.cols[i] + dx);
        if (tableSel && tableSel.tableId === elModel.id && i>=tableSel.c0 && i<=tableSel.c1){
          for (let c=tableSel.c0;c<=tableSel.c1;c++) T.colWidths[c] = next;
        } else {
          T.colWidths[i] = next;
        }
        T.w = T.colWidths.reduce((a,b)=>a+b,0);
      } else {
        const i = dragRC.index;
        const next = Math.max(10, dragRC.startSizes.rows[i] + dy);
        if (tableSel && tableSel.tableId === elModel.id && i>=tableSel.r0 && i<=tableSel.r1){
          for (let r=tableSel.r0;r<=tableSel.r1;r++) T.rowHeights[r] = next;
        } else {
          T.rowHeights[i] = next;
        }
        T.h = T.rowHeights.reduce((a,b)=>a+b,0);
      }
      // live update without stacking history: mutate page element in place and re-render table only
      const page = getCurrentPage(); const idx = page.elements.findIndex(e => e.id === elModel.id); if (idx !== -1) page.elements[idx] = T; renderPage(page);
    }
    function onUp(){
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', onUp);
      dragRC = null; ghostV.style.display='none'; ghostH.style.display='none'; grid.classList.remove('resizing','row');
    }
  }
  // Use capture so resize can start even when a cell's mousedown stops propagation
  grid.addEventListener('mousedown', startResizeFromEvent, true);
  ghostV.addEventListener('mousedown', startResizeFromEvent);
  ghostH.addEventListener('mousedown', startResizeFromEvent);
  // Keyboard navigation per APG grid patterns
  grid.addEventListener('keydown', (e) => onTableGridKeydown(e, elModel.id));
  // Clicking anywhere outside the grid clears the selection
  const onDocClick = (ev) => {
    const t = ev.target;
    // Ignore clicks inside the table itself
    if (host.contains(t)) return;
    // Ignore clicks inside the format toolbar or other editor overlays
    const bar = formatToolbar();
    if (bar && bar.contains(t)) return;
    const tblMenu = document.getElementById('tableActions');
    if (tblMenu && tblMenu.contains(t)) return;
    const bubble = elementActions && elementActions();
    if (bubble && bubble.contains && bubble.contains(t)) return;
    const selBox = selectionBoxEl && selectionBoxEl();
    if (selBox && selBox.contains && selBox.contains(t)) return;
    clearTableSelection();
    document.removeEventListener('mousedown', onDocClick);
  };
  setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
}
function applyCellStyles(div, cell) {
  const h = cell.styles.alignH || 'left'; const v = cell.styles.alignV || 'top';
  div.style.justifyContent = h==='left' ? 'flex-start' : (h==='center' ? 'center' : 'flex-end');
  div.style.alignItems = v==='top' ? 'flex-start' : (v==='middle' ? 'center' : 'flex-end');
  div.style.padding = (cell.styles.padding ?? 8) + 'px';
  if (cell.styles.bg) div.style.setProperty('--cell-bg', cell.styles.bg);
  if (cell.styles.textColor) div.style.color = cell.styles.textColor;
  if (cell.styles.fontFamily) div.style.fontFamily = cell.styles.fontFamily;
  if (cell.styles.fontSize) div.style.fontSize = (cell.styles.fontSize || 14) + 'pt';
  // Typography
  if (typeof cell.styles.bold !== 'undefined') div.style.fontWeight = cell.styles.bold ? '700' : '400';
  if (typeof cell.styles.italic !== 'undefined') div.style.fontStyle = cell.styles.italic ? 'italic' : 'normal';
  if (typeof cell.styles.underline !== 'undefined') div.style.textDecoration = cell.styles.underline ? 'underline' : 'none';
  // Borders per side
  const bw = Number(cell.styles.borderWidth ?? cell.styles.strokeWidth ?? 1);
  const bc = cell.styles.borderColor || cell.styles.strokeColor || '#000000';
  const sides = cell.styles.borders || { top:false,right:false,bottom:false,left:false };
  div.style.borderTop = sides.top ? `${bw}px solid ${bc}` : '0 solid transparent';
  div.style.borderRight = sides.right ? `${bw}px solid ${bc}` : '0 solid transparent';
  div.style.borderBottom = sides.bottom ? `${bw}px solid ${bc}` : '0 solid transparent';
  div.style.borderLeft = sides.left ? `${bw}px solid ${bc}` : '0 solid transparent';
}

// --- Table geometry helpers
function getTableAccumSizes(arr){ const out=[0]; let acc=0; for (const v of arr){ acc+=v; out.push(acc); } return out; }
function hitTableBoundary(tableNode, model, clientX, clientY, pad=6){
  const grid = tableNode.querySelector('.table-grid'); if (!grid) return null;
  const r = grid.getBoundingClientRect();
  const z = getZoom();
  const x = (clientX - r.left) / z, y = (clientY - r.top) / z;
  if (x < -pad || y < -pad || x > r.width+pad || y > r.height+pad) return null;
  const cols = getTableAccumSizes(model.colWidths);
  const rows = getTableAccumSizes(model.rowHeights);
  let vDist = Infinity, vIdx = -1; cols.forEach((cx,i)=>{ const d=Math.abs(x-cx); if (d< vDist){ vDist=d; vIdx=i; }});
  let hDist = Infinity, hIdx = -1; rows.forEach((cy,i)=>{ const d=Math.abs(y-cy); if (d< hDist){ hDist=d; hIdx=i; }});
  // Allow resizing on the outermost right/bottom boundaries as well
  const nearV = vDist<=pad && vIdx>0; // exclude left outer edge only
  const nearH = hDist<=pad && hIdx>0; // exclude top outer edge only
  if (!nearV && !nearH) return null;
  return { kind: nearV ? 'col' : 'row', index: nearV ? (vIdx-1) : (hIdx-1), rect: r };
}

// ===== Table selection state =====
let tableSel = null; // { tableId, r0,c0,r1,c1 }
let lastTableSel = null; // Track last table selection for fallback behavior
const isTableContext = () => !!tableSel || (getSelectedElement()?.type === 'table');
function getSelectedElement(){ return selectedIds.size===1 ? getElementById([...selectedIds][0]) : null; }
function setTableSelection(tableId, r0,c0,r1,c1){ 
  // Clear lastTableSel if switching to a different table
  if (lastTableSel && lastTableSel.tableId !== tableId) {
    lastTableSel = null;
  }
  
  tableSel = { tableId, r0, c0, r1:(r1??r0), c1:(c1??c0) }; 
  lastTableSel = { ...tableSel }; // Track for fallback behavior
  highlightTableSelection(); 
  updateToolbarForSelection(); 
  updateFormatToolbarVisibility(); 
}
function clearTableSelection(){
  tableSel = null;
  // Don't clear lastTableSel here - keep it for fallback behavior
  document.querySelectorAll('.table-cell.is-selected,.table-cell.is-range,.table-cell.selected').forEach(n=>{
    n.classList.remove('is-selected','is-range','selected');
    n.setAttribute('aria-selected','false');
    n.tabIndex = -1;
  });
  updateToolbarForSelection(); updateFormatToolbarVisibility();
  const bar = document.getElementById('tableActions'); if (bar) bar.classList.add('hidden');
}
function highlightTableSelection(){
  document.querySelectorAll('.table-cell.is-selected,.table-cell.is-range,.table-cell.selected').forEach(n=>{
    n.classList.remove('is-selected','is-range','selected');
    n.setAttribute('aria-selected','false');
  });
  if (!tableSel) return;
  const {tableId,r0,c0,r1,c1} = tableSel; const tNode = getElementNode(tableId); if (!tNode) return;
  const cells = tNode.querySelectorAll('.table-cell');
  for (const div of cells){
    const r = +div.dataset.r, c=+div.dataset.c;
    if (r===r0 && c===c0 && r===r1 && c===c1){ div.classList.add('is-selected','selected'); div.setAttribute('aria-selected','true'); div.tabIndex = 0; }
    else if (r>=r0 && r<=r1 && c>=c0 && c<=c1){ div.classList.add('is-range'); div.setAttribute('aria-selected','true'); div.tabIndex = -1; }
    else { div.tabIndex = -1; }
  }
  const sr = document.getElementById('srAnnouncer'); if (sr){ sr.textContent = `Selected ${r1-r0+1} by ${c1-c0+1} cells.`; }
  // Reflect anchor cell styles in toolbar every time selection changes
  const tModel = getElementById(tableSel.tableId);
  if (tModel) syncFormatToolbar(tModel);
  // Update Properties panel for cellId
  renderProperties();
}
function onTableCellMouseDown(e){
  if (e.button !== 0) return; // right-click shouldn't change selection
  e.stopPropagation();
  const div = e.currentTarget; const tableId = div.dataset.tableId; const r = +div.dataset.r, c = +div.dataset.c;
  setTableSelection(tableId, r, c);
  // Move focus to the active cell for keyboarding
  div.focus();
  const onMove = (ev)=>{ const over = ev.target.closest('.table-cell'); if (!over || over.dataset.tableId !== tableId) return; const rr = +over.dataset.r, cc = +over.dataset.c; setTableSelection(tableId, r, c, rr, cc); };
  const onUp = ()=>{ window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
}
function startEditCell(e, opts){
  const div = e.currentTarget; const tableId = div.dataset.tableId; const r = +div.dataset.r, c = +div.dataset.c;
  setTableSelection(tableId, r, c);
  // Use plaintext-only when available
  if (div.contentEditable !== 'plaintext-only') div.setAttribute('contenteditable','plaintext-only');
  div.setAttribute('role','textbox');
  div.focus();
  let before = div.textContent || '';
  // Optional initial overwrite (for single-key typing)
  if (opts && Object.prototype.hasOwnProperty.call(opts, 'initialText')) {
    div.textContent = String(opts.initialText ?? '');
  }
  // Helper: place caret
  const placeCaret = () => {
    const sel = window.getSelection(); if (!sel) return;
    const textNode = div.firstChild;
    const wantClick = opts && opts.caret === 'at-click' && typeof e.clientX === 'number' && typeof e.clientY === 'number';
    if (wantClick && (document.caretPositionFromPoint || document.caretRangeFromPoint)){
      let range = null;
      if (document.caretPositionFromPoint){
        const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
        if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
      } else if (document.caretRangeFromPoint){
        range = document.caretRangeFromPoint(e.clientX, e.clientY);
      }
      if (range){ sel.removeAllRanges(); sel.addRange(range); return; }
    }
    // Default: end of content (continue typing after initialText)
    if (textNode && textNode.nodeType === Node.TEXT_NODE){
      const range = document.createRange();
      const len = textNode.textContent?.length || 0;
      range.setStart(textNode, len);
      range.collapse(true);
      sel.removeAllRanges(); sel.addRange(range);
    }
  };
  // Place caret after any initial overwrite or at click
  placeCaret();
  const commit = () => {
    const text = sanitizePlaintext(div.textContent || '');
    const t = getElementById(tableId); const id = t.grid[r][c];
    // silent update (no extra history spam); merge directly and rerender table only
    t.cells[id].content = text;
    renderPage(getCurrentPage());
    const cell = getElementNode(tableId)?.querySelector(`.table-cell[data-r="${r}"][data-c="${c}"]`);
    if (cell) cell.focus();
  };
  const cancel = () => { div.textContent = before; };
  const onBlur = () => { cleanup(); commit(); };
  const onKey = (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); cleanup(); commit(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); cancel(); cleanup(); renderPage(getCurrentPage()); }
    else if (ev.key === 'Tab') {
      ev.preventDefault(); const backward = ev.shiftKey;
      cleanup(); commit();
      const t = getElementById(tableId); if (!t) return;
      let nr = r, nc = backward ? c - 1 : c + 1;
      if (nc < 0) { nc = t.cols - 1; nr = Math.max(0, r - 1); }
      if (nc >= t.cols) { nc = 0; nr = Math.min(t.rows - 1, r + 1); }
      const mapped = mapToAnchorCoords(t, nr, nc); nr = mapped.r; nc = mapped.c;
      setTableSelection(tableId, nr, nc);
      const node = getElementNode(tableId)?.querySelector(`.table-cell[data-r="${nr}"][data-c="${nc}"]`); if (node) node.focus();
    }
  };
  function cleanup(){ div.removeEventListener('blur', onBlur); div.removeEventListener('keydown', onKey); div.setAttribute('contenteditable','false'); div.removeAttribute('role'); }
  div.addEventListener('blur', onBlur);
  div.addEventListener('keydown', onKey);
}

function sanitizePlaintext(text){
  const t = String(text || '').replace(/\r\n?/g, '\n');
  return t.split('\n').map(s => s.replace(/[ \t\f\v\u00A0]+/g, ' ').trimEnd()).join('\n');
}

/* ===== Excel-style Clipboard (Table) ===== */

/** Parse clipboard text into a 2D grid. Supports TSV, CSV, and semicolon CSV. */
function parseClipboardGrid(text) {
  const norm = String(text || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!norm) return [[]];

  const lines = norm.split('\n');

  // Detect delimiter: prefer tabs; otherwise choose between comma/semicolon by count
  let delim = '\t';
  if (!lines.some(l => l.includes('\t'))) {
    const comma = lines.reduce((a, l) => a + (l.match(/,/g)?.length || 0), 0);
    const semi  = lines.reduce((a, l) => a + (l.match(/;/g)?.length || 0), 0);
    delim = semi > comma ? ';' : ',';
  }

  return lines.map(line => {
    if (delim === '\t') return line.split('\t'); // TSV is simple
    // Basic CSV split (no quotes handling) — good enough for Excel simple exports
    // If you need full CSV, plug a small parser here.
    return line.split(delim);
  });
}

/** Serialize a 2D grid to TSV (Excel-friendly). */
function gridToTSV(grid) {
  return grid.map(row =>
    row.map(v => String(v ?? '').replace(/\r\n?/g, '\n')).join('\t')
  ).join('\n');
}

/** Extract a 2D grid of text from the current table selection. */
function extractGridFromSelection(t, r0, c0, r1, c1) {
  const rows = r1 - r0 + 1, cols = c1 - c0 + 1;
  const out = Array.from({ length: rows }, () => Array(cols).fill(''));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const id = t.grid[r][c];
      const cell = t.cells[id];
      if (!cell || cell.hidden) continue;
      if (cell.row === r && cell.col === c) {
        out[r - r0][c - c0] = String(cell.content ?? '');
      }
    }
  }
  return out;
}

/** Ensure table can contain target area; returns possibly modified table object. */
function ensureTableSize(t, needRows, needCols, startR, startC) {
  let next = clone(t);
  const targetRows = startR + needRows;
  const targetCols = startC + needCols;
  while (next.rows < targetRows) next = tableAddRow(next, next.rows);
  while (next.cols < targetCols) next = tableAddColumn(next, next.cols);
  return next;
}

/** Paste a grid into the table starting at (startR,startC); auto-expands and unmerges as needed. */
function pasteGridIntoTable(t, startR, startC, grid) {
  const rows = grid.length;
  const cols = Math.max(...grid.map(r => r.length), 1);

  let next = ensureTableSize(t, rows, cols, startR, startC);
  // Unmerge target area so each destination cell is addressable
  next = tableNormalizeRange(next, startR, startC, startR + rows - 1, startC + cols - 1);

  for (let rr = 0; rr < rows; rr++) {
    for (let cc = 0; cc < cols; cc++) {
      const r = startR + rr, c = startC + cc;
      const id = next.grid[r][c];
      const cell = next.cells[id];
      if (!cell || cell.hidden) continue;
      cell.content = String(grid[rr][cc] ?? '');
    }
  }
  return next;
}

/** When a table selection exists (or a focused .table-cell), return anchor coords. */
function getActiveTableAnchor() {
  if (tableSel) {
    return {
      tableId: tableSel.tableId,
      r: Math.min(tableSel.r0, tableSel.r1),
      c: Math.min(tableSel.c0, tableSel.c1),
    };
  }
  const active = document.activeElement;
  const div = active && active.classList && active.classList.contains('table-cell') ? active : null;
  if (div) {
    return {
      tableId: div.dataset.tableId,
      r: Number(div.dataset.r),
      c: Number(div.dataset.c),
    };
  }
  return null;
}

/** Bind global clipboard handlers for table copy/paste. */
function bindTableClipboard() {
  // COPY
  document.addEventListener('copy', (e) => {
    // Don't hijack when user is editing text inside a cell
    const active = document.activeElement;
    const isEditing = active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    if (isEditing) return;

    const anchor = getActiveTableAnchor();
    if (!anchor) return;

    const t = getElementById(anchor.tableId);
    if (!t) return;

    const r0 = Math.min(tableSel?.r0 ?? anchor.r, tableSel?.r1 ?? anchor.r);
    const c0 = Math.min(tableSel?.c0 ?? anchor.c, tableSel?.c1 ?? anchor.c);
    const r1 = Math.max(tableSel?.r0 ?? anchor.r, tableSel?.r1 ?? anchor.r);
    const c1 = Math.max(tableSel?.c0 ?? anchor.c, tableSel?.c1 ?? anchor.c);

    const grid = extractGridFromSelection(t, r0, c0, r1, c1);
    const tsv = gridToTSV(grid);

    e.preventDefault();
    e.clipboardData.setData('text/plain', tsv);

    // Optional: lightweight HTML table
    const html = '<table>' + grid.map(row => '<tr>' + row.map(cell =>
      `<td>${String(cell ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</td>`
    ).join('') + '</tr>').join('') + '</table>';
    e.clipboardData.setData('text/html', html);
  });

  // PASTE
  document.addEventListener('paste', (e) => {
    const active = document.activeElement;
    const isEditing = active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    if (isEditing) return; // Let native paste work inside text editing

    const anchor = getActiveTableAnchor();
    if (!anchor) return;

    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    e.preventDefault();

    const t = getElementById(anchor.tableId);
    if (!t) return;

    const grid = parseClipboardGrid(text);
    let next = pasteGridIntoTable(t, anchor.r, anchor.c, grid);

    // Commit once, rerender, and select the pasted rectangle
    commitHistory('table-paste');
    updateElement(t.id, next);
    setTableSelection(t.id, anchor.r, anchor.c, anchor.r + grid.length - 1, anchor.c + Math.max(...grid.map(r => r.length), 1) - 1);
  });
}

// ===== Commands / toolbar integration =====
function updateToolbarForSelection(){ /* main toolbar remains generic */ }
function withActiveTable(fn){ const el = getSelectedElement(); if (el?.type === 'table') return fn(el.id, el); if (tableSel) return fn(tableSel.tableId, getElementById(tableSel.tableId)); }
function mapToAnchorCoords(tableModel, r, c){ const id = tableModel.grid[r]?.[c]; const cell = id ? tableModel.cells[id] : null; if (!cell) return { r, c }; return { r: cell.row, c: cell.col }; }
// APG grid keyboard controller
function onTableGridKeydown(e, tableId){
  if (!tableSel || tableSel.tableId !== tableId) return;
  const t = getElementById(tableId); if (!t) return;
  const { r0,c0,r1,c1 } = tableSel; const anchorR = Math.min(r0,r1), anchorC = Math.min(c0,c1);
  const maxR = t.rows - 1, maxC = t.cols - 1;
  // When editing a cell, let the editor handle keys
  const active = document.activeElement; if (active && active.isContentEditable) return;
  const grow = e.shiftKey;
  let nr = anchorR, nc = anchorC, er = Math.max(r0,r1), ec = Math.max(c0,c1);
  const prevent = () => { e.preventDefault(); };
  const commitAndFocus = () => {
    // If target lands inside a merged block, focus the anchor cell instead
    const mapped = mapToAnchorCoords(t, nr, nc); nr = mapped.r; nc = mapped.c;
    const aR = Math.min(r0,r1), aC = Math.min(c0,c1);
    const sR0 = grow ? Math.min(aR, nr) : nr;
    const sC0 = grow ? Math.min(aC, nc) : nc;
    const sR1 = grow ? Math.max(er, nr) : nr;
    const sC1 = grow ? Math.max(ec, nc) : nc;
    setTableSelection(tableId, sR0, sC0, sR1, sC1);
    const host = getElementNode(tableId); const node = host?.querySelector(`.table-cell[data-r="${nr}"][data-c="${nc}"]`); if (node) node.focus();
  };
  switch(e.key){
    case 'ArrowUp': prevent(); nr = Math.max(0, anchorR - 1); if (grow) er = Math.max(r0,r1); commitAndFocus(); break;
    case 'ArrowDown': prevent(); nr = Math.min(maxR, anchorR + 1); if (grow) er = Math.max(er, nr); commitAndFocus(); break;
    case 'ArrowLeft': prevent(); nc = Math.max(0, anchorC - 1); if (grow) ec = Math.max(c0,c1); commitAndFocus(); break;
    case 'ArrowRight': prevent(); nc = Math.min(maxC, anchorC + 1); if (grow) ec = Math.max(ec, nc); commitAndFocus(); break;
    case 'Tab': prevent(); nc = anchorC + (e.shiftKey?-1:1); if (nc<0){ nc=maxC; nr=Math.max(0,anchorR-1);} if (nc>maxC){ nc=0; nr=Math.min(maxR,anchorR+1);} commitAndFocus(); break;
    case 'Enter': prevent(); if (!grow){ nr = Math.min(maxR, Math.max(0, anchorR + (e.shiftKey?-1:1))); } commitAndFocus(); break;
    case 'Escape': clearTableSelection(); break;
    case 'F2': // start edit
      prevent();
      const node = getElementNode(tableId)?.querySelector(`.table-cell[data-r="${anchorR}"][data-c="${anchorC}"]`); if (node){ startEditCell({ currentTarget: node }); }
      break;
  }
  // Single-key typing starts edit and overwrites cell content
  if (!e.defaultPrevented && e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey){
    e.preventDefault();
    const node = getElementNode(tableId)?.querySelector(`.table-cell[data-r="${anchorR}"][data-c="${anchorC}"]`);
    if (node){ startEditCell({ currentTarget: node }, { initialText: e.key, caret: 'end' }); }
  }
}
function cmdTableAddRow(after=true){ withActiveTable((id, t)=>{ const at = tableSel ? (after ? tableSel.r1+1 : tableSel.r0) : t.rows; updateElement(id, tableAddRow(t, at)); renderPage(getCurrentPage()); highlightTableSelection(); }); }
function cmdTableAddColumn(after=true){ withActiveTable((id, t)=>{ const at = tableSel ? (after ? tableSel.c1+1 : tableSel.c0) : t.cols; updateElement(id, tableAddColumn(t, at)); renderPage(getCurrentPage()); highlightTableSelection(); }); }
function cmdTableDeleteRow(){ withActiveTable((id, t)=>{ const at = tableSel ? tableSel.r0 : t.rows-1; updateElement(id, tableDeleteRow(t, at)); renderPage(getCurrentPage()); clearTableSelection(); }); }
function cmdTableDeleteColumn(){ withActiveTable((id, t)=>{ const at = tableSel ? tableSel.c0 : t.cols-1; updateElement(id, tableDeleteColumn(t, at)); renderPage(getCurrentPage()); clearTableSelection(); }); }
function cmdTableMerge(){ if (!tableSel) return; const {tableId,r0,c0,r1,c1} = tableSel; const t = getElementById(tableId); updateElement(tableId, tableMergeRange(t, r0,c0,r1,c1)); renderPage(getCurrentPage()); setTableSelection(tableId, r0,c0,r1,c1); }
function cmdTableUnmerge(){ if (!tableSel) return; const {tableId,r0,c0} = tableSel; const t = getElementById(tableId); updateElement(tableId, tableUnmerge(t, r0, c0)); renderPage(getCurrentPage()); setTableSelection(tableId, r0, c0); }
/* removed toolbar-table binding: using context menu instead */

// --- Context menu for table actions
(function bindTableContextMenu(){
  const menu = document.getElementById('tableMenu'); if (!menu) return;
  document.addEventListener('contextmenu', (e)=>{
    const cell = e.target.closest?.('.table-cell'); if (!cell) return;
    e.preventDefault();
    const tableId = cell.dataset.tableId; const r = +cell.dataset.r, c = +cell.dataset.c;
    if (!tableSel || tableSel.tableId !== tableId) setTableSelection(tableId, r, c);
    menu.style.left = e.clientX+'px'; menu.style.top = e.clientY+'px';
    menu.classList.remove('hidden');
  });
  document.addEventListener('click', (e)=>{ if (!menu.contains(e.target)) menu.classList.add('hidden'); });
  document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') menu.classList.add('hidden'); });
  menu.addEventListener('click', (e)=>{
    const b = e.target.closest('[data-tm]'); if (!b) return; const act = b.dataset.tm; const s = tableSel; if (!s) return; const t = getElementById(s.tableId);
    if (act==='merge') { updateElement(t.id, tableMergeRange(t, s.r0,s.c0,s.r1,s.c1)); }
    if (act==='unmerge') { updateElement(t.id, tableUnmerge(t, s.r0,s.c0)); }
    if (act==='row-insert-above') { updateElement(t.id, tableAddRow(t, s.r0)); }
    if (act==='row-insert-below') { updateElement(t.id, tableAddRow(t, s.r1+1)); }
    if (act==='row-delete') { updateElement(t.id, tableDeleteRow(t, s.r0)); clearTableSelection(); }
    if (act==='col-insert-left') { updateElement(t.id, tableAddColumn(t, s.c0)); }
    if (act==='col-insert-right') { updateElement(t.id, tableAddColumn(t, s.c1+1)); }
    if (act==='col-delete') { updateElement(t.id, tableDeleteColumn(t, s.c0)); clearTableSelection(); }
    menu.classList.add('hidden');
  });
})();
// --- Minimal floating table action bar
(function bindFloatingTableActions(){
  const bar = document.getElementById('tableActions');
  if (!bar) return;

  function showIfTableSelection() {
    if (tableSel) bar.classList.remove('hidden');
    else bar.classList.add('hidden');
  }

  // Show/hide but DO NOT reposition
  const _set = setTableSelection;
  setTableSelection = function(...args){
    _set.apply(null, args);
    showIfTableSelection();
  };
  const _clear = clearTableSelection;
  clearTableSelection = function(){
    _clear();
    showIfTableSelection();
  };

  // Click actions
  bar.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-tact]');
    if (!btn || !tableSel) return;
    const t = getElementById(tableSel.tableId);
    switch(btn.dataset.tact){
      case 'row-add':
        updateElement(t.id, tableAddRow(t, tableSel.r1 + 1));
        // Keep selection on newly inserted band
        setTableSelection(t.id, tableSel.r0 + 1, tableSel.c0, tableSel.r1 + 1, tableSel.c1);
        break;
      case 'col-add':
        updateElement(t.id, tableAddColumn(t, tableSel.c1 + 1));
        // Keep selection on newly inserted band
        setTableSelection(t.id, tableSel.r0, tableSel.c0 + 1, tableSel.r1, tableSel.c1 + 1);
        break;
      case 'row-del':
        updateElement(t.id, tableDeleteRow(t, tableSel.r0));
        clearTableSelection();
        break;
      case 'col-del':
        updateElement(t.id, tableDeleteColumn(t, tableSel.c0));
        clearTableSelection();
        break;
      case 'merge':
        updateElement(t.id, tableMergeRange(t, tableSel.r0, tableSel.c0, tableSel.r1, tableSel.c1));
        break;
      case 'unmerge':
        updateElement(t.id, tableUnmerge(t, tableSel.r0, tableSel.c0));
        break;
    }
    showIfTableSelection();
  });

  // Initial state
  showIfTableSelection();
})();
// pure ops for resize/distribute/bg/borders
function tableResizeRows(t, range, delta){ t = clone(t); const {r0=0,r1=t.rows-1}=range; for (let r=r0;r<=r1;r++){ t.rowHeights[r] = Math.max(10, (t.rowHeights[r]||40) + delta); } return t; }
function tableResizeCols(t, range, delta){ t = clone(t); const {c0=0,c1=t.cols-1}=range; for (let c=c0;c<=c1;c++){ t.colWidths[c] = Math.max(10, (t.colWidths[c]||100) + delta); } return t; }
function tableDistributeRows(t, range){ t = clone(t); const {r0=0,r1=t.rows-1}=range; const n=r1-r0+1; const sum=t.rowHeights.slice(r0,r1+1).reduce((a,b)=>a+b,0); const avg=Math.round(sum/n); for (let r=r0;r<=r1;r++) t.rowHeights[r]=avg; return t; }
function tableDistributeCols(t, range){ t = clone(t); const {c0=0,c1=t.cols-1}=range; const n=c1-c0+1; const sum=t.colWidths.slice(c0,c1+1).reduce((a,b)=>a+b,0); const avg=Math.round(sum/n); for (let c=c0;c<=c1;c++) t.colWidths[c]=avg; return t; }
function tableApplyCellBg(t, range, color){ t = clone(t); const {r0,c0,r1,c1}=range; for (let r=r0;r<=r1;r++){ for (let c=c0;c<=c1;c++){ const id=t.grid[r][c]; const cell=t.cells[id]; if (cell.hidden) continue; cell.styles.bg = color; } } return t; }
function tableApplyBorders(t, range, mode, color, width){
  t = clone(t); const {r0,c0,r1,c1}=range;
  const inRange = (rr,cc)=> rr>=r0&&rr<=r1&&cc>=c0&&cc<=c1;
  // Initialize borders container
  for (let r=r0;r<=r1;r++){
    for (let c=c0;c<=c1;c++){
      const id=t.grid[r][c]; const cell=t.cells[id]; if (!cell || cell.hidden) continue;
      if (!cell.styles.borders) cell.styles.borders = {top:false,right:false,bottom:false,left:false};
    }
  }
  // Helper to set border on a side and its neighbor to keep seams aligned
  function setEdge(rr, cc, side, on){
    const id=t.grid[rr][cc]; const cell=t.cells[id]; if (!cell || cell.hidden) return;
    cell.styles.borderColor = color; cell.styles.borderWidth = width;
    if (!cell.styles.borders) cell.styles.borders = {top:false,right:false,bottom:false,left:false};
    cell.styles.borders[side] = on;
    // Mirror on neighbor
    let nr=rr, nc=cc, nside=null;
    if (side==='top'){ nr=rr-1; nc=cc; nside='bottom'; }
    if (side==='bottom'){ nr=rr+1; nc=cc; nside='top'; }
    if (side==='left'){ nr=rr; nc=cc-1; nside='right'; }
    if (side==='right'){ nr=rr; nc=cc+1; nside='left'; }
    if (inRange(nr,nc)){
      const nid=t.grid[nr][nc]; const ncell=t.cells[nid]; if (ncell && !ncell.hidden){
        if (!ncell.styles.borders) ncell.styles.borders = {top:false,right:false,bottom:false,left:false};
        ncell.styles.borderColor = color; ncell.styles.borderWidth = width;
        ncell.styles.borders[nside] = on;
      }
    }
  }
  // Clear current in-range borders when mode is not additive
  const clearAll = ()=>{
    for (let r=r0;r<=r1;r++) for (let c=c0;c<=c1;c++){
      const id=t.grid[r][c]; const cell=t.cells[id]; if (!cell || cell.hidden) continue;
      cell.styles.borderColor = color; cell.styles.borderWidth = width;
      cell.styles.borders = {top:false,right:false,bottom:false,left:false};
    }
  };
  if (mode==='none'){ clearAll(); return t; }
  clearAll();
  if (mode==='all'){
    for (let r=r0;r<=r1;r++) for (let c=c0;c<=c1;c++){
      setEdge(r,c,'top',true); setEdge(r,c,'right',true); setEdge(r,c,'bottom',true); setEdge(r,c,'left',true);
    }
  } else if (mode==='outer'){
    for (let r=r0;r<=r1;r++){
      for (let c=c0;c<=c1;c++){
        if (r===r0) setEdge(r,c,'top',true);
        if (r===r1) setEdge(r,c,'bottom',true);
        if (c===c0) setEdge(r,c,'left',true);
        if (c===c1) setEdge(r,c,'right',true);
      }
    }
  } else if (mode==='inner'){
    for (let r=r0;r<=r1;r++){
      for (let c=c0;c<=c1;c++){
        if (r<r1) setEdge(r,c,'bottom',true);
        if (c<c1) setEdge(r,c,'right',true);
      }
    }
  } else if (['top','right','bottom','left'].includes(mode)){
    for (let r=r0;r<=r1;r++) for (let c=c0;c<=c1;c++) setEdge(r,c,mode,true);
  }
  return t;
}

// Apply per-cell text color
function tableApplyTextColor(t, range, color){
  t = clone(t); const {r0,c0,r1,c1}=range;
  for (let r=r0;r<=r1;r++){
    for (let c=c0;c<=c1;c++){
      const id=t.grid[r][c]; const cell=t.cells[id]; if (cell.hidden) continue;
      cell.styles.textColor = color;
    }
  }
  return t;
}

// Apply per-cell alignment (pass undefined to leave as-is)
function tableApplyAlign(t, range, alignH, alignV){
  t = clone(t); const {r0,c0,r1,c1}=range;
  for (let r=r0;r<=r1;r++){
    for (let c=c0;c<=c1;c++){
      const id=t.grid[r][c]; const cell=t.cells[id]; if (cell.hidden) continue;
      if (alignH) cell.styles.alignH = alignH;
      if (alignV) cell.styles.alignV = alignV;
    }
  }
  return t;
}

// Generic per-cell style applier for a table selection
function tableApplyCellStyle(t, range, styleKey, value){
  t = clone(t); const {r0,c0,r1,c1}=range;
  for (let r=r0;r<=r1;r++){
    for (let c=c0;c<=c1;c++){
      const id=t.grid[r][c]; const cell=t.cells[id]; if (cell.hidden) continue;
      cell.styles[styleKey] = value;
      // If user adjusts stroke properties but borders are missing/disabled, enable all sides for visibility
      if ((styleKey === 'strokeColor' || styleKey === 'strokeWidth')){
        const sides = cell.styles.borders;
        const hasAny = sides && (sides.top || sides.right || sides.bottom || sides.left);
        if (!hasAny) cell.styles.borders = { top:true, right:true, bottom:true, left:true };
      }
    }
  }
  return t;
}

function tableAnyCellStyleOff(t, range, styleKey){
  const {r0,c0,r1,c1}=range;
  for (let r=r0;r<=r1;r++){
    for (let c=c0;c<=c1;c++){
      const id=t.grid[r][c]; const cell=t.cells[id]; if (cell.hidden) continue;
      if (!cell.styles[styleKey]) return true;
    }
  }
  return false;
}

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
  const active = drag || resize;
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



async function exportPdf({ filename = 'myfile.pdf', dpi = 600, orientation = 'portrait' } = {}) {
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

  // Use exact DOM pixel size to avoid mm→px rounding drift
  const rect = page.getBoundingClientRect();
  const widthPx = Math.round(rect.width);
  const heightPx = Math.round(rect.height);
  // Prefer integer render scales to reduce sub-pixel rounding artifacts
  const scale = Math.max(1, Math.round(dpi / 96));

  // Ensure web fonts are fully loaded to avoid reflow during capture
  try { if (document.fonts && document.fonts.ready) { await document.fonts.ready; } } catch {}

  const opt = {
    margin: 0,
    filename,
    image: { type: 'jpeg', quality: 1 },
    // html2canvas scale determines print DPI (96 CSS px = 1")
    html2canvas: { scale, useCORS: true, backgroundColor: '#ffffff' },
    // Match PDF page size to the live DOM size in pixels for 1:1 layout
    jsPDF: { unit: 'px', format: [widthPx, heightPx], orientation },
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

function showExportInstructions() {
  const data = serializeDocument().replaceAll('<','&lt;');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Certificate Maker - Export Instructions</title>
  <style>
    body { font-family: system-ui; padding: 40px; max-width: 700px; margin: 0 auto; line-height: 1.6; }
    h1 { color: #E10600; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }
    pre { background: #f8f9fa; padding: 15px; border-radius: 8px; overflow: auto; font-size: 12px; border: 1px solid #e9ecef; }
    .step { background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 20px; margin: 15px 0; }
  </style>
</head>
<body>
  <h1>📄 Certificate Maker Export</h1>
  
  <div class="step">
    <h3>🔧 Step 1: Run the Helper Script</h3>
    <p>In your terminal/command prompt, run:</p>
    <code>python helper.py</code>
    <p>This creates a <code>combined.html</code> file with everything included.</p>
  </div>
  
  <div class="step">
    <h3>💾 Step 2: Get Your Complete File</h3>
    <p>The <code>combined.html</code> file contains:</p>
    <ul>
      <li>✅ All HTML structure</li>
      <li>✅ All CSS styles embedded</li>
      <li>✅ All JavaScript functionality embedded</li>
      <li>✅ No external dependencies (except CDN libraries)</li>
    </ul>
  </div>
  
  <p><strong>Current Document Data:</strong></p>
  <pre>${data}</pre>
</body>
</html>`;
  
  download('certificate-maker-export-instructions.html', html);
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
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrap();
  initializePanelControls();
  initializeCustomColorPicker();
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = APP_VERSION;
});




