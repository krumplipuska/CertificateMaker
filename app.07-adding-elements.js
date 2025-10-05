/* ----------------------- Adding elements ----------------------- */
let pendingAddType = null; // 'text'|'rect'|'line' for single insertion
function armAdd(type){ pendingAddType = type; }

function placePendingAt(x, y, pageId = Model.document.currentPageId){
  if (!pendingAddType) return;
  commitHistory('add-element');
  const base = {
    id: generateId(), type: pendingAddType, x, y, w: 160, h: 60, z: 1,
    styles: { fill:'#ffffff', strokeColor:'#111827', strokeWidth:1, radius:4,
      textColor:'#111827', fontFamily:'system-ui', fontSize:14, bold:false, italic:false, underline:false }
  };
  base.freeMove = false; // default behavior keeps element constrained to page
  if (pendingAddType === 'rect') base.styles.fill = '#dbeafe';
  if (pendingAddType === 'line') Object.assign(base, { x2: x+120, y2: y });
  if (pendingAddType === 'text') base.content = '';
  if (pendingAddType === 'field') base.content = '';
  // Special: a simple function button element (free-moving by default)
  if (pendingAddType === 'funcbtn'){
    base.type = 'rect';
    base.w = 120; base.h = 36;
    base.styles.fill = '#fafafa';
    base.styles.strokeColor = '#111827';
    base.styles.radius = 6;
    base.styles.textAlignH = 'center';
    base.styles.textAlignV = 'middle';
    base.content = 'Run Action';
    base.attrs = Object.assign({}, base.attrs, {
      role: 'button',
      tabindex: 0,
      'data-run-actions-in-edit': 'true',
      onclick: "simpleConsoleLogFunction('clicked')"
    });
    base.freeMove = true; // make toolbar buttons free-move by default
  }
  if (pendingAddType === 'image') { base.type = 'image'; base.w = 160; base.h = 120; }
  if (pendingAddType === 'table') {
    const t = makeTableElement(3,4);
    Object.assign(base, t, { x, y });
    // Tables should not have an outer border by default
    base.styles.strokeWidth = 0;
  }
  // New stacked Block container
  if (pendingAddType === 'block') {
    base.type = 'block';
    base.w = 420; base.h = 180;
    base.styles.fill = '#ffffff';
    base.styles.strokeWidth = 1;
    base.styles.radius = 8;
    base.stackChildren = true;
    base.stackByPage = true;
    base.freeMove = false;
  }
  const page = Model.document.pages.find(p => p.id === pageId) || getCurrentPage();
  page.elements.push(base);
  Model.document.currentPageId = page.id;
  // If dropped inside a block, parent it before reflow
  try { reparentIntoBlocks(page, [base.id]); } catch {}
  // Immediately reflow page stacks so newly added elements snap into place
  try { reflowStacks(page, { removeEmptyPages: false }); } catch {}
  // Show the page if it was hidden (now that it has stacking elements)
  try {
    const hasStackingElements = Array.isArray(page.elements) && page.elements.some(el => el && !el.freeMove);
    if (hasStackingElements && typeof setPageHiddenById === 'function') setPageHiddenById(page.id, false);
  } catch {}
  pendingAddType = null; // single insertion
  renderPage(page);
  setSelection([base.id]);
}

