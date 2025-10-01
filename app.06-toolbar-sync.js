/* ----------------------- Toolbar sync ----------------------- */
function syncFormatToolbar(m){
  const bar = formatToolbar(); if (!bar) return;
  const setVal = (sel, val) => { const el = bar.querySelector(sel); if (el && document.activeElement !== el) el.value = val ?? ''; };
  const press = (sel, on) => { const b = bar.querySelector(sel); if (b){ b.setAttribute('aria-pressed', on ? 'true':'false'); }};

  // If a table cell/range is active, reflect the anchor cell styles in the toolbar
  if (tableSel && m.type === 'table'){
    const tModel = m;
    const ar = Math.min(tableSel.r0, tableSel.r1);
    const ac = Math.min(tableSel.c0, tableSel.c1);
    const id = tModel.grid[ar]?.[ac];
    const cell = id ? tModel.cells[id] : null;
    const cs = cell ? cell.styles || {} : {};
    setVal('input[data-prop="styles.fill"]', cs.bg);
    setVal('input[data-prop="styles.textColor"]', cs.textColor);
    // Stroke properties are per-cell too in our applier
    setVal('input[data-prop="styles.strokeColor"]', cs.strokeColor ?? m.styles.strokeColor);
    setVal('input[data-prop="styles.strokeWidth"]', (cs.strokeWidth ?? m.styles.strokeWidth) || 0);
    setVal('select[data-prop="styles.fontFamily"]', cs.fontFamily ?? 'system-ui');
    setVal('select[data-prop="styles.fontSize"]', cs.fontSize ?? 14);
    press('[data-toggle="styles.bold"]', !!cs.bold);
    press('[data-toggle="styles.italic"]', !!cs.italic);
    press('[data-toggle="styles.underline"]', !!cs.underline);
  } else {
    // Normal element selection
  setVal('input[data-prop="styles.fill"]', m.styles.fill);
  setVal('input[data-prop="styles.textColor"]', m.styles.textColor);
  setVal('input[data-prop="styles.strokeColor"]', m.styles.strokeColor);
  setVal('input[data-prop="styles.strokeWidth"]', m.styles.strokeWidth || 0);
  setVal('input[data-prop="styles.radius"]', m.styles.radius || 0);
  setVal('select[data-prop="styles.fontFamily"]', m.styles.fontFamily);
  setVal('select[data-prop="styles.fontSize"]', m.styles.fontSize || 14);
  press('[data-toggle="styles.bold"]', !!m.styles.bold);
  press('[data-toggle="styles.italic"]', !!m.styles.italic);
  press('[data-toggle="styles.underline"]', !!m.styles.underline);
  }
  // text alignment
  const setPressed = (selector, value, expected) => {
    const btn = bar.querySelector(selector); if (btn) btn.setAttribute('aria-pressed', String(value === expected));
  };
  if (m.type === 'text' || m.type === 'field' || m.type === 'rect'){
    setPressed('[data-align-h="left"]', m.styles.textAlignH || 'left', 'left');
    setPressed('[data-align-h="center"]', m.styles.textAlignH || 'left', 'center');
    setPressed('[data-align-h="right"]', m.styles.textAlignH || 'left', 'right');
    setPressed('[data-align-v="top"]', m.styles.textAlignV || 'top', 'top');
    setPressed('[data-align-v="middle"]', m.styles.textAlignV || 'top', 'middle');
    setPressed('[data-align-v="bottom"]', m.styles.textAlignV || 'top', 'bottom');
  } else {
    ['left','center','right'].forEach(k => { const b = bar.querySelector(`[data-align-h="${k}"]`); if (b) b.setAttribute('aria-pressed','false'); });
    ['top','middle','bottom'].forEach(k => { const b = bar.querySelector(`[data-align-v="${k}"]`); if (b) b.setAttribute('aria-pressed','false'); });
  }
  const tbg = document.getElementById('bgTransparentToggle');
  if (tbg) tbg.checked = m.styles.fill === 'transparent';
}
/* deepMerge moved to editor.core.js */
