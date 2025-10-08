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

function applyResize(m, dx, dy, mode){
  if (m.type === 'line') return;
  const minW = 10, minH = 10;
  let minTableW = minW, minTableH = minH;
  if (m.type === 'table'){
    minTableW = (m.colWidths || []).reduce((a,b)=>a+b, 0) || minW;
    minTableH = (m.rowHeights || []).reduce((a,b)=>a+b, 0) || minH;
  }
  const clampW = (w) => Math.max(m.type==='table'?minTableW:minW, w);
  const clampH = (h) => Math.max(m.type==='table'?minTableH:minH, h);
  
  // For images: lock aspect ratio when resizing from corners
  const isCornerResize = (mode === 'nw' || mode === 'ne' || mode === 'sw' || mode === 'se');
  if (m.type === 'image' && isCornerResize) {
    const startW = m.w || minW;
    const startH = m.h || minH;
    const aspectRatio = startW / startH;
    
    // Use the dominant axis (larger absolute change) to determine scaling
    let scale = 1;
    if (Math.abs(dx) > Math.abs(dy)) {
      // Width is dominant - scale based on width change
      if (mode.includes('e')) scale = (startW + dx) / startW;
      else if (mode.includes('w')) scale = (startW - dx) / startW;
    } else {
      // Height is dominant - scale based on height change
      if (mode.includes('s')) scale = (startH + dy) / startH;
      else if (mode.includes('n')) scale = (startH - dy) / startH;
    }
    
    const newW = clampW(startW * scale);
    const newH = clampH(newW / aspectRatio);
    
    // For corner resizing, we need to adjust position to keep the opposite corner anchored
    // Calculate how much the size changed
    const deltaW = newW - startW;
    const deltaH = newH - startH;
    
    // Adjust position based on which corner is being dragged
    if (mode === 'nw') {
      // Northwest: anchor bottom-right corner
      m.x += -deltaW;  // Move left by the width increase
      m.y += -deltaH;  // Move up by the height increase
    } else if (mode === 'ne') {
      // Northeast: anchor bottom-left corner
      m.y += -deltaH;  // Move up by the height increase (x stays same)
    } else if (mode === 'sw') {
      // Southwest: anchor top-right corner
      m.x += -deltaW;  // Move left by the width increase (y stays same)
    } else if (mode === 'se') {
      // Southeast: anchor top-left corner (no position change needed)
    }
    
    m.w = newW;
    m.h = newH;
  } else {
    // Normal resize behavior for non-images or edge resizing
    if (mode.includes('e')) m.w = clampW((m.w || 0) + dx);
    if (mode.includes('s')) m.h = clampH((m.h || 0) + dy);
    if (mode.includes('w')) { m.x += dx; m.w = clampW((m.w || 0) - dx); }
    if (mode.includes('n')) { m.y += dy; m.h = clampH((m.h || 0) - dy); }
  }
}

