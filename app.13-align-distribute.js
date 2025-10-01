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
