/* ----------------------- Guides ----------------------- */
function getGuidesNodes(pageNode = getPageNode()) {
  const page = pageNode; if (!page) return {};
  return {
    v: page.querySelector('.guide.v'),
    h: page.querySelector('.guide.h'),
    gapH: (function(){ let n = page.querySelector('.smart-gap-line.h'); if (!n){ n = document.createElement('div'); n.className = 'smart-gap-line h hidden'; page.appendChild(n);} return n; })(),
    gapV: (function(){ let n = page.querySelector('.smart-gap-line.v'); if (!n){ n = document.createElement('div'); n.className = 'smart-gap-line v hidden'; page.appendChild(n);} return n; })(),
    gapWrap: (function(){ let n = page.querySelector('.gap-badges'); if (!n){ n = document.createElement('div'); n.className = 'gap-badges'; n.style.position='absolute'; n.style.left='0'; n.style.top='0'; n.style.right='0'; n.style.bottom='0'; n.style.pointerEvents='none'; page.appendChild(n);} return n; })(),
    rect: page.getBoundingClientRect(),
  };
}

function hideGuides(){
  const { v, h, gapH, gapV, gapWrap } = getGuidesNodes();
  if (v) v.classList.add('hidden');
  if (h) h.classList.add('hidden');
  try { if (gapH) gapH.classList.add('hidden'); } catch{}
  try { if (gapV) gapV.classList.add('hidden'); } catch{}
  try { if (gapWrap){ while (gapWrap.firstChild) gapWrap.removeChild(gapWrap.firstChild); } } catch{}
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
  // Pattern-aware spacing snap (rows/columns with equal gap)
  const ps = computePatternSnap({ x: outX, y: outY, w: b.w, h: b.h }, excludeIds, options);
  if (ps){
    outX = ps.x ?? outX; outY = ps.y ?? outY;
    try { Controller.smartGap = ps.visual; } catch{}
  } else {
    try { Controller.smartGap = null; } catch{}
  }
  return { x: outX, y: outY, w: b.w, h: b.h };
}
function showGuidesForBounds(b, pageNode){
  if (typeof GUIDES_ENABLED !== 'undefined' && !GUIDES_ENABLED) { hideGuides(); return; }
  const { v, h, gapH, gapV, gapWrap } = getGuidesNodes(pageNode); if (!v || !h) return;
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

  // Render smart gap visuals if present
  try {
    const vis = Controller.smartGap; const BADGE_TOL = Math.max(4, (vis?.gap||0) * 0.2);
    // Always hide any special lines; only badges near existing guides
    try { gapH.classList.add('hidden'); gapV.classList.add('hidden'); } catch{}
    if (!vis || !Array.isArray(vis.items) || vis.items.length < 2){
      if (gapWrap){ while (gapWrap.firstChild) gapWrap.removeChild(gapWrap.firstChild); }
    } else {
      let items = vis.items.slice();
      // Deduplicate nearly identical items to avoid double badges
      const uniq = [];
      const isSame = (p,q) => Math.abs(p.x-q.x) < 0.5 && Math.abs(p.y-q.y) < 0.5 && Math.abs((p.w||0)-(q.w||0)) < 0.5 && Math.abs((p.h||0)-(q.h||0)) < 0.5;
      items.forEach(it => { if (!uniq.some(u => isSame(u,it))) uniq.push(it); });
      items = uniq.sort((a,b)=> vis.orientation==='v' ? (a.y - b.y) : (a.x - b.x));
      if (gapWrap){ while (gapWrap.firstChild) gapWrap.removeChild(gapWrap.firstChild); }
      for (let i=0;i<items.length-1;i++){
        const a = items[i], c = items[i+1];
        const gap = vis.orientation==='v' ? (c.y - (a.y + a.h)) : (c.x - (a.x + a.w));
        if (!Number.isFinite(gap) || gap < 0) continue;
        if (Math.abs(gap - vis.gap) > BADGE_TOL) continue;
        const badge = document.createElement('div');
        badge.className = 'gap-badge';
        badge.textContent = String(Math.round(vis.gap));
        if (vis.orientation==='v'){
          // place next to the vertical guide (vx)
          badge.style.left = (vx + 6) + 'px';
          badge.style.top = (a.y + a.h + gap/2 - 8) + 'px';
        } else {
          // place next to the horizontal guide (vy)
          badge.style.left = (a.x + a.w + gap/2 - 10) + 'px';
          badge.style.top = (vy + 6) + 'px';
        }
        gapWrap.appendChild(badge);
      }
    }
  } catch{}
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

/* --------------------- Pattern-aware smart spacing --------------------- */
const PATTERN_ALIGN_TOL = 8;   // px tolerance for being in the same row/column
const PATTERN_SIZE_TOL  = 14;  // acceptable difference in size when grouping
const GAP_SNAP_TOL      = 10;  // distance to snap to the equal gap

function approxEqual(a, b, tol){ return Math.abs((a||0) - (b||0)) <= (tol||0); }
function quantize(v, q){ return Math.round((v||0) / (q||1)); }
function median(arr){ if (!arr || !arr.length) return 0; const a = arr.slice().sort((x,y)=>x-y); const m = Math.floor(a.length/2); return (a.length % 2) ? a[m] : (a[m-1]+a[m])/2; }

function collectVisibleElements(excludeIds){
  const page = getCurrentPage(); if (!page) return [];
  const hidden = (el) => {
    try { const a = el?.attrs||{}; if (a.hidden===true||a.hidden==='true') return true; if (/display\s*:\s*none/i.test(String(a.style||''))) return true; } catch{}
    return false;
  };
  return (page.elements||[]).filter(e => e && !excludeIds.includes(e.id) && !hidden(e));
}

function buildColumnPatterns(excludeIds){
  const els = collectVisibleElements(excludeIds).map(e => ({ e, b: getBoundsForModel(e) }));
  const buckets = new Map();
  els.forEach(({e,b}) => {
    const keys = [ b.x, b.x + b.w/2, b.x + b.w ];
    keys.forEach(k => {
      const key = 'x:' + quantize(k, PATTERN_ALIGN_TOL);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ e, b, axis: k });
    });
  });
  const patterns = [];
  buckets.forEach(items => {
    if (items.length < 2) return;
    items.sort((a,b)=> (a.b.y - b.b.y));
    const similar = items; // allow mixed sizes and types; only alignment matters
    const gaps = [];
    for (let i=0;i<similar.length-1;i++){ gaps.push(similar[i+1].b.y - (similar[i].b.y + similar[i].b.h)); }
    const validGaps = gaps.filter(g=>Number.isFinite(g) && g>=0);
    if (validGaps.length < 1) return;
    const gAvg = validGaps.reduce((s,v)=>s+v,0)/validGaps.length;
    const gVar = validGaps.reduce((s,v)=>s+Math.abs(v-gAvg),0)/validGaps.length;
    if (gVar > Math.max(2, gAvg*0.15)) return; // too irregular
    const axisCoord = median(similar.map(o => o.axis));
    patterns.push({ orientation:'v', items: similar.map(o=>o.b), gap:gAvg, axis:'x', axisCoord });
  });
  return patterns;
}

