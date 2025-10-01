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
