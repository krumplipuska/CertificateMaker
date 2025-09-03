// editor.selection.js
// Extracted from script.js on 2025-08-20T18:47:33.901424Z
// Range: [5800:10684] bytes

/* ----------------------- Selection (multi-select) ----------------------- */
let selectedIds = new Set();

function clearSelection(){ 
  selectedIds.clear(); 
  console.log('[SELECTION] clear');
  clearTableSelection(); 
  updateSelectionUI(); 
}
function setSelection(ids){ 
  selectedIds = new Set((ids||[]).filter(Boolean)); 
  console.log('[SELECTION] set', Array.from(selectedIds));
  // Clear table selection unless we're selecting the same table that has active cell selection
  if (tableSel && (selectedIds.size !== 1 || !selectedIds.has(tableSel.tableId))) {
    clearTableSelection();
  }
  updateSelectionUI(); 
}
function addToSelection(id){ 
  if (!id) return; 
  selectedIds.add(id); 
  console.log('[SELECTION] add', id, '→', Array.from(selectedIds));
  // Clear table selection when adding non-table elements or different tables
  if (tableSel && (!selectedIds.has(tableSel.tableId) || selectedIds.size > 1)) {
    clearTableSelection();
  }
  updateSelectionUI(); 
}
function toggleSelection(id){ 
  if (!id) return; 
  selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id); 
  console.log('[SELECTION] toggle', id, '→', Array.from(selectedIds));
  // Clear table selection when toggling creates a multi-selection or removes the table
  if (tableSel && (!selectedIds.has(tableSel.tableId) || selectedIds.size > 1)) {
    clearTableSelection();
  }
  updateSelectionUI(); 
}
function isSelected(id){ return selectedIds.has(id); }

function updateSelectionUI(){
  console.log('[SELECTION] updateUI size=', selectedIds.size);
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
      bar.querySelectorAll('[data-prop]').forEach(i => {
        // Avoid assigning empty string to color inputs to prevent format warnings
        if (i.type === 'color') return;
        if (i.type !== 'range' && i.type !== 'number') i.value = '';
      });
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