function buildRowPatterns(excludeIds){
  const els = collectVisibleElements(excludeIds).map(e => ({ e, b: getBoundsForModel(e) }));
  const buckets = new Map();
  els.forEach(({e,b}) => {
    const keys = [ b.y, b.y + b.h/2, b.y + b.h ];
    keys.forEach(k => {
      const key = 'y:' + quantize(k, PATTERN_ALIGN_TOL);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ e, b, axis: k });
    });
  });
  const patterns = [];
  buckets.forEach(items => {
    if (items.length < 2) return;
    items.sort((a,b)=> (a.b.x - b.b.x));
    const similar = items; // allow mixed sizes and types
    const gaps = [];
    for (let i=0;i<similar.length-1;i++){ gaps.push(similar[i+1].b.x - (similar[i].b.x + similar[i].b.w)); }
    const validGaps = gaps.filter(g=>Number.isFinite(g) && g>=0);
    if (validGaps.length < 1) return;
    const gAvg = validGaps.reduce((s,v)=>s+v,0)/validGaps.length;
    const gVar = validGaps.reduce((s,v)=>s+Math.abs(v-gAvg),0)/validGaps.length;
    if (gVar > Math.max(2, gAvg*0.15)) return;
    const axisCoord = median(similar.map(o => o.axis));
    patterns.push({ orientation:'h', items: similar.map(o=>o.b), gap:gAvg, axis:'y', axisCoord });
  });
  return patterns;
}

