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
  if (mode.includes('e')) m.w = clampW((m.w || 0) + dx);
  if (mode.includes('s')) m.h = clampH((m.h || 0) + dy);
  if (mode.includes('w')) { m.x += dx; m.w = clampW((m.w || 0) - dx); }
  if (mode.includes('n')) { m.y += dy; m.h = clampH((m.h || 0) - dy); }
}

