/* ----------------------- Interaction ----------------------- */
function getCanvasPoint(evt, pageNode = getPageNode(), clamp = true){
  const r = pageNode.getBoundingClientRect();
  const z = getZoom();
  const cx = (evt.clientX ?? evt.touches?.[0]?.clientX);
  const cy = (evt.clientY ?? evt.touches?.[0]?.clientY);
  const x = (cx - r.left) / z;
  const y = (cy - r.top) / z;
  if (!clamp) return { x, y };
  const w = pageNode.clientWidth;
  const h = pageNode.clientHeight;
  return { x: Math.max(0, Math.min(w, x)), y: Math.max(0, Math.min(h, y)) };
}

// Compute which page is most visible within the viewport and return its node and id
function getMostVisiblePageInfo(){
  try {
    const vp = document.getElementById('pageViewport');
    if (!vp) return null;
    const vpr = vp.getBoundingClientRect();
    let best = null; let bestArea = 0;
    document.querySelectorAll('.page-wrapper .page').forEach((page) => {
      const pr = page.getBoundingClientRect();
      const left = Math.max(pr.left, vpr.left);
      const top = Math.max(pr.top, vpr.top);
      const right = Math.min(pr.right, vpr.right);
      const bottom = Math.min(pr.bottom, vpr.bottom);
      const w = Math.max(0, right - left);
      const h = Math.max(0, bottom - top);
      const area = w * h;
      if (area > bestArea){ bestArea = area; best = page; }
    });
    if (!best) return null;
    const wrap = best.closest('.page-wrapper');
    const pageId = wrap && wrap.dataset ? wrap.dataset.pageId : null;
    return pageId ? { pageNode: best, pageId } : null;
  } catch { return null; }
}
// Return a visible, viewport-aware point (logical coords) on the most visible page
function getVisibleInsertionPoint(){
  const info = getMostVisiblePageInfo(); if (!info) return null;
  const vp = document.getElementById('pageViewport'); if (!vp) return null;
  const vpr = vp.getBoundingClientRect();
  const pr = info.pageNode.getBoundingClientRect();
  const z = (typeof getZoom === 'function') ? (getZoom() || 1) : 1;
  const left = Math.max(pr.left, vpr.left);
  const top = Math.max(pr.top, vpr.top);
  const right = Math.min(pr.right, vpr.right);
  const bottom = Math.min(pr.bottom, vpr.bottom);
  let cx = (left + right) / 2;
  let cy = (top + bottom) / 2;
  // Fallback to page center if there is no intersection
  if (!(right > left && bottom > top)) { cx = pr.left + pr.width/2; cy = pr.top + pr.height/2; }
  let x = (cx - pr.left) / z;
  let y = (cy - pr.top) / z;
  // Nudge to stay within visible/safe area, accounting for header/footer
  try {
    const header = Number(Model?.document?.headerHeight || 0);
    const footer = Number(Model?.document?.footerHeight || 0);
    const w = info.pageNode.clientWidth;
    const h = info.pageNode.clientHeight;
    const margin = 20; // logical px
    const minX = margin;
    const maxX = Math.max(margin, w - margin);
    const minY = Math.max(margin, header + margin);
    const maxY = Math.max(minY, h - footer - margin);
    x = Math.max(minX, Math.min(maxX, x));
    y = Math.max(minY, Math.min(maxY, y));
  } catch {}
  return { pageId: info.pageId, x, y };
}

// Add element immediately to the most visible page at a visible point
function addElementToVisiblePage(type){
  const pt = getVisibleInsertionPoint();
  if (!pt) { pendingAddType = type; placePendingAt(40, 40); return; }
  Model.document.currentPageId = pt.pageId;
  pendingAddType = type;
  placePendingAt(pt.x, pt.y, pt.pageId);
}

// Internal guard to suppress click-add when a drag from the palette just occurred
let __addingByDrag = false;

let drag = null; // {id, start:{x,y}, orig:{...}, descendants?: Map}
let dragMaybe = null; // tentative single-element drag starter
let resize = null; // {id, start:{x,y}, orig:{...}, mode:'n|s|e|w|ne|nw|se|sw'}
const Controller = { snapState: { x:null, y:null }, suppressReflow: 0 };
let dragSelection = null; // { startBounds, starts: Map }
let resizeSelectionState = null; // { handle, startBounds, starts: Map }
let rotateSelectionState = null; // { startBounds, center:{x,y}, startAngle, starts: Map(id->startRotate) }

