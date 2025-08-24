// editor.tables.js
// Extracted from script.js on 2025-08-20T18:47:33.901424Z
// Range: [10684:53602] bytes

/* ===================== Table: model, pure ops, rendering, selection, commands ===================== */
// ----- utils -----
const clone = (obj) => JSON.parse(JSON.stringify(obj));
function generateCellId(tableId, r, c){
  // Deterministic, simple id aligned with element data-id scheme
  return `${tableId}_${r}x${c}`;
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
      cells[cid] = { id: cid, row:r, col:c, rowSpan:1, colSpan:1, hidden:false, content: "", styles: { alignH:'left', alignV:'top', padding:8, bg:null, borders:{ top:true,right:true,bottom:true,left:true } }, attrs: {} };
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
  // Clone height from the row above (or the first row when inserting at 0)
  const srcRowForHeight = at > 0 ? at - 1 : 0;
  const insertRowHeight = Number.isFinite(rowHeights[srcRowForHeight]) ? rowHeights[srcRowForHeight] : 40;
  rowHeights.splice(at, 0, insertRowHeight);

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
        // Determine source row for style cloning: prefer row above, otherwise the first row
        const srcR = at > 0 ? at - 1 : 0;
        const srcId = t.grid[srcR]?.[c];
        const srcCell = srcId ? t.cells[srcId] : null;
        const defaultStyles = { alignH:'left', alignV:'top', padding:8, bg:null, borders:{ top:true, right:true, bottom:true, left:true } };
        const clonedStyles = srcCell && srcCell.styles ? clone(srcCell.styles) : defaultStyles;
        const clonedAttrs = srcCell && srcCell.attrs ? clone(srcCell.attrs) : {};
        cells[cid] = {
          id: cid, row: at, col: c,
          rowSpan: 1, colSpan: 1, hidden: false,
          content: "", styles: clonedStyles, attrs: clonedAttrs
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
  // Clone width from the column to the left (or the first column when inserting at 0)
  const srcColForWidth = at > 0 ? at - 1 : 0;
  const insertColWidth = Number.isFinite(colWidths[srcColForWidth]) ? colWidths[srcColForWidth] : 100;
  colWidths.splice(at, 0, insertColWidth);

  const cells = clone(t.cells);
  const newGrid = [];
  const newlyCreated = new Set();

  for (let r = 0; r < t.rows; r++) {
    const row = [];
    for (let c = 0; c <= t.cols; c++) {
      if (c === at) {
        const cid = generateCellId(t.id, r, at);
        // Determine source column for style cloning: prefer column to the left, otherwise the first column
        const srcC = at > 0 ? at - 1 : 0;
        const srcId = t.grid[r]?.[srcC];
        const srcCell = srcId ? t.cells[srcId] : null;
        const defaultStyles = { alignH:'left', alignV:'top', padding:8, bg:null, borders:{ top:true, right:true, bottom:true, left:true } };
        const clonedStyles = srcCell && srcCell.styles ? clone(srcCell.styles) : defaultStyles;
        const clonedAttrs = srcCell && srcCell.attrs ? clone(srcCell.attrs) : {};
        cells[cid] = {
          id: cid, row: r, col: at,
          rowSpan: 1, colSpan: 1, hidden: false,
          content: "", styles: clonedStyles, attrs: clonedAttrs
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
function tableSplitAnchor(t, r, c){ const id = t.grid[r][c]; const cell = t.cells[id]; if (!cell) return t; if (cell.rowSpan===1 && cell.colSpan===1) return t; const {row, col, rowSpan, colSpan} = cell; for (let rr=row; rr<row+rowSpan; rr++){ for (let cc=col; cc<col+colSpan; cc++){ const cid = (rr===row && cc===col) ? id : generateCellId(t.id, rr, cc); if (!t.cells[cid]) t.cells[cid] = { id:cid, row:rr, col:cc, rowSpan:1, colSpan:1, hidden:false, content:"", styles:clone(cell.styles), attrs: clone(cell.attrs||{}) }; t.grid[rr][cc] = cid; t.cells[cid].hidden = false; t.cells[cid].rowSpan = 1; t.cells[cid].colSpan = 1; } } cell.rowSpan = 1; cell.colSpan = 1; return t; }
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
      const div = document.createElement('div'); div.className = 'table-cell'; div.dataset.tableId = elModel.id; div.dataset.r = r; div.dataset.c = c; div.dataset.id = `${elModel.id}_${r}x${c}`;
      div.setAttribute('role', 'gridcell');
      div.setAttribute('aria-rowindex', String(r+1));
      div.setAttribute('aria-colindex', String(c+1));
      div.setAttribute('aria-selected', 'false');
      // Roving tabindex: active cell focusable, others -1
      const isActive = tableSel ? (tableSel.tableId===elModel.id && r===Math.min(tableSel.r0, tableSel.r1) && c===Math.min(tableSel.c0, tableSel.c1)) : (r===0 && c===0);
      div.tabIndex = isActive ? 0 : -1;
      div.style.gridColumn = `span ${cell.colSpan}`; div.style.gridRow = `span ${cell.rowSpan}`;
      // Apply per-cell attributes (including inline event handlers like onclick)
      try {
        const attrs = cell.attrs || {};
        Object.keys(attrs).forEach((name) => {
          const val = attrs[name];
          if (val === false || val == null || val === '') div.removeAttribute(name);
          else if (val === true) div.setAttribute(name, '');
          else div.setAttribute(name, String(val));
        });
      } catch {}
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
      // Always start from the latest model on the page to avoid reverting x/y (position) or other props
      const page = getCurrentPage();
      const idx = page.elements.findIndex(e => e.id === elModel.id);
      const current = idx !== -1 ? page.elements[idx] : elModel;
      const T = clone(current);
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
      if (idx !== -1) page.elements[idx] = T; else {
        // If element wasn't found (shouldn't happen), bail gracefully
        return;
      }
      renderPage(page);
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
    // Ignore clicks inside side panels (elements/properties)
    const propsPanel = document.getElementById('propertiesPanel');
    if (propsPanel && propsPanel.contains && propsPanel.contains(t)) return;
    const elsPanel = document.getElementById('elementsPanel');
    if (elsPanel && elsPanel.contains && elsPanel.contains(t)) return;
    const tblMenu = document.getElementById('tableActions');
    if (tblMenu && tblMenu.contains(t)) return;
    const bubble = elementActions && elementActions();
    if (bubble && bubble.contains && bubble.contains(t)) return;
    const selBox = selectionBoxEl && selectionBoxEl();
    if (selBox && selBox.contains && selBox.contains(t)) return;
    // Ignore clicks within custom color picker
    const colorPicker = document.querySelector('.custom-color-picker');
    if (colorPicker && colorPicker.contains && colorPicker.contains(t)) return;
    // Ignore while in picking mode
    if (window.__PICKING) return;
    clearTableSelection();
    document.removeEventListener('mousedown', onDocClick);
  };
  setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
}
function applyCellStyles(div, cell) {
  const h = cell.styles.alignH || 'left'; const v = cell.styles.alignV || 'top';
  div.style.justifyContent = h==='left' ? 'flex-start' : (h==='center' ? 'center' : 'flex-end');
  div.style.alignItems = v==='top' ? 'flex-start' : (v==='middle' ? 'center' : 'flex-end');
  // Ensure wrapped text inside cells follows horizontal alignment
  div.style.textAlign = h==='left' ? 'left' : (h==='center' ? 'center' : 'right');
  div.style.padding = (cell.styles.padding ?? 8) + 'px';
  if (cell.styles.bg) div.style.background = cell.styles.bg;
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
  
  // Normalize selection so ranges work regardless of drag direction
  const rr0 = Math.min(r0, (r1 ?? r0));
  const cc0 = Math.min(c0, (c1 ?? c0));
  const rr1 = Math.max(r0, (r1 ?? r0));
  const cc1 = Math.max(c0, (c1 ?? c0));
  
  tableSel = { tableId, r0: rr0, c0: cc0, r1: rr1, c1: cc1 }; 
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
  // Remove selection overlay if present
  document.querySelectorAll('.table-selection').forEach(n=> n.remove());
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
  // Draw single overlay rectangle around the selected range (handles merged cells)
  const grid = tNode.querySelector('.table-grid');
  if (grid){
    // Remove any existing selection overlays for this table
    grid.querySelectorAll(':scope > .table-selection').forEach(n=> n.remove());
    // Compute bounding box of selection using anchor cell DOM rects
    const a = grid.querySelector(`.table-cell[data-r="${r0}"][data-c="${c0}"]`);
    const b = grid.querySelector(`.table-cell[data-r="${r1}"][data-c="${c1}"]`);
    if (a && b){
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const rg = grid.getBoundingClientRect();
      const z = getZoom();
      // Work in viewport (transformed) pixels, then convert to unscaled CSS pixels
      const leftV = Math.min(ra.left, rb.left) - rg.left;
      const topV = Math.min(ra.top, rb.top) - rg.top;
      const rightV = Math.max(ra.right, rb.right) - rg.left;
      const bottomV = Math.max(ra.bottom, rb.bottom) - rg.top;
      const sel = document.createElement('div');
      sel.className = 'table-selection';
      sel.style.left = (leftV / z) + 'px';
      sel.style.top = (topV / z) + 'px';
      sel.style.width = ((rightV - leftV) / z) + 'px';
      sel.style.height = ((bottomV - topV) / z) + 'px';
      const handle = document.createElement('div'); handle.className = 'handle'; sel.appendChild(handle);
      grid.appendChild(sel);
    }
  }
  const sr = document.getElementById('srAnnouncer'); if (sr){ sr.textContent = `Selected ${r1-r0+1} by ${c1-c0+1} cells.`; }
  // Reflect anchor cell styles in toolbar every time selection changes
  const tModel = getElementById(tableSel.tableId);
  if (tModel) syncFormatToolbar(tModel);
  // Update Properties panel for cellId
  renderProperties();
}
function onTableCellMouseDown(e){
  // Do not alter selection while picker mode is active
  if (window.__PICKING) { e.preventDefault(); e.stopPropagation(); return; }
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
    // Fire a synthetic change event so inline onchange handlers on the cell can react after commit
    try {
      const evt = new Event('change', { bubbles: true });
      div.dispatchEvent(evt);
      // Also provide a custom event with details for power users
      const cust = new CustomEvent('cellchange', { bubbles: true, detail: { tableId, r, c, value: text } });
      div.dispatchEvent(cust);
    } catch {}
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
  return t; // preserve all spaces and trailing whitespace per user request
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

/** Clear text content in all cells within [r0..r1] x [c0..c1] (anchors only). */
function tableClearRangeContent(t, r0, c0, r1, c1) {
  t = clone(t);
  const rr0 = Math.min(r0, r1), rr1 = Math.max(r0, r1);
  const cc0 = Math.min(c0, c1), cc1 = Math.max(c0, c1);
  for (let r = rr0; r <= rr1; r++) {
    for (let c = cc0; c <= cc1; c++) {
      const id = t.grid[r][c];
      const cell = t.cells[id];
      if (!cell || cell.hidden) continue;
      if (cell.row === r && cell.col === c) {
        cell.content = "";
      }
    }
  }
  return t;
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
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      e.stopPropagation();
      updateElement(tableId, tableClearRangeContent(t, r0, c0, r1, c1));
      // Preserve current selection after update
      setTableSelection(tableId, r0, c0, r1, c1);
      break;
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

