/* -------- Selection resize helpers (multi) -------- */
function startSelectionResize(handle, event){
  if (selectedIds.size === 0) return;
  const startBounds = getSelectionBounds(); if (!startBounds) return;
  const pageNode = getPageNode();
  const pt = getCanvasPoint(event, pageNode);
  const starts = new Map();
  [...selectedIds].forEach(id => starts.set(id, deepClone(getElementById(id))));
  try { elementActions().classList.add('hidden'); } catch {}
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