function getDescendantIds(rootId){
  const page = getCurrentPage();
  const out = [];
  const queue = [rootId];
  const seen = new Set([rootId]);
  while (queue.length){
    const cur = queue.shift();
    page.elements.forEach(e => {
      if (e.parentId === cur && !seen.has(e.id)){
        out.push(e.id);
        seen.add(e.id);
        queue.push(e.id);
      }
    });
  }
  return out;
}

function isElementHidden(el){
  try {
    const a = el && el.attrs ? el.attrs : {};
    if (a && (a.hidden === true || a.hidden === 'true')) return true;
    const st = String(a && a.style ? a.style : '');
    if (/display\s*:\s*none/i.test(st)) return true;
  } catch {}
  return false;
}

function reflowStacks(page){
  // Cross-page stack reflow for elements that opt-in via stackByPage.
  // 1) Lay out visible stackers top-to-bottom within each page
  // 2) If an item would overflow the page, move it to the next page and continue
  // 3) Allow elements to move forward AND backward across pages based on space
  // 4) Support an optional pageBreak flag to force element to start on next page
  // 5) After page-level positions are finalized, reflow children inside block containers
  try {
    const doc = Model && Model.document ? Model.document : { pages: [] };
    if (!Array.isArray(doc.pages) || doc.pages.length === 0) return;

    const PADDING_TOP = 16;
    const PADDING_GAP = 16;
    const PADDING_BOTTOM = 16;
    const HEADER_H = Number((Model && Model.document && Model.document.headerHeight) || 0);
    const FOOTER_H = Number((Model && Model.document && Model.document.footerHeight) || 0);

    function getLogicalPageHeightPx(p){
      try {
        const node = typeof getPageNode === 'function' ? getPageNode(p.id) : null;
        if (!node) return 0;
        const z = (typeof getZoom === 'function') ? (getZoom() || 1) : 1;
        return Math.round(node.getBoundingClientRect().height / (z || 1));
      } catch { return 0; }
    }

    function findPageIndexByElementId(eid){
      for (let i = 0; i < doc.pages.length; i++){
        const p = doc.pages[i];
        if ((p.elements || []).some(el => el && el.id === eid)) return i;
      }
      return -1;
    }

    // Collect all descendants (children, grandchildren, …) of a container across all pages
    function collectDescendants(rootId){
      const out = [];
      const queue = [rootId];
      const seen = new Set([rootId]);
      while (queue.length){
        const parent = queue.shift();
        for (let i = 0; i < doc.pages.length; i++){
          const pg = doc.pages[i];
          for (const el of (pg.elements || [])){
            if (!el) continue;
            if (el.parentId === parent && !seen.has(el.id)){
              out.push(el);
              seen.add(el.id);
              queue.push(el.id);
            }
          }
        }
      }
      return out;
    }

    const changedPageIds = new Set();
    let createdPages = false;
    let deletedPages = false;

    // Build a single, ordered list of all visible root-level stackers across pages.
    const allStackers = [];
    for (let pi = 0; pi < doc.pages.length; pi++){
      const p = doc.pages[pi];
      const locals = (p.elements || [])
  .filter(e => e && e.stackByPage === true && !e.freeMove && !e.parentId && !isElementHidden(e) && !e.repeatOnAllPages)
        .sort((a,b) => (a.y - b.y));
      locals.forEach(el => allStackers.push(el));
    }

    // Helper to ensure a page exists at index and return it
    const ensurePage = (index) => {
      while (doc.pages.length <= index){
        const newPage = createPage(`Page ${doc.pages.length + 1}`);
        doc.pages.push(newPage);
        createdPages = true;
      }
      return doc.pages[index];
    };

    // Lay out the global sequence into pages from the start, allowing backward moves
    let pi = 0;
    let p = ensurePage(pi);
    let pageHeight = getLogicalPageHeightPx(p);
    let limit = Math.max(0, pageHeight - FOOTER_H - PADDING_BOTTOM);
    let y = PADDING_TOP + HEADER_H;

    for (const el of allStackers){
      const h = Math.max(0, Number(el.h || 0));
      const wantsBreak = !!(el.pageBreak === true || el.pageBreak === 'true');

      // Forced page break before this element (unless it's already at the top of a fresh page)
      if (wantsBreak && y !== (PADDING_TOP + HEADER_H)){
        pi += 1; p = ensurePage(pi);
        pageHeight = getLogicalPageHeightPx(p);
        limit = Math.max(0, pageHeight - FOOTER_H - PADDING_BOTTOM);
        y = PADDING_TOP + HEADER_H;
      }

      // If it would overflow, advance pages until it fits or we've started a new page
      while (y + h > limit){
        pi += 1; p = ensurePage(pi);
        pageHeight = getLogicalPageHeightPx(p);
        limit = Math.max(0, pageHeight - FOOTER_H - PADDING_BOTTOM);
        y = PADDING_TOP + HEADER_H;
        // If the element itself is taller than a page, place it at the top and allow overflow
        if (h > (limit - (PADDING_TOP + HEADER_H))) break;
      }

      // Move element to the target page if needed
      const curIdx = findPageIndexByElementId(el.id);
      if (curIdx !== pi && curIdx !== -1){
        const from = doc.pages[curIdx];
        const idx = from.elements.findIndex(x => x && x.id === el.id);
        if (idx !== -1) from.elements.splice(idx, 1);
        changedPageIds.add(from.id);

        // Move all descendants with the block as well so they stay visible
        if (el.type === 'block'){
          const descendants = collectDescendants(el.id);
          for (const d of descendants){
            const dFromIdx = findPageIndexByElementId(d.id);
            if (dFromIdx !== -1){
              const fromPg = doc.pages[dFromIdx];
              const di = fromPg.elements.findIndex(x => x && x.id === d.id);
              if (di !== -1) fromPg.elements.splice(di, 1);
              changedPageIds.add(fromPg.id);
            }
            if (!p.elements.some(x => x && x.id === d.id)) p.elements.push(d);
            changedPageIds.add(p.id);
          }
        }

        if (!p.elements.some(x => x && x.id === el.id)) p.elements.push(el);
        changedPageIds.add(p.id);
      } else {
        // Element already on target page; ensure it's present in elements list
        if (!p.elements.some(x => x && x.id === el.id)) {
          p.elements.push(el);
          changedPageIds.add(p.id);
        }
      }

      // Position element within the page
      el.y = y;
      y += h + PADDING_GAP;
      changedPageIds.add(p.id);
    }

    // Remove trailing empty pages (only at the end to be safe)
    for (let i = doc.pages.length - 1; i >= 0 && doc.pages.length > 1; i--){
      const pg = doc.pages[i];
      const hasAnyElements = Array.isArray(pg.elements) && pg.elements.length > 0;
      if (hasAnyElements) break; // stop at first non-empty from the end
      const removed = doc.pages.pop();
      deletedPages = true;
      // Fix currentPageId if we removed the current one
      if (removed && removed.id === Model.document.currentPageId){
        const newIdx = Math.min(doc.pages.length - 1, i - 1);
        const safeIdx = newIdx >= 0 ? newIdx : 0;
        Model.document.currentPageId = doc.pages[safeIdx]?.id || doc.pages[0].id;
      }
    }

    // After page-level reflow, stack children within blocks on affected pages
    const affectedPages = Array.from(changedPageIds).map(id => doc.pages.find(p => p.id === id)).filter(Boolean);
    const pagesToProcess = affectedPages.length ? affectedPages : [page || getCurrentPage()];
    pagesToProcess.forEach((pg) => {
      const blocks = (pg.elements || []).filter(e => e.type === 'block');
      blocks.forEach(b => {
        if (!b.stackChildren) return;
        const kids = pg.elements
          .filter(e => e && e.parentId === b.id && e.type !== 'line' && !isElementHidden(e))
          .sort((a,bm) => (a.y - bm.y));
        let y = 8;
        kids.forEach(k => { k.y = b.y + y; y += (k.h || 0) + 8; });
      });
    });

    // Render only the pages that changed; if structure changed, rebuild the list
    if (changedPageIds.size || createdPages || deletedPages){
      try {
        if (createdPages || deletedPages){
          renderPagesList();
        } else {
          changedPageIds.forEach((pid) => {
            const pg = doc.pages.find(p => p.id === pid);
            if (pg) renderPage(pg);
          });
        }
      } catch {}
    }
  } catch {}
}

