/* ----------------------- Resize helpers ----------------------- */
function getResizeMode(e, node){
  // Provide visual resize cursors when near element edges (single selection cue)
  const rect = node.getBoundingClientRect();
  const margin = 6;
  const x = e.clientX - rect.left; const y = e.clientY - rect.top;
  const left = x < margin; const right = x > rect.width - margin;
  const top = y < margin; const bottom = y > rect.height - margin;
  if ((left && top)) return 'nw';
  if ((right && top)) return 'ne';
  if ((left && bottom)) return 'sw';
  if ((right && bottom)) return 'se';
  if (top) return 'n'; if (bottom) return 's'; if (left) return 'w'; if (right) return 'e';
  return null;
}

function updateResizeCursor(e, node){
  // In view mode, never show resize cursors
  if (!Model || !Model.document || !Model.document.editMode){ node.style.cursor = ''; return; }
  const id = node.dataset.id; const page = getCurrentPage();
  const m = page?.elements.find(el => el.id === id) || {};
  const mode = getResizeMode(e, node, m);
  const map = { n: 'ns-resize', s:'ns-resize', e:'ew-resize', w:'ew-resize', ne:'nesw-resize', sw:'nesw-resize', nw:'nwse-resize', se:'nwse-resize' };
  node.style.cursor = map[mode] || '';
}

function applyResize(m, dx, dy, mode, origElement = null){
  if (m.type === 'line') return;
  
  const minW = 10, minH = 10;
  let minTableW = minW, minTableH = minH;
  if (m.type === 'table'){
    minTableW = (m.colWidths || []).reduce((a,b)=>a+b, 0) || minW;
    minTableH = (m.rowHeights || []).reduce((a,b)=>a+b, 0) || minH;
  }
  const clampW = (w) => Math.max(m.type==='table'?minTableW:minW, w);
  const clampH = (h) => Math.max(m.type==='table'?minTableH:minH, h);
  
  // Image corner resizing: maintain aspect ratio and anchor opposite SIDES
  const isImageCorner = (m.type === 'image' && (mode === 'nw' || mode === 'ne' || mode === 'sw' || mode === 'se'));
  
  if (isImageCorner && origElement) {
    const origW = origElement.w || minW;
    const origH = origElement.h || minH;
    const origX = origElement.x || 0;
    const origY = origElement.y || 0;
    const aspectRatio = origW / origH;
    
    // Calculate the original corner position (the corner being dragged)
    let origCornerX, origCornerY;
    if (mode === 'se') {
      origCornerX = origX + origW;  // Bottom-right corner
      origCornerY = origY + origH;
    } else if (mode === 'ne') {
      origCornerX = origX + origW;  // Top-right corner
      origCornerY = origY;
    } else if (mode === 'sw') {
      origCornerX = origX;          // Bottom-left corner
      origCornerY = origY + origH;
    } else if (mode === 'nw') {
      origCornerX = origX;          // Top-left corner
      origCornerY = origY;
    }
    
    // Calculate new corner position (original corner + mouse movement)
    const newCornerX = origCornerX + dx;
    const newCornerY = origCornerY + dy;
    
    // Calculate target dimensions from the anchored opposite SIDES
    // Anchor opposite sides: keep the sides opposite to the dragged corner fixed
    let targetWidth, targetHeight;
    
    if (mode === 'se') {
      // SE corner: anchor TOP and LEFT sides
      targetWidth = newCornerX - origX;
      targetHeight = newCornerY - origY;
    } else if (mode === 'ne') {
      // NE corner: anchor BOTTOM and LEFT sides
      targetWidth = newCornerX - origX;
      targetHeight = (origY + origH) - newCornerY;
    } else if (mode === 'sw') {
      // SW corner: anchor TOP and RIGHT sides
      targetWidth = (origX + origW) - newCornerX;
      targetHeight = newCornerY - origY;
    } else if (mode === 'nw') {
      // NW corner: anchor BOTTOM and RIGHT sides
      targetWidth = (origX + origW) - newCornerX;
      targetHeight = (origY + origH) - newCornerY;
    }
    
    // Ensure target dimensions are positive
    targetWidth = Math.max(minW, targetWidth);
    targetHeight = Math.max(minH, targetHeight);
    
    // Calculate scale factors for both axes
    const scaleX = targetWidth / origW;
    const scaleY = targetHeight / origH;
    
    // Use the larger scale to maintain aspect ratio (prevents distortion)
    const scale = Math.max(scaleX, scaleY);
    
    // Calculate new dimensions maintaining aspect ratio
    const newW = clampW(origW * scale);
    const newH = clampH(newW / aspectRatio);
    
    // Calculate how much size changed from original
    const deltaW = newW - origW;
    const deltaH = newH - origH;
    
    // Anchor the opposite SIDES by adjusting position
    if (mode === 'se') {
      // Southeast: anchor TOP and LEFT sides (no position change)
      m.x = origX;
      m.y = origY;
    } else if (mode === 'ne') {
      // Northeast: anchor BOTTOM and LEFT sides
      // Keep left edge fixed, move up to keep bottom edge fixed
      m.x = origX;
      m.y = (origY + origH) - newH; // bottom - new height
    } else if (mode === 'sw') {
      // Southwest: anchor TOP and RIGHT sides
      // Keep top edge fixed, move left to keep right edge fixed
      m.x = (origX + origW) - newW; // right - new width
      m.y = origY;
    } else if (mode === 'nw') {
      // Northwest: anchor BOTTOM and RIGHT sides
      // Move left and up to keep right and bottom edges fixed
      m.x = (origX + origW) - newW; // right - new width
      m.y = (origY + origH) - newH; // bottom - new height
    }
    
    m.w = newW;
    m.h = newH;
    
  } else if (m.type === 'image' && (mode === 'n' || mode === 's' || mode === 'e' || mode === 'w')) {
    // Image edge resizing: allow free resizing on edges (no aspect ratio lock)
    if (mode.includes('e')) m.w = clampW((m.w || 0) + dx);
    if (mode.includes('s')) m.h = clampH((m.h || 0) + dy);
    if (mode.includes('w')) { m.x += dx; m.w = clampW((m.w || 0) - dx); }
    if (mode.includes('n')) { m.y += dy; m.h = clampH((m.h || 0) - dy); }
    
  } else {
    // Normal resize behavior for non-image elements
    if (mode.includes('e')) m.w = clampW((m.w || 0) + dx);
    if (mode.includes('s')) m.h = clampH((m.h || 0) + dy);
    if (mode.includes('w')) { m.x += dx; m.w = clampW((m.w || 0) - dx); }
    if (mode.includes('n')) { m.y += dy; m.h = clampH((m.h || 0) - dy); }
  }
}