function computePatternSnap(b, excludeIds = [], options){
  try {
    const page = getPageNode(); if (!page) return null;
    const colPatterns = buildColumnPatterns(excludeIds);
    const rowPatterns = buildRowPatterns(excludeIds);

    // vertical stacks: equalize vertical gaps (adjust y)
    let best = null; let bestDist = Infinity;
    for (const p of colPatterns){
      const axisX = p.axisCoord || (p.items.reduce((s,it)=> s + (it.x + it.w/2), 0)/p.items.length);
      const dx = Math.min(
        Math.abs((b.x) - axisX),
        Math.abs((b.x + b.w/2) - axisX),
        Math.abs((b.x + b.w) - axisX)
      );
      if (dx > PATTERN_ALIGN_TOL*1.5) continue;
      // Find nearest neighbor above/below
      const ordered = p.items.slice().sort((a,c)=>a.y - c.y);
      const below = ordered.find(it => it.y >= (b.y + b.h));
      const above = [...ordered].reverse().find(it => (it.y + it.h) <= b.y);
      const candidates = [];
      if (below){ candidates.push({ y: below.y - p.gap - b.h, badgeY: below.y - p.gap/2, neigh: below }); }
      if (above){ candidates.push({ y: above.y + above.h + p.gap, badgeY: above.y + above.h + p.gap/2, neigh: above }); }
      // Between two neighbors
      for (let i=0;i<ordered.length-1;i++){
        const a = ordered[i], c = ordered[i+1];
        const space = c.y - (a.y + a.h);
        if (space >= b.h + p.gap - 0.5){ // enough space to keep standard gap on one side
          candidates.push({ y: a.y + a.h + p.gap, badgeY: a.y + a.h + p.gap/2, neigh:a });
        }
      }
      candidates.forEach(c => {
        const d = Math.abs(c.y - b.y);
        if (d <= GAP_SNAP_TOL && d < bestDist){
          bestDist = d; best = { orientation:'v', y:c.y, badgeY:c.badgeY, lineY: c.badgeY, gap:p.gap, axisX, pattern:p };
        }
      });
    }

    // horizontal rows: equalize horizontal gaps (adjust x)
    for (const p of rowPatterns){
      const axisY = p.axisCoord || (p.items.reduce((s,it)=> s + (it.y + it.h/2), 0)/p.items.length);
      const dy = Math.min(
        Math.abs((b.y) - axisY),
        Math.abs((b.y + b.h/2) - axisY),
        Math.abs((b.y + b.h) - axisY)
      );
      if (dy > PATTERN_ALIGN_TOL*1.5) continue;
      const ordered = p.items.slice().sort((a,c)=>a.x - c.x);
      const rightOf = ordered.find(it => it.x >= (b.x + b.w));
      const leftOf = [...ordered].reverse().find(it => (it.x + it.w) <= b.x);
      const candidates = [];
      if (rightOf){ candidates.push({ x: rightOf.x - p.gap - b.w, badgeX: rightOf.x - p.gap/2, neigh:rightOf }); }
      if (leftOf){ candidates.push({ x: leftOf.x + leftOf.w + p.gap, badgeX: leftOf.x + leftOf.w + p.gap/2, neigh:leftOf }); }
      for (let i=0;i<ordered.length-1;i++){
        const a = ordered[i], c = ordered[i+1];
        const space = c.x - (a.x + a.w);
        if (space >= b.w + p.gap - 0.5){ candidates.push({ x: a.x + a.w + p.gap, badgeX: a.x + a.w + p.gap/2, neigh:a }); }
      }
      candidates.forEach(c => {
        const d = Math.abs(c.x - b.x);
        if (d <= GAP_SNAP_TOL && d < bestDist){
          bestDist = d; best = { orientation:'h', x:c.x, badgeX:c.badgeX, lineX: c.badgeX, gap:p.gap, axisY, pattern:p };
        }
      });
    }

    if (best){
      // Badge placement roughly at line median; convert to absolute within page
      const baseItems = (best.pattern && Array.isArray(best.pattern.items)) ? best.pattern.items.slice() : [];
      // Include the dragged element (at its snapped coordinate) so the top/bottom or left/right gap shows too
      const withDragged = baseItems.slice();
      const dragAsItem = { x:b.x, y:b.y, w:b.w, h:b.h };
      if (best.orientation === 'v') dragAsItem.y = best.y; else dragAsItem.x = best.x;
      // Only add if aligned to the pattern axis
      const onAxis = best.orientation==='v'
        ? (Math.min(Math.abs(b.x - (best.axisX||0)), Math.abs(b.x + b.w/2 - (best.axisX||0)), Math.abs(b.x + b.w - (best.axisX||0))) <= PATTERN_ALIGN_TOL*1.5)
        : (Math.min(Math.abs(b.y - (best.axisY||0)), Math.abs(b.y + b.h/2 - (best.axisY||0)), Math.abs(b.y + b.h - (best.axisY||0))) <= PATTERN_ALIGN_TOL*1.5);
      if (onAxis) withDragged.push(dragAsItem);
      const vis = {
        orientation: best.orientation,
        gap: best.gap,
        lineY: best.lineY,
        lineX: best.lineX,
        items: withDragged,
      };
      const out = { x: b.x, y: b.y, visual: vis };
      if (best.orientation==='v') out.y = best.y;
      else out.x = best.x;
      return out;
    }
  } catch{}
  return null;
}