// expose for userFunctions
window.reflowStacks = reflowStacks;
// ---------- Block parenting helpers ----------
function elementBounds(el){ return { x: el.x || 0, y: el.y || 0, w: el.w || 0, h: el.h || 0 }; }
function rectContainsPoint(r, px, py){ return px >= r.x && px <= (r.x + r.w) && py >= r.y && py <= (r.y + r.h); }
/** Assign parentId for given element ids when their centers fall inside a block; clear when outside. */
function reparentIntoBlocks(page, ids){
  if (!page) page = getCurrentPage();
  const blocks = page.elements.filter(e => e.type === 'block');
  if (!blocks.length) return;
  // Prefer visually topmost (highest z) when multiple blocks overlap
  const pickHost = (cx, cy) => {
    let host = null; let bestZ = -Infinity;
    for (const b of blocks){
      const r = elementBounds(b);
      if (rectContainsPoint(r, cx, cy)){
        const z = Number(b.z || 0);
        if (z >= bestZ){ bestZ = z; host = b; }
      }
    }
    return host;
  };
  ids.forEach(id => {
    const idx = page.elements.findIndex(e => e.id === id);
    if (idx === -1) return;
    const el = page.elements[idx];
    if (!el || el.type === 'block') return; // don't parent blocks into blocks here
    const r = elementBounds(el);
    const cx = r.x + r.w/2; const cy = r.y + r.h/2;
    const host = pickHost(cx, cy);
    const nextParentId = host ? host.id : null;
    if ((el.parentId || null) !== nextParentId){
      // Mutate in place to be consistent with live gesture updates
      el.parentId = nextParentId;
      page.elements[idx] = el;
    }
  });
}
// Reparent root-level freeMove elements across pages when their centers move into another page.
function reparentFreeMoveAcrossPages(ids){
  try {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const selIds = [...new Set(ids)];
    const z = getZoom ? (getZoom() || 1) : 1;
    // Collect page DOM rects once
    const pages = (Model.document.pages || []).map(p => ({ p, node: document.querySelector(`.page-wrapper[data-page-id="${p.id}"] .page`) })).filter(o => o.node);
    const pageRects = pages.map(o => ({ id:o.p.id, rect:o.node.getBoundingClientRect() }));
    const prevSelection = (typeof selectedIds !== 'undefined') ? [...selectedIds] : [];
    let lastTargetPageId = null;
    selIds.forEach((id) => {
      const m = getElementById ? getElementById(id) : null;
      if (!m || !m.freeMove || m.parentId) return; // only freeMove roots
      // Find current page containing the model
      const fromPage = Model.document.pages.find(pp => (pp.elements || []).some(el => el && el.id === id));
      if (!fromPage) return;
      const curNode = document.querySelector(`.page-wrapper[data-page-id="${fromPage.id}"] .page`);
      if (!curNode) return;
      const pr = curNode.getBoundingClientRect();
      const cx = pr.left + (m.x + ((m.w || 0) / 2)) * z;
      const cy = pr.top + (m.y + ((m.h || 0) / 2)) * z;
      const target = pageRects.find(prx => cy >= prx.rect.top && cy <= prx.rect.bottom && cx >= prx.rect.left && cx <= prx.rect.right);
      if (!target || target.id === fromPage.id) return;
      const toPage = Model.document.pages.find(pp => pp && pp.id === target.id);
      if (!toPage) return;
      // Move the element
      const idx = fromPage.elements.findIndex(el => el && el.id === id);
      if (idx === -1) return;
      const [moved] = fromPage.elements.splice(idx, 1);
      // Adjust coordinates so visual screen position remains the same after reparent
      try {
        const targetRect = document.querySelector(`.page-wrapper[data-page-id="${toPage.id}"] .page`)?.getBoundingClientRect();
        if (targetRect && pr){
          const dxLogical = (pr.left - targetRect.left) / z;
          const dyLogical = (pr.top - targetRect.top) / z;
          moved.x = (moved.x || 0) + dxLogical;
          moved.y = (moved.y || 0) + dyLogical;
          if (typeof moved.x2 === 'number') moved.x2 += dxLogical;
          if (typeof moved.y2 === 'number') moved.y2 += dyLogical;
        }
      } catch {}
      toPage.elements.push(moved);
      lastTargetPageId = toPage.id;
      // If moving a block, move its descendants too so they remain visible
      if (moved && moved.type === 'block' && typeof collectDescendants === 'function'){
        const desc = collectDescendants(moved.id);
        for (const d of desc){
          const dFromPage = Model.document.pages.find(pp => (pp.elements || []).some(el => el && el.id === d.id));
          if (!dFromPage || dFromPage === toPage) continue;
          const di = dFromPage.elements.findIndex(el => el && el.id === d.id);
          if (di !== -1){
            const [dm] = dFromPage.elements.splice(di, 1);
            if (!toPage.elements.some(el => el && el.id === dm.id)) toPage.elements.push(dm);
          }
        }
      }
    });
    // Re-render after any moves
    renderAll && renderAll();
    if (prevSelection && prevSelection.length && typeof setSelection === 'function') setSelection(prevSelection);
  } catch {}
}

