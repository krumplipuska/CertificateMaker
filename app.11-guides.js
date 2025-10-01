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

// Decide whether an element should repeat on all pages based on its
// current bounds intersecting the header or footer guide regions.
function shouldRepeatForHeaderFooter(m){
  try {
    const headerH = Number(Model?.document?.headerHeight || 0);
    const footerH = Number(Model?.document?.footerHeight || 0);
    const pageNode = getPageNode();
    if (!pageNode) return false;
    const pageH = Number(pageNode.clientHeight || 0);
    const b = getBoundsForModel(m);
    const overlapsHeader = b.y < headerH;
    const overlapsFooter = (b.y + b.h) > (pageH - footerH);
    return overlapsHeader || overlapsFooter;
  } catch { return false; }
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

