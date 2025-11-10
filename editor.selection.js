// editor.selection.js
// Extracted from script.js on 2025-08-20T18:47:33.901424Z
// Range: [5800:10684] bytes

/* ----------------------- Selection (multi-select) ----------------------- */
let selectedIds = new Set();

// Helper function to check if an element is locked
function isElementLocked(id) {
  if (!id) return false;
  try {
    const model = getElementById(id);
    if (!model || !model.attrs) return false;
    return model.attrs.locked === true || model.attrs.locked === 'true';
  } catch {
    return false;
  }
}

// Filter out locked elements from an array of IDs
function filterLockedElements(ids) {
  return (ids || []).filter(id => !isElementLocked(id));
}

function clearSelection(){ 
  selectedIds.clear(); 
  //console.log('[SELECTION] clear');
  // If a canvas text/field/cell is currently being edited, stop editing as well
  try {
    const active = document.activeElement;
    const isEditable = !!(active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'));
    const isInCanvas = !!(isEditable && active && active.closest && (active.closest('.page') || active.classList.contains('table-cell')));
    if (isInCanvas) { active.blur(); }
  } catch {}
  clearTableSelection(); 
  updateSelectionUI(); 
}
function setSelection(ids){ 
  // Filter out locked elements before setting selection
  const filteredIds = filterLockedElements((ids||[]).filter(Boolean));
  selectedIds = new Set(filteredIds);
  //console.log('[SELECTION] set', Array.from(selectedIds));
  // Note: We no longer automatically clear table selection when selecting elements
  // This allows for multiple selections across different tables
  updateSelectionUI(); 
}

// Allow selecting locked elements (used for right-click context menu)
function setSelectionAllowLocked(ids){ 
  // Don't filter out locked elements - allow them to be selected
  selectedIds = new Set((ids||[]).filter(Boolean));
  //console.log('[SELECTION] setAllowLocked', Array.from(selectedIds));
  updateSelectionUI(); 
}
function addToSelection(id){ 
  if (!id || isElementLocked(id)) return; 
  selectedIds.add(id); 
  //console.log('[SELECTION] add', id, '→', Array.from(selectedIds));
  // Note: We no longer automatically clear table selection when adding elements
  // This allows for multiple selections across different tables
  updateSelectionUI(); 
}
function toggleSelection(id){ 
  if (!id || isElementLocked(id)) return; 
  selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id); 
  //console.log('[SELECTION] toggle', id, '→', Array.from(selectedIds));
  // Note: We no longer automatically clear table selection when toggling elements
  // This allows for multiple selections across different tables
  updateSelectionUI(); 
}
function isSelected(id){ return selectedIds.has(id); }

// Toggle lock/unlock state for selected elements
function toggleLockSelection() {
  if (selectedIds.size === 0) return;
  commitHistory('lock-toggle');
  const ids = Array.from(selectedIds);
  let allLocked = true;
  
  // Check if all selected elements are locked
  ids.forEach(id => {
    if (!isElementLocked(id)) {
      allLocked = false;
    }
  });
  
  const newLockState = !allLocked;
  const unlockedAfterToggle = [];
  
  // Toggle lock state for all selected elements
  ids.forEach(id => {
    const model = getElementById(id);
    if (!model) return;
    if (!model.attrs) model.attrs = {};
    model.attrs.locked = newLockState;
    updateElement(id, { attrs: model.attrs });
    // Track which elements will be unlocked after this toggle
    if (!newLockState) {
      unlockedAfterToggle.push(id);
    }
  });
  
  // If unlocking, keep unlocked elements selected; if locking, remove them from selection
  if (newLockState) {
    // Locking: remove locked elements from selection
    const unlockedIds = ids.filter(id => !isElementLocked(id));
    if (unlockedIds.length === 0) {
      clearSelection();
    } else {
      setSelection(unlockedIds);
    }
  } else {
    // Unlocking: keep the unlocked elements selected
    setSelectionAllowLocked(unlockedAfterToggle.length > 0 ? unlockedAfterToggle : ids);
  }
  
  renderAll();
}

function updateSelectionUI(){
  //console.log('[SELECTION] updateUI size=', selectedIds.size);
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
  if (typeof window.applyTextOverflowButtonState === 'function') window.applyTextOverflowButtonState();
  // keep properties panel in sync
  renderProperties();
  // update group toggle state
  if (typeof updateGroupToggleButton === 'function') updateGroupToggleButton();
  // Update lock button icon based on selection state
  updateLockButtonIcon();
  // NEW: keep the action bubble in sync with selection
  positionElementActions();
}

// Update lock button icon based on selection state
function updateLockButtonIcon() {
  const lockBtn = document.querySelector('[data-action="lock-toggle"]');
  if (!lockBtn) return;
  
  const lockIcon = lockBtn.querySelector('.lock-icon');
  const unlockIcon = lockBtn.querySelector('.unlock-icon');
  if (!lockIcon || !unlockIcon) return;
  
  if (selectedIds.size === 0) {
    // No selection: show unlock icon (default state)
    lockIcon.style.display = 'none';
    unlockIcon.style.display = 'block';
    lockBtn.title = 'Lock/Unlock';
  } else {
    // Check if all selected elements are locked
    const ids = Array.from(selectedIds);
    const allLocked = ids.length > 0 && ids.every(id => isElementLocked(id));
    
    if (allLocked) {
      lockIcon.style.display = 'block';
      unlockIcon.style.display = 'none';
      lockBtn.title = 'Unlock';
    } else {
      lockIcon.style.display = 'none';
      unlockIcon.style.display = 'block';
      lockBtn.title = 'Lock';
    }
  }
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

  if (selectedIds.size === 1) {
    // Single element: use current behavior
    const firstId = [...selectedIds][0];
    const el = document.querySelector(`.page .element[data-id="${firstId}"]`);
    if (!el) { bubble.classList.add('hidden'); return; }
    const r = el.getBoundingClientRect();
    bubble.style.left = (r.left + r.width / 2) + 'px';
    bubble.style.top = (r.top - 8) + 'px';
  } else {
    // Multiple elements: position above the selection bounds center
    const bounds = getSelectionBounds();
    if (!bounds) { bubble.classList.add('hidden'); return; }
    const page = getPageNode();
    if (!page) { bubble.classList.add('hidden'); return; }
    const pr = page.getBoundingClientRect();
    const z = getZoom();
    const cx = pr.left + (bounds.x + bounds.w / 2) * z;
    const cy = pr.top + bounds.y * z - 8;
    bubble.style.left = cx + 'px';
    bubble.style.top = cy + 'px';
  }

  bubble.classList.remove('hidden');
  // Mark the moment of this reposition so clicks immediately following
  // a selection change don't trigger the actions dropdown unintentionally
  bubble.setAttribute('data-shown-at', String(Date.now()));
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
  // Nudge table actions to follow the bubble/selection
  try { if (typeof window.positionTableActions === 'function') window.positionTableActions(); } catch {}
}

// Re-align viewport overlays (selection box + action bubble) once per frame
let __alignReq = null;
function alignOverlays() {
  if (__alignReq) return;
  __alignReq = requestAnimationFrame(() => {
    __alignReq = null;
    updateSelectionBox();
    positionElementActions();
    try { if (typeof window.positionTableActions === 'function') window.positionTableActions(); } catch {}
  });
}