function onMouseDown(e){
  // Ignore canvas interactions while a picker is active (element/style picker),
  // but allow caret movement inside the actively edited host
  if (window.__PICKING) {
    try {
      const ph = window.__PICKER_HOST;
      if (ph && (ph === e.target || (ph.contains && ph.contains(e.target)))) {
        return; // allow default behavior inside host
      }
    } catch {}
    e.preventDefault();
    return;
  }
  // Prevent moving/resizing when edit mode is off, but allow clicking/selection
  if (!Model.document.editMode) return;
  // If currently editing text/content, do not initiate drags
  const act = document.activeElement;
  if (act && (act.isContentEditable || act.tagName === 'INPUT' || act.tagName === 'TEXTAREA')) return;
  const target = e.target.closest('.element');
  // Avoid initiating drag on the first click of a double-click for text-like elements
  if (target && e.detail >= 2 && (target.classList.contains('text') || target.classList.contains('field') || target.classList.contains('rect'))){
    // Cancel any pending or active drag when entering edit mode via double-click
    drag = null; dragMaybe = null; dragSelection = null; resize = null;
    return; // let dblclick handler take over to enter edit mode
  }
  if (target && target.isContentEditable) { drag = null; dragMaybe = null; return; } // don't start drag when editing text
  // If potential target is freeMove we want unclamped start coords so deltas stay consistent when leaving page
  let unclamped = false;
  try {
    const tgtNode = e.target.closest('.element');
    const id = tgtNode ? tgtNode.dataset.id : null;
    if (id){ const m = getElementById(id); if (m && m.freeMove) unclamped = true; }
  } catch{}
  const pt = getCanvasPoint(e, getPageNode(), !unclamped);
  if (pendingAddType){ placePendingAt(pt.x, pt.y); return; }
  if (target){
    const id = target.dataset.id;
    console.log('[MOUSE] down on element', id);
    const page = getCurrentPage();
    const model = page.elements.find(el => el.id === id);
    // Respect locked layers
    if (model && model.attrs && (model.attrs.locked === true || model.attrs.locked === 'true')){
      // Allow selection but block drag/resize
      setSelection([id]);
      e.preventDefault();
      return;
    }
    // Alt-drag duplicate: when starting a drag with Alt pressed, clone selection first
    if ((e.altKey || e.metaKey && e.shiftKey) && (selectedIds.has(id) || selectedIds.size === 0)){
      // If nothing selected, select target first then clone
      if (!selectedIds.has(id)) setSelection([id]);
      copySelection(0); // duplicate at same position
      // Keep newly created clones selected and start dragging them
      // Offset start so immediate movement will be visible
    }
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
      console.log(`[GESTURE] resize:start id=${id} mode=${mode}`);
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
        console.log(`[GESTURE] multi-drag:start count=${selectedIds.size}`);
      } else {
        // Defer starting a drag until the pointer actually moves beyond a threshold
        // Capture possible descendants for blocks to move them together
        let descendants = null;
        if (model && model.type === 'block'){
          const ids = getDescendantIds(model.id);
          const map = new Map();
          ids.forEach(cid => { const cm = getElementById(cid); if (cm) map.set(cid, deepClone(cm)); });
          descendants = map;
        }
        dragMaybe = { id, start: pt, orig: deepClone(model), descendants };
        console.log(`[GESTURE] drag:maybe id=${id} x=${pt.x} y=${pt.y}`);
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
  // Safety: if no mouse button is down but a gesture is active, end it
  if ((e.buttons === 0 || e.type === 'mouseleave') && (drag || resize || dragSelection || resizeSelectionState || rotateSelectionState || dragMaybe)){
    onMouseUp();
    return;
  }
  // If editing text/content and no gesture is active, ignore move events
  const activeEl = document.activeElement;
  const isEditing = !!(activeEl && (activeEl.isContentEditable || activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA'));
  if (isEditing && !drag && !resize && !dragSelection && !resizeSelectionState && !rotateSelectionState && !dragMaybe) return;
  if (!drag && !resize && !dragSelection && !resizeSelectionState && !rotateSelectionState && !dragMaybe) return;
  // Determine if current gesture allows overflow (all active elements freeMove)
  let unclamp = false;
  if (dragSelection){
    try { unclamp = [...selectedIds].length && [...selectedIds].every(id => { const m = getElementById(id); return m && m.freeMove; }); } catch {}
  } else if (drag){
    try { const m = getElementById(drag.id); unclamp = !!(m && m.freeMove); } catch {}
  } else if (resize){
    try { const m = getElementById(resize.id); unclamp = !!(m && m.freeMove); } catch {}
  } else if (resizeSelectionState){
    try { unclamp = [...selectedIds].length && [...selectedIds].every(id => { const m = getElementById(id); return m && m.freeMove; }); } catch {}
  }
  const pt = getCanvasPoint(e, getPageNode(), !unclamp);
  const page = getCurrentPage();
  // Promote tentative drag if moved far enough
  if (!drag && dragMaybe){
    const dx0 = Math.abs(pt.x - dragMaybe.start.x);
    const dy0 = Math.abs(pt.y - dragMaybe.start.y);
    if (dx0 >= 3 || dy0 >= 3){
      console.log(`[GESTURE] drag:promote id=${dragMaybe.id}`);
      commitHistory('move');
      drag = dragMaybe; dragMaybe = null;
    }
  }
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
    // Live reparenting for freeMove multi-drag root elements
    try { reparentFreeMoveAcrossPages([...selectedIds]); } catch {}
    return;
  }
  if (dragSelection){
    const ox = dragSelection.pointerOffset?.ox || 0;
    const oy = dragSelection.pointerOffset?.oy || 0;
    const dx = pt.x - (dragSelection.startBounds.x + ox);
    const dy = pt.y - (dragSelection.startBounds.y + oy);
  const tentative = { x: dragSelection.startBounds.x + dx, y: dragSelection.startBounds.y + dy, w: dragSelection.startBounds.w, h: dragSelection.startBounds.h };
    // Consistent snapping for movement
    const snapped = snapSelectionBounds(tentative, [...selectedIds], undefined, INTERACTIVE_SNAP);
    const snapDx = snapped.x - tentative.x; const snapDy = snapped.y - tentative.y;
    [...selectedIds].forEach(id => {
      const start = dragSelection.starts.get(id);
      const m = deepClone(start);
      m.x = start.x + dx + snapDx; m.y = start.y + dy + snapDy;
      // Clamp if this element is NOT freeMove
      if (!m.freeMove){
        const pageNode = getPageNode();
        if (pageNode){
          const pw = pageNode.clientWidth; const ph = pageNode.clientHeight;
          if (m.type === 'line' && typeof m.x2 === 'number'){
            const minX = Math.min(m.x, m.x2), maxX = Math.max(m.x, m.x2);
            const minY = Math.min(m.y, m.y2), maxY = Math.max(m.y, m.y2);
            const offX = Math.min(0, minX) + Math.max(0, maxX - pw);
            const offY = Math.min(0, minY) + Math.max(0, maxY - ph);
            m.x -= offX; m.y -= offY; m.x2 -= offX; m.y2 -= offY;
          } else {
            if (m.x < 0) m.x = 0;
            if (m.y < 0) m.y = 0;
            if (m.x + (m.w||0) > pw) m.x = Math.max(0, pw - (m.w||0));
            if (m.y + (m.h||0) > ph) m.y = Math.max(0, ph - (m.h||0));
          }
        }
      }
      if (m.type === 'line' && typeof m.x2 === 'number'){ m.x2 = (start.x2||start.x) + dx + snapDx; m.y2 = (start.y2||start.y) + dy + snapDy; }
      const idx = page.elements.findIndex(el => el.id === id); if (idx !== -1) page.elements[idx] = m;
      const node = document.querySelector(`.page [data-id="${id}"]`); if (node) applyElementStyles(node, m);
    });
    showGuidesForBounds(snapped, getPageNode());
    updateSelectionBox();
    // Live reparent for single freeMove drag
    try { if (drag && m.freeMove && !m.parentId) reparentFreeMoveAcrossPages([drag.id]); } catch{}
    return;
  }
  // If we're not actively dragging or resizing a single element, bail out.
  if (!drag && !resize) {
    return;
  }
  const active = drag || resize; // guaranteed non-null here
  const idx = page.elements.findIndex(el => el.id === active.id); if (idx === -1) return;
  const dx = pt.x - active.start.x; const dy = pt.y - active.start.y;
  const m = deepClone(active.orig);
  if (resize) {
    applyResize(m, dx, dy, resize.mode);
    // Apply snapping to single element resize
    const tentativeBounds = getBoundsForModel(m);
    // Provide preference so snapping uses the active resized edges
    const prefer = { x: resize.mode.includes('e') ? 'right' : resize.mode.includes('w') ? 'left' : undefined,
                     y: resize.mode.includes('s') ? 'bottom' : resize.mode.includes('n') ? 'top' : undefined };
    // Consistent snapping for resize (do not clamp to page when freeMove)
    const snappedBounds = snapSelectionBounds(tentativeBounds, [active.id], prefer, INTERACTIVE_SNAP);
    // Instead of shifting the whole element (which moves the opposite edge),
    // adjust the resized edge to the snapped coordinate.
    const tentLeft = tentativeBounds.x;
    const tentRight = tentativeBounds.x + tentativeBounds.w;
    const tentTop = tentativeBounds.y;
    const tentBottom = tentativeBounds.y + tentativeBounds.h;
    const snapLeft = snappedBounds.x;
    const snapRight = snappedBounds.x + snappedBounds.w;
    const snapTop = snappedBounds.y;
    const snapBottom = snappedBounds.y + snappedBounds.h;

    // Horizontal adjustment
    if (resize.mode.includes('e')) {
      const deltaRight = snapRight - tentRight;
      if (m.type === 'line' && typeof m.x2 === 'number'){
        m.x2 += deltaRight;
      } else {
        m.w = Math.max(10, (m.w || 0) + deltaRight);
      }
    } else if (resize.mode.includes('w')) {
      const newLeft = snapLeft;
      const newWidth = Math.max(10, tentRight - newLeft);
      if (m.type === 'line' && typeof m.x2 === 'number'){
        // Move left endpoint while keeping right endpoint fixed
        const rightX = Math.max(m.x, m.x2);
        const leftWas = Math.min(m.x, m.x2);
        const shift = newLeft - tentLeft;
        if (m.x <= m.x2) { m.x += shift; } else { m.x2 += shift; }
      } else {
        m.x = newLeft; m.w = newWidth;
      }
    }

    // Vertical adjustment
    if (resize.mode.includes('s')) {
      const deltaBottom = snapBottom - tentBottom;
      if (m.type === 'line' && typeof m.y2 === 'number'){
        m.y2 += deltaBottom;
      } else {
        m.h = Math.max(10, (m.h || 0) + deltaBottom);
      }
    } else if (resize.mode.includes('n')) {
      const newTop = snapTop;
      const newHeight = Math.max(10, tentBottom - newTop);
      if (m.type === 'line' && typeof m.y2 === 'number'){
        const topWas = Math.min(m.y, m.y2);
        const shift = newTop - tentTop;
        if (m.y <= m.y2) { m.y += shift; } else { m.y2 += shift; }
      } else {
        m.y = newTop; m.h = newHeight;
      }
    }
    showGuidesForBounds(snappedBounds, getPageNode());
  } else {
  if (m.type === 'line') { m.x += dx; m.y += dy; m.x2 += dx; m.y2 += dy; } else { m.x += dx; m.y += dy; }
    // snap and show guides for single element
    const tentative = getBoundsForModel(m);
    // Consistent snapping for movement
    const snapped = snapSelectionBounds(tentative, [active.id], undefined, INTERACTIVE_SNAP);
    const snapDx = snapped.x - tentative.x; const snapDy = snapped.y - tentative.y;
    if (m.type === 'line' && typeof m.x2 === 'number'){
      m.x += snapDx; m.y += snapDy; m.x2 += snapDx; m.y2 += snapDy;
    } else { m.x += snapDx; m.y += snapDy; }
    // Clamp if not freeMove
    if (!m.freeMove){
      const pageNode = getPageNode();
      if (pageNode){
        const pw = pageNode.clientWidth; const ph = pageNode.clientHeight;
        if (m.type === 'line' && typeof m.x2 === 'number'){
          const minX = Math.min(m.x, m.x2), maxX = Math.max(m.x, m.x2);
            const minY = Math.min(m.y, m.y2), maxY = Math.max(m.y, m.y2);
            const offX = Math.min(0, minX) + Math.max(0, maxX - pw);
            const offY = Math.min(0, minY) + Math.max(0, maxY - ph);
            m.x -= offX; m.y -= offY; m.x2 -= offX; m.y2 -= offY;
        } else {
          if (m.x < 0) m.x = 0;
          if (m.y < 0) m.y = 0;
          if (m.x + (m.w||0) > pw) m.x = Math.max(0, pw - (m.w||0));
          if (m.y + (m.h||0) > ph) m.y = Math.max(0, ph - (m.h||0));
        }
      }
    }
    showGuidesForBounds(snapped, getPageNode());
    // If dragging a block, translate its descendants by the block's total displacement (including snapping)
    if (active.descendants && active.orig && active.orig.type === 'block'){
      const totalDx = (m.x - active.orig.x);
      const totalDy = (m.y - active.orig.y);
      active.descendants.forEach((startChild, childId) => {
        const childIdx = page.elements.findIndex(el => el.id === childId);
        if (childIdx === -1) return;
        const ch = deepClone(startChild);
        if (ch.type === 'line' && typeof ch.x2 === 'number'){
          ch.x += totalDx; ch.y += totalDy; ch.x2 += totalDx; ch.y2 += totalDy;
        } else {
          ch.x += totalDx; ch.y += totalDy;
        }
        page.elements[childIdx] = ch;
        const nodeCh = document.querySelector(`.page [data-id="${childId}"]`);
        if (nodeCh) applyElementStyles(nodeCh, ch);
      });
    }
  }
  page.elements[idx] = m;
  applyElementStyles(document.querySelector(`.page [data-id="${active.id}"]`), m);
  // Auto-toggle repeatOnAllPages when overlapping header/footer while dragging/resizing
  try {
    const newShouldRepeat = shouldRepeatForHeaderFooter(m);
    const wasRepeat = !!(active.orig && (active.orig.repeatOnAllPages === true || active.orig.repeatOnAllPages === 'true'));
    const curRepeat = !!(page.elements[idx].repeatOnAllPages);
    if (newShouldRepeat !== curRepeat){
      page.elements[idx].repeatOnAllPages = newShouldRepeat;
      // Light feedback render: update all pages only when state flips
      const pages = (Model && Model.document && Array.isArray(Model.document.pages)) ? Model.document.pages : [];
      pages.forEach(p => { try { renderPage(p); } catch {} });
    }
  } catch {}
  updateFormatToolbarVisibility(); positionElementActions(); updateSelectionBox();
}

function onMouseUp(){
  // Detect whether a gesture actually occurred (move/resize/rotate)
  const hadGesture = !!drag || !!resize || !!dragSelection || !!resizeSelectionState || !!rotateSelectionState;
  const type = dragSelection ? 'multi-drag' : (resize ? 'resize' : (drag ? 'drag' : (rotateSelectionState ? 'rotate' : (dragMaybe ? 'dragMaybe' : 'none'))));
  if (hadGesture) {
    console.log(`[GESTURE] ${type}:end`);
  } else if (dragMaybe) {
    console.log('[GESTURE] drag:cancel');
  }
  // After a move/resize/rotate, reparent elements into blocks (if applicable) and reflow stacks
  if (hadGesture){
    const page = getCurrentPage();
    try {
      // Preserve current selection through the side-effects below
      const __prevSelection = [...selectedIds];
      // First reparent freeMove elements across pages (prevents reflow from relocating them)
      reparentFreeMoveAcrossPages([...selectedIds]);
      // Now reparent into blocks and reflow only for non-freeMove stackers
      reparentIntoBlocks(getCurrentPage(), [...selectedIds]);
      reflowStacks(getCurrentPage());
      // Re-evaluate header/footer repeat rule once at gesture end and render
      try {
        const ids = [...selectedIds];
        ids.forEach(id => {
          const m = getElementById(id);
          if (!m) return;
          const want = shouldRepeatForHeaderFooter(m);
          if (!!m.repeatOnAllPages !== want){ m.repeatOnAllPages = want; }
        });
      } catch {}
      renderAll();
      // Restore selection that existed prior to re-render
      if (__prevSelection && __prevSelection.length) setSelection(__prevSelection);
    } catch {}
  }
  // History was already captured at gesture start
  if (drag){ drag = null; }
  if (resize){ resize = null; }
  if (dragSelection){ dragSelection = null; }
  if (rotateSelectionState){ rotateSelectionState = null; }
  // Clear any pending, not-yet-promoted drag from a prior click to avoid accidental moves
  if (dragMaybe){ dragMaybe = null; }
  // hide guides and reshow actions
  hideGuides();
  positionElementActions();
  Controller.snapState = { x: null, y: null };
}

