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
        // Recalculate all formulas and re-render all pages because the change may be off the current page
        try { if (typeof window.recalculateAllFormulas === 'function') window.recalculateAllFormulas(); } catch {}
        try { if (Model && Model.document && Array.isArray(Model.document.pages)) { Model.document.pages.forEach((p)=>{ try { renderPage(p); } catch {} }); } } catch {}
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
    try { if (typeof window.recalculateAllFormulas === 'function') window.recalculateAllFormulas(); } catch {}
    try { if (Model && Model.document && Array.isArray(Model.document.pages)) { Model.document.pages.forEach((p)=>{ try { renderPage(p); } catch {} }); } } catch {}
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
  try { if (typeof window.recalculateAllFormulas === 'function') window.recalculateAllFormulas(); } catch {}
  try { if (Model && Model.document && Array.isArray(Model.document.pages)) { Model.document.pages.forEach((p)=>{ try { renderPage(p); } catch {} }); } } catch {}
  
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

