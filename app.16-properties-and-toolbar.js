/* ----------------------- Properties & Toolbar ----------------------- */
function bindFloatingToolbar(){
  const bar = formatToolbar();
  const hBtn = document.getElementById('alignHBtn');
  const vBtn = document.getElementById('alignVBtn');
  const tbg = document.getElementById('bgTransparentToggle');
  const decDownBtn = document.getElementById('decDownBtn');
  const decUpBtn = document.getElementById('decUpBtn');
  const readAlignForContext = () => {
    if (tableSel){
      const tModel = getElementById(tableSel.tableId);
      if (tModel){
        const ar = Math.min(tableSel.r0, tableSel.r1);
        const ac = Math.min(tableSel.c0, tableSel.c1);
        const id = tModel.grid[ar]?.[ac];
        const cell = id ? tModel.cells[id] : null;
        if (cell) return { h: cell.styles.alignH || 'left', v: cell.styles.alignV || 'top' };
      }
    }
    return readAlign();
  };
  bar.addEventListener('input', (e) => {
    const t = e.target;
    const prop = t.getAttribute('data-prop');
    if (!prop) return;
    
    const raw = (t.type === 'number' || t.type === 'range') ? Number(t.value) : t.value;
    
    // PRIORITY 1: If we have active table cell selection, always apply to cells
    if (tableSel) {
      const tModel = getElementById(tableSel.tableId);
      if (!tModel) return;
      
      // Handle different property types
      if (prop === 'styles.fill') {
        updateElement(tModel.id, tableApplyCellBg(tModel, tableSel, raw));
        return;
      }
      if (prop === 'styles.textColor') {
        updateElement(tModel.id, tableApplyTextColor(tModel, tableSel, raw));
        return;
      }
      
      // Handle cell-level styles (stroke, font, etc.)
      const cellStyleProps = ['styles.strokeColor', 'styles.strokeWidth', 'styles.fontFamily', 'styles.fontSize'];
      if (cellStyleProps.includes(prop)) {
        const key = prop.split('.')[1]; // Extract property name after 'styles.'
        updateElement(tModel.id, tableApplyCellStyle(tModel, tableSel, key, raw));
        return;
      }
    }
    
    // PRIORITY 2: If table elements are selected but no cells, try to restore last cell selection
    const selectedElements = [...selectedIds].map(id => getElementById(id)).filter(Boolean);
    const hasOnlyTables = selectedElements.length > 0 && selectedElements.every(el => el.type === 'table');
    
    if (hasOnlyTables && !tableSel && lastTableSel) {
      // Try to restore the last table selection for the selected table
      const selectedTable = selectedElements[0];
      if (selectedTable.id === lastTableSel.tableId) {
        setTableSelection(lastTableSel.tableId, lastTableSel.r0, lastTableSel.c0, lastTableSel.r1, lastTableSel.c1);
        // Now apply the formatting to the restored selection
        const tModel = getElementById(lastTableSel.tableId);
        if (tModel) {
          if (prop === 'styles.fill') {
            updateElement(tModel.id, tableApplyCellBg(tModel, tableSel, raw));
            return;
          }
          if (prop === 'styles.textColor') {
            updateElement(tModel.id, tableApplyTextColor(tModel, tableSel, raw));
            return;
          }
          const cellStyleProps = ['styles.strokeColor', 'styles.fontFamily', 'styles.fontSize', 'styles.strokeWidth'];
          if (cellStyleProps.includes(prop)) {
            const key = prop.split('.')[1];
            updateElement(tModel.id, tableApplyCellStyle(tModel, tableSel, key, raw));
            return;
          }
        }
      }
    }
    
    // PRIORITY 3: Prevent styling table containers when no cell selection exists
    if (hasOnlyTables && !tableSel) {
      // Block styling of table containers - user should select cells instead
      return;
    }
    
    // PRIORITY 4: Apply to regular element selection (non-table elements)
    if (selectedIds.size === 0) return;
    applyPatchToSelection(toPatch(prop, raw));
  });
  bar.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle],[data-z]');
    if (!t) return;
    if (t.dataset.toggle){
      const key = t.dataset.toggle;
      
      // PRIORITY 1: If we have active table cell selection, always apply to cells
      if (tableSel && key.startsWith('styles.')){
        const tModel = getElementById(tableSel.tableId); 
        if (!tModel) return;
        const styleKey = key.split('.')[1];
        const anyOff = tableAnyCellStyleOff(tModel, tableSel, styleKey);
        updateElement(tModel.id, tableApplyCellStyle(tModel, tableSel, styleKey, anyOff));
        t.setAttribute('aria-pressed', String(anyOff));
        return;
      }
      
      // PRIORITY 2: If table elements are selected but no cells, try to restore last cell selection  
      const selectedElements = [...selectedIds].map(id => getElementById(id)).filter(Boolean);
      const hasOnlyTables = selectedElements.length > 0 && selectedElements.every(el => el.type === 'table');
      
      if (hasOnlyTables && !tableSel && lastTableSel && key.startsWith('styles.')) {
        const selectedTable = selectedElements[0];
        if (selectedTable.id === lastTableSel.tableId) {
          setTableSelection(lastTableSel.tableId, lastTableSel.r0, lastTableSel.c0, lastTableSel.r1, lastTableSel.c1);
          // Now apply the toggle to the restored selection
          const tModel = getElementById(lastTableSel.tableId);
          if (tModel) {
            const styleKey = key.split('.')[1];
            const anyOff = tableAnyCellStyleOff(tModel, tableSel, styleKey);
            updateElement(tModel.id, tableApplyCellStyle(tModel, tableSel, styleKey, anyOff));
            t.setAttribute('aria-pressed', String(anyOff));
            return;
          }
        }
      }
      
      // PRIORITY 3: Prevent styling table containers when no cell selection exists
      if (hasOnlyTables && !tableSel) {
        // Block styling of table containers - user should select cells instead
        return;
      }
      
      // PRIORITY 4: Apply to regular element selection (non-table elements)
      if (selectedIds.size === 0) return;
      const anyOff = [...selectedIds].some(id => !getByPath(getElementById(id), key));
      applyPatchToSelection(toPatch(key, anyOff));
      t.setAttribute('aria-pressed', String(anyOff));
    } else if (t.dataset.z){
      const dir = t.dataset.z;
      moveZ(dir);
    }
  });

  decDownBtn.addEventListener('click', () => {
    changeDecimal(false);
  });

  decUpBtn.addEventListener('click', () => {
    changeDecimal(true);
  });

  tbg.addEventListener('change', () => {
    const patch = toPatch('styles.fill', tbg.checked ? 'transparent' : '#ffffff');
    applyPatchToSelection(patch);
  });

  const cycle = (val, list) => list[(list.indexOf(val) + 1) % list.length];
  const readAlign = () => {
    if (selectedIds.size !== 1) return { h:'left', v:'top' };
    const m = getElementById([...selectedIds][0]);
    return { h: m?.styles?.textAlignH || 'left', v: m?.styles?.textAlignV || 'top' };
  };
  window.applyAlignButtonState = function applyAlignButtonState(){
    const {h,v} = readAlign();
    hBtn.classList.remove('h-left','h-center','h-right');
    vBtn.classList.remove('v-top','v-middle','v-bottom');
    hBtn.classList.add('h-'+h);
    vBtn.classList.add(v === 'middle' ? 'v-middle' : 'v-'+v);
    const t = selectedIds.size === 1 ? getElementById([...selectedIds][0])?.type : null;
    const pressed = selectedIds.size === 1 && (t === 'text' || t === 'field' || t === 'rect');
    hBtn.setAttribute('aria-pressed', String(pressed));
    vBtn.setAttribute('aria-pressed', String(pressed));
  };
  hBtn.addEventListener('click', () => {
    const {h} = readAlignForContext();
    const next = cycle(h, ['left','center','right']);
    if (tableSel){
      const tModel = getElementById(tableSel.tableId);
      if (tModel) updateElement(tModel.id, tableApplyAlign(tModel, tableSel, next, undefined));
    } else {
      applyPatchToSelection(toPatch('styles.textAlignH', next));
      window.applyAlignButtonState();
    }
  });
  vBtn.addEventListener('click', () => {
    const {v} = readAlignForContext();
    const next = cycle(v, ['top','middle','bottom']);
    if (tableSel){
      const tModel = getElementById(tableSel.tableId);
      if (tModel) updateElement(tModel.id, tableApplyAlign(tModel, tableSel, undefined, next));
    } else {
      applyPatchToSelection(toPatch('styles.textAlignV', next));
      window.applyAlignButtonState();
    }
  });

  // Initialize align toggle state on load
  window.applyAlignButtonState();
}

function changeDecimal(increase){
  // If there is an active table cell selection, adjust those cells
  if (tableSel){
    const tModel = getElementById(tableSel.tableId);
    if (!tModel) return;

    const r0 = Math.min(tableSel.r0, tableSel.r1);
    const r1 = Math.max(tableSel.r0, tableSel.r1);
    const c0 = Math.min(tableSel.c0, tableSel.c1);
    const c1 = Math.max(tableSel.c0, tableSel.c1);

    const next = deepClone(tModel);
    let any = false;
    const dpList = [];
    const numericCells = [];
    for (let r = r0; r <= r1; r++){
      for (let c = c0; c <= c1; c++){
        const cellId = next.grid[r]?.[c];
        const cell = cellId ? next.cells[cellId] : null;
        if (!cell) continue;
        const raw = String(cell.content ?? '').trim();
        if (raw === '') continue;
        const num = Number(raw);
        if (Number.isNaN(num)) continue;
        let dp = 0;
        const dot = raw.indexOf('.');
        if (dot !== -1) dp = raw.length - dot - 1;
        dpList.push(dp);
        numericCells.push({ cell, num });
      }
    }
    if (dpList.length === 0) return;
    const targetDp = increase ? (Math.max(...dpList) + 1) : Math.max(0, Math.min(...dpList) - 1);
    numericCells.forEach(({ cell, num }) => { cell.content = num.toFixed(targetDp); any = true; });
    if (any){
      commitHistory('table-decimal-change');
      updateElement(next.id, next);
    }
    return;
  }

  // Otherwise, adjust decimal places for any selected elements with numeric content
  if (selectedIds.size > 0){
    const prevSelected = [...selectedIds];
    let any = false;
    commitHistory('decimal-change');
    const page = getCurrentPage();
    const idToIndex = new Map();
    page.elements.forEach((el, idx) => { idToIndex.set(el.id, idx); });
    const dpList = [];
    const targets = [];
    [...selectedIds].forEach(id => {
      const idx = idToIndex.get(id);
      if (idx == null) return;
      const el = page.elements[idx];
      if (!el || !('content' in el)) return;
      const raw = String(el.content ?? '').trim();
      if (raw === '') return;
      const num = Number(raw);
      if (Number.isNaN(num)) return;
      let dp = 0;
      const dot = raw.indexOf('.');
      if (dot !== -1) dp = raw.length - dot - 1;
      dpList.push(dp);
      targets.push({ el, num });
    });
    if (dpList.length === 0) return;
    const targetDp = increase ? (Math.max(...dpList) + 1) : Math.max(0, Math.min(...dpList) - 1);
    targets.forEach(({ el, num }) => {
      const nextContent = num.toFixed(targetDp);
      if (nextContent !== el.content){ el.content = nextContent; any = true; }
    });
    if (any){
      renderPage(page);
      try { setSelection(prevSelected); updateSelectionUI(); } catch {}
    }
  }
}

// ... existing code ...

function toPatch(path, value){
  const keys = path.split('.');
  let obj = {}; let cur = obj;
  keys.forEach((k, i) => { if (i === keys.length - 1) cur[k] = value; else { cur[k] = {}; cur = cur[k]; } });
  return obj;
}
function getByPath(obj, path){
  const ks = path.split('.'); let cur = obj; for (const k of ks){ if (cur==null) return undefined; cur = cur[k]; } return cur;
}
function togglePatch(path){
  const keys = path.split('.');
  const page = getCurrentPage();
  const m = page.elements.find(e => selectedIds.has(e.id));
  let cur = m;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  const last = keys[keys.length - 1];
  return toPatch(path, !cur[last]);
}

// Parse a string from the properties panel into a JS value
function parsePropertyValue(raw){
  const txt = String(raw ?? '').trim();
  if (txt === '') return '';
  if (txt === 'true') return true;
  if (txt === 'false') return false;
  if (txt === 'null') return null;
  // Try number
  const asNum = Number(txt);
  if (!Number.isNaN(asNum) && /^-?\d*(?:\.\d+)?$/.test(txt)) return asNum;
  // Try JSON for arrays/objects
  if ((txt.startsWith('{') && txt.endsWith('}')) || (txt.startsWith('[') && txt.endsWith(']'))){
    try { return JSON.parse(txt); } catch {}
  }
  return raw; // fallback to original string
}

// Keys that are part of the element model and should not be treated as HTML attributes
const RESERVED_MODEL_KEYS = new Set(['id','type','groupId','parentId','stackChildren','stackByPage','pageBreak','repeatOnAllPages','freeMove','x','y','w','h','z','x2','y2','content','src','styles','grid','rows','cols','rowHeights','colWidths']);

// Persistent Properties panel filter
const PROPS_FILTER_STORAGE_KEY = 'propertiesPanel.filter.hiddenKeys.v1';
const DEFAULT_FILTER_KEYS = [
  'id','type','groupId','cellId','x','y','w','h','z','content','formula',
  'stackChildren','stackByPage','pageBreak','repeatOnAllPages','freeMove','Actions',
  'docHeaderHeight','docFooterHeight'
];
function loadHiddenPropKeys(){
  try {
    const raw = localStorage.getItem(PROPS_FILTER_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.map(String));
  } catch {}
  return new Set();
}
function saveHiddenPropKeys(set){
  try { localStorage.setItem(PROPS_FILTER_STORAGE_KEY, JSON.stringify(Array.from(set))); } catch {}
}
function isPropVisibleKey(key){
  const hidden = (window.__HIDDEN_PROP_KEYS || (window.__HIDDEN_PROP_KEYS = loadHiddenPropKeys()));
  return !hidden.has(String(key));
}
function setPropVisibleKey(key, visible){
  const hidden = (window.__HIDDEN_PROP_KEYS || (window.__HIDDEN_PROP_KEYS = loadHiddenPropKeys()));
  const k = String(key);
  if (visible) hidden.delete(k); else hidden.add(k);
  window.__HIDDEN_PROP_KEYS = hidden;
  saveHiddenPropKeys(hidden);
}
function openPropsFilterMenu(anchor){
  try { if (!anchor) return; } catch { return; }
  // Close any existing
  const old = document.getElementById('propsFilterMenu');
  if (old) old.remove();
  const menu = document.createElement('div');
  menu.id = 'propsFilterMenu';
  menu.setAttribute('role','menu');
  menu.style.position = 'fixed';
  menu.style.zIndex = '1202';
  menu.style.background = '#fff';
  menu.style.border = '1px solid rgba(0,0,0,.08)';
  menu.style.borderRadius = '10px';
  menu.style.boxShadow = 'var(--shadow)';
  menu.style.padding = '8px';
  menu.style.minWidth = '180px';
  menu.style.maxHeight = '50vh';
  menu.style.overflow = 'auto';
  const rect = anchor.getBoundingClientRect();
  menu.style.top = (rect.bottom + 6) + 'px';
  menu.style.right = (window.innerWidth - rect.right) + 'px';

  const list = document.createElement('div');
  list.style.display = 'grid';
  list.style.rowGap = '6px';
  list.style.fontSize = '12px';
  const keysNow = new Set(DEFAULT_FILTER_KEYS);
  try { (window.__CURRENT_PROP_KEYS || []).forEach(k => keysNow.add(String(k))); } catch {}
  const keys = Array.from(keysNow);
  keys.sort((a,b) => a.localeCompare(b));
  const hidden = (window.__HIDDEN_PROP_KEYS || (window.__HIDDEN_PROP_KEYS = loadHiddenPropKeys()));
  keys.forEach((k) => {
    const row = document.createElement('label');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '18px 1fr';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !hidden.has(k);
    cb.addEventListener('change', () => { setPropVisibleKey(k, cb.checked); renderProperties(); });
    const span = document.createElement('span'); span.textContent = k;
    row.appendChild(cb); row.appendChild(span);
    list.appendChild(row);
  });
  menu.appendChild(list);

  document.body.appendChild(menu);
  // Close interactions
  const close = () => { menu.remove(); document.removeEventListener('mousedown', onDown, true); window.removeEventListener('blur', close); };
  const onDown = (e) => { if (!menu.contains(e.target) && e.target !== anchor) close(); };
  setTimeout(() => { document.addEventListener('mousedown', onDown, true); window.addEventListener('blur', close); }, 0);
}

function getCustomAttributesFromModel(model){
  const attrs = Object.assign({}, model && model.attrs ? model.attrs : {});
  // Also treat unknown top-level primitives as attributes for backward-compat
  if (model && typeof model === 'object'){
    Object.keys(model).forEach((k) => {
      if (RESERVED_MODEL_KEYS.has(k)) return;
      if (k === 'attrs') return;
      const v = model[k];
      const isPrimitive = (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
      if (isPrimitive) attrs[k] = v;
    });
  }
  return attrs;
}
function renderProperties(){
  const box = propertiesContent();
  try { console.log('[RENDER] renderProperties: selectionSize=', selectedIds.size, 'tableSel=', !!tableSel); } catch {}
  box.innerHTML = '';
  if (selectedIds.size === 0 && !tableSel) return;
  const page = getCurrentPage();
  let m = null; let groupId = null; let cellId = '';
  if (tableSel){
    // Show cell id for the anchor cell when a table selection exists
    const tModel = getElementById(tableSel.tableId);
    if (tModel){
      const ar = Math.min(tableSel.r0, tableSel.r1);
      const ac = Math.min(tableSel.c0, tableSel.c1);
      const cid = tModel.grid[ar]?.[ac];
      if (cid) cellId = cid;
      m = tModel; // fall through to show table properties too
    }
  }
  if (!m){
    if (selectedIds.size === 1){
      const one = [...selectedIds][0];
      m = page.elements.find(e => e.id === one);
      groupId = m?.groupId || '';
    } else if (selectedIds.size > 1){
      // multi: if all have same group, show it
      const ids = [...selectedIds];
      const first = page.elements.find(e => e.id === ids[0]);
      const gid = first?.groupId;
      const same = gid && ids.every(id => page.elements.find(e => e.id === id)?.groupId === gid);
      if (same) groupId = gid;
      m = first;
    }
  }
  if (!m) m = page.elements.find(e => selectedIds.has(e.id));
  // Base rows from core model
  const rows = [
    ['id', m?.id || 'multi'], ['type', m?.type || 'multi'], ['groupId', groupId || ''], ['x', m?.x], ['y', m?.y], ['w', m?.w], ['h', m?.h], ['z', m?.z]
  ];
  if (cellId) rows.unshift(['cellId', cellId]);
  
  // Add editable text content + formula field for text-like elements
  if (m && (m.type === 'text' || m.type === 'field' || m.type === 'rect')) {
    rows.push(['content', m.content || '']);
    const formula = (m && m.attrs && typeof m.attrs.formula === 'string') ? m.attrs.formula : '';
    rows.push(['formula', formula]);
  }
  
  // Include custom attributes as flat props for editing
  let customAttrs = getCustomAttributesFromModel(m || {});
  // Avoid duplicating builtin formula row when attrs also contains formula
  if (m && (m.type === 'text' || m.type === 'field' || m.type === 'rect')){
    if (customAttrs && Object.prototype.hasOwnProperty.call(customAttrs, 'formula')){
      delete customAttrs.formula;
    }
  }
  const customAttrKeys = new Set(Object.keys(customAttrs));
  Object.keys(customAttrs).forEach((name) => {
    rows.push([name, customAttrs[name]]);
  });

  // When a table cell is selected, also expose its per-cell attrs.* for editing
  if (m && m.type === 'table' && tableSel) {
    const rr = Math.min(tableSel.r0, tableSel.r1);
    const cc = Math.min(tableSel.c0, tableSel.c1);
    const cid = m.grid?.[rr]?.[cc];
    const cell = cid ? m.cells?.[cid] : null;
    if (cell && cell.attrs){
      Object.keys(cell.attrs).forEach((name) => {
        rows.push([`cell.${name}`, cell.attrs[name]]);
      });
    }
  }

  // Add document-level properties (header/footer height)
  if (isPropVisibleKey('docHeaderHeight')) {
    rows.push(['docHeaderHeight', Model.document?.headerHeight || 10]);
  }
  if (isPropVisibleKey('docFooterHeight')) {
    rows.push(['docFooterHeight', Model.document?.footerHeight || 10]);
  }

  // Share the keys with the filter menu builder
  try { window.__CURRENT_PROP_KEYS = new Set(rows.map(r => r[0])); } catch {}

  rows.forEach(([k,v]) => {
    if (!isPropVisibleKey(k)) return;
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('label');
    name.textContent = k;
    let control;
    // Controls by type
    if (k === 'fontSize') {
      control = document.createElement('select');
      control.innerHTML = '<option>8</option><option>9</option><option>10</option><option>11</option><option>12</option><option>14</option><option>16</option><option>18</option><option>20</option><option>24</option><option>28</option><option>32</option><option>36</option><option>48</option><option>72</option>';
      control.dataset.prop = 'styles.'+k;
      control.value = String(v);
    } else if (k === 'fontFamily') {
      control = document.createElement('select');
      control.innerHTML = '<option value="system-ui">System</option><option value="Arial">Arial</option><option value="Helvetica Neue">Helvetica</option><option value="Times New Roman">Times</option><option value="Georgia">Georgia</option><option value="Courier New">Courier</option>';
      control.dataset.prop = 'styles.'+k;
      control.value = String(v);
    } else if (k === 'textColor') {
      control = document.createElement('input'); control.type = 'color'; control.value = v || '#111827'; control.dataset.prop = 'styles.'+k;
    } else if (k === 'bold' || k === 'italic') {
      control = document.createElement('input'); control.type = 'checkbox'; control.checked = !!v; control.dataset.prop = 'styles.'+k;
    } else if (k === 'content' || k === 'formula' || (customAttrKeys.has(k) && typeof v === 'string')) {
      control = document.createElement('textarea');
      control.rows = 3;
      control.value = v ?? '';
      control.dataset.prop = k;
      if (k === 'formula'){
        // Element picker button beside textarea (inline)
        // Keep simple: when clicking, it inserts a '#id' token at caret
        const wrap = document.createElement('div'); wrap.style.display='grid'; wrap.style.gridTemplateColumns='1fr 28px'; wrap.style.gap='6px';
        const pick = document.createElement('button'); pick.type='button'; pick.className='btn mini';
        pick.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
        const area = control;
        wrap.appendChild(area); wrap.appendChild(pick); control = wrap; // replace control with wrap
        // picker behavior: choose element or table cell and insert token
        pick.addEventListener('click', () => {
          // preserve selection
          const prevSelIds = Array.from(document.querySelectorAll('.page .element.selected')).map(n=>n.getAttribute('data-id')).filter(Boolean);
          const pageEl = document.querySelector('.page'); if (!pageEl) return;
          let last; window.__PICKING = true; document.body.classList.add('app-noselect');
          const block = (ev)=>{ ev.stopPropagation(); ev.preventDefault(); };
          document.addEventListener('pointerdown', block, true);
          document.addEventListener('mousedown', block, true);
          const onMove = (ev)=>{ const cell=ev.target.closest('.table-cell'); const el=cell||ev.target.closest('.page .element'); if (last===el) return; if (last) last.style.outline=''; last=el; if (last) last.style.outline='2px solid var(--primary)'; };
          const done = ()=>{ document.removeEventListener('mousemove', onMove, true); document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', block, true); document.removeEventListener('mousedown', block, true); if (last) last.style.outline=''; window.__PICKING=false; document.body.classList.remove('app-noselect'); if (Array.isArray(prevSelIds) && prevSelIds.length && typeof setSelection==='function') setSelection(prevSelIds); };
          const onKey = (e)=>{ if (e.key==='Escape'){ e.preventDefault(); done(); } };
          const onClick = (e)=>{ const cell=e.target.closest('.table-cell'); const el=cell||e.target.closest('.page .element'); if (!el){ done(); return; } e.preventDefault(); e.stopPropagation(); let token=''; if (cell){ const cid=cell.getAttribute('data-id'); if (cid) token = `#${cid}`; } else { const id=el.getAttribute('data-id'); if (id) token = `#${id}`; } const ta = wrap.querySelector('textarea'); if (ta){ const start = ta.selectionStart ?? ta.value.length; const end = ta.selectionEnd ?? ta.value.length; ta.value = ta.value.slice(0,start) + token + ta.value.slice(end); ta.dispatchEvent(new Event('change', { bubbles:true })); ta.focus(); ta.selectionStart = ta.selectionEnd = start + token.length; } done(); };
          document.addEventListener('mousemove', onMove, true);
          document.addEventListener('click', onClick, true);
          document.addEventListener('keydown', onKey, true);
        });
      }
    } else {
      control = document.createElement('input'); control.value = v ?? ''; control.dataset.prop = k;
    }
    row.appendChild(name);
    row.appendChild(control);
    box.appendChild(row);
  });

  // Block-specific: stacking children toggle
  if (m && m.type === 'block'){
    if (isPropVisibleKey('stackChildren')){
      const row = document.createElement('div'); row.className = 'row'; row.style.display = 'flex'; row.style.alignItems = 'center';
      const lab = document.createElement('label'); lab.textContent = 'stackChildren';
      const ctl = document.createElement('input'); ctl.type='checkbox'; ctl.dataset.prop = 'stackChildren'; ctl.checked = !!m.stackChildren;
      row.appendChild(lab); row.appendChild(ctl); box.appendChild(row);
    }
  }

  // Generic: stackByPage toggle available for all element types
  if (m){
    if (isPropVisibleKey('stackByPage')){
      const row2 = document.createElement('div'); row2.className = 'row'; row2.style.display = 'flex'; row2.style.alignItems = 'center';
      const lab2 = document.createElement('label'); lab2.textContent = 'Page Flow'; lab2.title = 'Auto-flow this element across pages based on vertical order.';
      const ctl2 = document.createElement('input'); ctl2.type='checkbox'; ctl2.dataset.prop = 'stackByPage'; ctl2.checked = !!m.stackByPage;
      row2.appendChild(lab2); row2.appendChild(ctl2); box.appendChild(row2);
    }

    // Page break toggle: forces this element to start on a new page
    if (isPropVisibleKey('pageBreak')){
      const row3 = document.createElement('div'); row3.className = 'row'; row3.style.display = 'flex'; row3.style.alignItems = 'center';
      const lab3 = document.createElement('label'); lab3.textContent = 'Start New Page'; lab3.title = 'Force this element to start on a new page.';
      const ctl3 = document.createElement('input'); ctl3.type='checkbox'; ctl3.dataset.prop = 'pageBreak'; ctl3.checked = !!m.pageBreak;
      row3.appendChild(lab3); row3.appendChild(ctl3); box.appendChild(row3);
    }

    // Repeat flag (single checkbox)
    if (isPropVisibleKey('repeatOnAllPages')){
      const row4 = document.createElement('div'); row4.className = 'row'; row4.style.display = 'flex'; row4.style.alignItems = 'center';
      const lab4 = document.createElement('label'); lab4.textContent = 'Repeat Every Page'; lab4.title = 'Show this element on every page (for headers/footers).';
      const ctl4 = document.createElement('input'); ctl4.type='checkbox'; ctl4.dataset.prop = 'repeatOnAllPages'; ctl4.checked = !!m.repeatOnAllPages;
      row4.appendChild(lab4); row4.appendChild(ctl4); box.appendChild(row4);
    }

    // Free move (allow positioning outside page bounds, visible overflow)
    if (isPropVisibleKey('freeMove')){
      const row5 = document.createElement('div'); row5.className = 'row'; row5.style.display = 'flex'; row5.style.alignItems = 'center';
      const lab5 = document.createElement('label'); lab5.textContent = 'Free Position'; lab5.title = 'Allow this element to move/appear outside page bounds and across pages (live reparent).';
      const ctl5 = document.createElement('input'); ctl5.type='checkbox'; ctl5.dataset.prop = 'freeMove'; ctl5.checked = !!m.freeMove;
      row5.appendChild(lab5); row5.appendChild(ctl5); box.appendChild(row5);
    }
  }

  // Actions UI (bubble layout): choose function, trigger, and inputs; stack multiple
  if (isPropVisibleKey('Actions')) try {
    const actionsRow = document.createElement('div');
    actionsRow.className = 'row';
    const lbl = document.createElement('label');
    lbl.textContent = 'Actions';
    const container = document.createElement('div');
    container.setAttribute('data-actions','');
    container.style.width = '100%';
    actionsRow.appendChild(lbl);
    actionsRow.appendChild(container);
    box.appendChild(actionsRow);

    // Supported DOM events -> attribute names
    const SUPPORTED = [ 'click','change','input','dblclick','focus','blur' ];

   

    function splitCalls(expr){
      const out = [];
      if (!expr) return out;
      let cur = '', depth = 0, quote = '';
      for (let i=0;i<expr.length;i++){
        const ch = expr[i];
        if (quote){ if (ch === quote && expr[i-1] !== '\\') quote = ''; cur += ch; continue; }
        if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
        if (ch === '(') { depth++; cur += ch; continue; }
        if (ch === ')') { depth = Math.max(0, depth-1); cur += ch; continue; }
        if ((ch === ';' || ch === ',') && depth === 0){ if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    }
    function parseCall(call){
      const m = call.match(/^\s*([\w$]+)\s*\((.*)\)\s*$/);
      if (!m) return { fn:'', args:[] };
      const fn = m[1];
      const argsRaw = m[2].trim();
      if (!argsRaw) return { fn, args:[] };
      const parts = splitCalls(argsRaw).map(s => s.trim()).filter(Boolean);
      return { fn, args: parts };
    }
    function buildExpr(calls){
      return calls.filter(c => c && c.fn).map(c => `${c.fn}(${c.args.join(', ')})`).join('; ');
    }

    function collectExisting(){
      // If a table cell is selected, read actions from the cell's attrs
      if (m && m.type === 'table' && cellId){
        const cell = m.cells ? m.cells[cellId] : null;
        const attrs = (cell && cell.attrs) ? cell.attrs : {};
        const items = [];
        SUPPORTED.forEach(evt => {
          const key = 'on' + evt;
          const expr = String(attrs[key] || '');
          splitCalls(expr).map(parseCall).forEach(c => items.push({ event: evt, fn: c.fn, args: c.args }));
        });
        return items;
      }
      // Otherwise use element-level attrs
      const attrs = getCustomAttributesFromModel(m || {});
      const items = [];
      SUPPORTED.forEach(evt => {
        const key = 'on' + evt;
        const expr = String(attrs[key] || '');
        splitCalls(expr).map(parseCall).forEach(c => items.push({ event: evt, fn: c.fn, args: c.args }));
      });
      return items;
    }

    function writeBack(items){
      // Preserve current selection (elements or table cells) to avoid deselection during updates
      const prevSelIds = Array.from(document.querySelectorAll('.page .element.selected'))
        .map(n => n && n.getAttribute('data-id'))
        .filter(Boolean);
      // Group by event and write complete expressions for each
      const per = {};
      SUPPORTED.forEach(e => per[e] = []);
      items.forEach(it => { if (SUPPORTED.includes(it.event) && it.fn) per[it.event].push({ fn: it.fn, args: it.args || [] }); });

      // If a table cell is selected, write actions into that cell's attrs
      if (m && m.type === 'table' && cellId){
        const next = deepClone(m);
        if (!next.cells[cellId]) next.cells[cellId] = { attrs: {} };
        if (!next.cells[cellId].attrs) next.cells[cellId].attrs = {};
        SUPPORTED.forEach(evt => {
          const expr = buildExpr(per[evt]);
          next.cells[cellId].attrs['on' + evt] = expr;
        });
        updateElement(next.id, next);
        // Restore selection after update
        if (Array.isArray(prevSelIds) && prevSelIds.length && typeof setSelection === 'function') {
          setSelection(prevSelIds);
        }
        return;
      }

      // Otherwise, element-level attrs
      SUPPORTED.forEach(evt => {
        const path = `attrs.on${evt}`;
        const expr = buildExpr(per[evt]);
        applyPatchToSelection(toPatch(path, expr), 'actions-update');
      });
      // Restore selection after attributes update
      if (Array.isArray(prevSelIds) && prevSelIds.length && typeof setSelection === 'function') {
        setSelection(prevSelIds);
      }
    }

    function render(){
      container.innerHTML = '';
      const funcs = getUserFunctionChoices();
      let items = collectExisting();
      const openSet = (window.__ACTION_OPEN || (window.__ACTION_OPEN = new Set()));

      // Add header with + button
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.marginBottom = '6px';
        const title = document.createElement('div');
      title.textContent = 'Adding function (add a bubble)';
      title.style.color = 'var(--muted)';
      title.style.fontSize = '11px';
      const addBtn = document.createElement('button'); addBtn.type='button'; addBtn.className='btn mini';
      addBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      header.appendChild(title); header.appendChild(addBtn);
      container.appendChild(header);

      function addEmpty(){
        const firstFn = funcs[0]?.name || '';
        const inputs = funcs[0]?.inputs || 0;
        items.push({ event: 'click', fn: firstFn, args: Array(inputs).fill("'"+""+"'") });
        writeBack(items); render();
      }
      addBtn.addEventListener('click', addEmpty);

      // List bubbles
      items.forEach((it, idx) => {
        const bubble = document.createElement('div');
        bubble.style.border = '1px solid var(--border)';
        bubble.style.borderRadius = '8px';
        bubble.style.padding = '8px';
        bubble.style.marginBottom = '8px';
        bubble.style.background = '#fafafa';
        bubble.style.width = '100%';
        bubble.style.boxSizing = 'border-box';

        // Top row: function + trigger + remove
        const top = document.createElement('div');
        top.style.display = 'grid';
  top.style.gridTemplateColumns = '28px minmax(0,1fr) 110px 28px 28px';
        top.style.gap = '6px';

        // expand/collapse toggle
        const keyOf = () => `${idx}:${it.event}:${it.fn}`;
        let collapsed = openSet.has(keyOf());
        const expBtn = document.createElement('button');
        expBtn.type = 'button';
        expBtn.className = 'btn mini';
        expBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 10l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

        // Function dropdown (same style as trigger)
        const fnSel = document.createElement('select');
        fnSel.innerHTML = '<option value="">Select function…</option>' + funcs.map(f => `<option value="${f.name}">${f.label}</option>`).join('');
        fnSel.value = it.fn || '';
        fnSel.style.width = '100%';

        const trgSel = document.createElement('select');
        trgSel.innerHTML = SUPPORTED.map(e => `<option value="${e}">${'on'+e}</option>`).join('');
        trgSel.value = it.event;
        trgSel.style.width = '100%';

        const delBtn = document.createElement('button'); delBtn.type='button'; delBtn.className='btn mini';
        delBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        delBtn.style.width = '24px';
        delBtn.style.height = '24px';
        delBtn.style.padding = '0';
        delBtn.style.display = 'inline-flex';
        delBtn.style.alignItems = 'center';
        delBtn.style.justifyContent = 'center';
        delBtn.style.borderRadius = '999px';

        // Play button to execute the selected user function even in edit mode
        const playBtn = document.createElement('button'); playBtn.type='button'; playBtn.className='btn mini';
        playBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
        playBtn.style.width='24px';
        playBtn.style.height='24px';
        playBtn.style.padding='0';
        playBtn.style.display='inline-flex';
        playBtn.style.alignItems='center';
        playBtn.style.justifyContent='center';
        playBtn.style.borderRadius='999px';
        playBtn.title = 'Run function now';
        playBtn.addEventListener('click', () => {
          try {
            const fnName = fnSel.value;
            if (!fnName) return;
            const fn = window[fnName];
            if (typeof fn !== 'function') return;
            // gather current args from inputs (without re-committing if user mid-edit)
            const argVals = Array.from(inputsWrap.querySelectorAll('input')).map(inputEl => {
              const v = String(inputEl.value || '').trim();
              // attempt to parse JSON-like values
              if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))){
                try { return JSON.parse(v); } catch { return v; }
              }
              if (/^-?\d+(?:\.\d+)?$/.test(v)) return parseFloat(v);
              if (/^(true|false)$/i.test(v)) return /true/i.test(v);
              if (/^null$/i.test(v)) return null;
              if (/^undefined$/i.test(v)) return undefined;
              return v; // treat as raw string/selector
            });
            // Temporarily allow execution in edit mode
            const prev = window.__ALLOW_USER_FUNCTIONS_IN_EDIT;
            window.__ALLOW_USER_FUNCTIONS_IN_EDIT = true;
            try { fn.apply(null, argVals); } finally { window.__ALLOW_USER_FUNCTIONS_IN_EDIT = prev; }
          } catch(err){ console.warn('Play function failed', err); }
        });
  top.appendChild(expBtn); top.appendChild(fnSel); top.appendChild(trgSel); top.appendChild(delBtn); top.appendChild(playBtn);
        bubble.appendChild(top);

        const inputsWrap = document.createElement('div');
        inputsWrap.style.display = 'grid';
        inputsWrap.style.gap = '6px';
        inputsWrap.style.marginTop = '6px';

        function rebuildInputs(){
          inputsWrap.innerHTML = '';
          const meta = funcs.find(f => f.name === fnSel.value);
          const count = meta ? (meta.inputs || 0) : 0;
          for (let i=0;i<count;i++){
            const r = document.createElement('div'); r.className='row'; r.style.display='contents';
            const lab = document.createElement('label'); lab.textContent = `input ${i+1}`;
            // input + pickers container
            const line = document.createElement('div');
            line.style.display = 'grid';
            line.style.gridTemplateColumns = '1fr 28px 28px';
            line.style.gap = '6px';
            const inp = document.createElement('input');
            // Prefer custom placeholders from function metadata, else default for first arg
            if (meta && Array.isArray(meta.placeholders) && meta.placeholders[i]) {
              inp.placeholder = String(meta.placeholders[i]);
            } else {
              inp.placeholder = i === 0 ? 'selected element (css selector)' : '';
            }
            // show clean value without surrounding quotes
            const raw = it.args?.[i] ? String(it.args[i]) : '';
            const unquoted = (raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"')) ? raw.slice(1,-1) : raw;
            inp.value = unquoted;
            // Only commit on change/blur (finished editing)
            const finished = () => commit();
            inp.addEventListener('change', finished);
            inp.addEventListener('blur', finished);
            // element picker button (target icon)
            const pickBtn = document.createElement('button'); pickBtn.type='button'; pickBtn.className='btn mini';
            pickBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
            // style picker button (eyedropper)
            const styleBtn = document.createElement('button'); styleBtn.type='button'; styleBtn.className='btn mini';
            styleBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 21l6-6m6-6l3 3-9 9H6v-3l9-9 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

            line.appendChild(inp); line.appendChild(pickBtn); line.appendChild(styleBtn);
            r.appendChild(lab); r.appendChild(line);
            inputsWrap.appendChild(r);

            // Picker helpers
            function rgbToHex(rgb){
              const m = String(rgb||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i); if (!m) return '#000000';
              const r = Number(m[1]).toString(16).padStart(2,'0');
              const g = Number(m[2]).toString(16).padStart(2,'0');
              const b = Number(m[3]).toString(16).padStart(2,'0');
              return `#${r}${g}${b}`;
            }
            function startElementPicker(kind){
              // Preserve selection before entering picker mode
              const prevSelIds = Array.from(document.querySelectorAll('.page .element.selected'))
                .map(n => n && n.getAttribute('data-id'))
                .filter(Boolean);
              const pageEl = document.querySelector('.page'); if (!pageEl) return;
              let last;
              window.__PICKING = true;
              document.body.classList.add('app-noselect');
              // Block pointer down inside the page so nothing re-targets selection
              const blockDown = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
              document.addEventListener('pointerdown', blockDown, true);
              document.addEventListener('mousedown', blockDown, true);
              document.addEventListener('touchstart', blockDown, { capture:true, passive:false });
              const onMove = (ev) => {
                // Prefer highlighting a table cell if under pointer; otherwise the element box
                const cell = ev.target.closest('.table-cell');
                const el = cell || ev.target.closest('.page .element');
                if (last === el) return;
                if (last) last.style.outline = '';
                last = el;
                if (last) last.style.outline = '2px solid var(--primary)';
              };
              const done = () => {
                document.removeEventListener('mousemove', onMove, true);
                document.removeEventListener('click', onClick, true);
                document.removeEventListener('keydown', onKey, true);
                document.removeEventListener('pointerdown', blockDown, true);
                document.removeEventListener('mousedown', blockDown, true);
                document.removeEventListener('touchstart', blockDown, true);
                if (last) last.style.outline = '';
                document.body.classList.remove('app-noselect');
                window.__PICKING = false;
                // Restore selection after picking
                if (Array.isArray(prevSelIds) && prevSelIds.length && typeof setSelection === 'function') {
                  setSelection(prevSelIds);
                }
              };
              const onKey = (e) => { if (e.key === 'Escape'){ e.preventDefault(); done(); } };
              const onClick = (e) => {
                // Support picking individual table cells as well as whole elements
                const cell = e.target.closest('.table-cell');
                const el = cell || e.target.closest('.page .element');
                if (!el) { done(); return; }
                e.preventDefault(); e.stopPropagation();
                if (kind === 'selector'){
                  if (cell){
                    const cid = cell.getAttribute('data-id');
                    if (cid) inp.value = `'[data-id="${cid}"]'`;
                  } else {
                    const id = el.getAttribute('data-id');
                    if (id) inp.value = `'[data-id="${id}"]'`;
                  }
                } else if (kind === 'style'){
                  const EXCLUDE = /^(?:width|height|left|top|right|bottom|inset|transform|translate|scale|rotate|position|z-index|x|y|outline(?:-.+)?)$/i;
                  const parts = [];
                  // Use the exact inline style attribute (as shown in DevTools)
                  try {
                    // Ensure picker outline is cleared before reading inline styles
                    el.style.outline = '';
                    const attr = el.getAttribute('style') || '';
                    attr.split(';').forEach(chunk => {
                      const seg = chunk.trim();
                      if (!seg) return;
                      const [kRaw, ...rest] = seg.split(':');
                      const k = (kRaw || '').trim();
                      const v = rest.join(':').trim(); // preserve any colons in values
                      if (!k || !v) return;
                      if (EXCLUDE.test(k)) return;
                      parts.push(`${k}:${v}`);
                    });
                  } catch {}
                  if (parts.length === 0){
                    // Fallback: pick a curated set from computed styles
                    const cs = getComputedStyle(el);
                    const keys = [
                      'background-color','color','border','border-color','border-width','border-style','border-radius',
                      'box-shadow','font-family','font-size','font-weight','font-style','text-decoration','text-align','line-height',
                      'opacity'
                    ];
                    keys.forEach(k => { const v = cs.getPropertyValue(k); if (v && v !== 'auto' && v !== 'normal' && v !== 'none') parts.push(`${k}:${v.trim()}`); });
                  }
                  const styleStr = parts.join('; ');
                  const escaped = styleStr.replace(/'/g, "\\'");
                  inp.value = `'${escaped}'`;
                }
                inp.dispatchEvent(new Event('change', { bubbles:true }));
                done();
              };
              document.addEventListener('mousemove', onMove, true);
              document.addEventListener('click', onClick, true);
              document.addEventListener('keydown', onKey, true);
            }
            pickBtn.addEventListener('click', () => startElementPicker('selector'));
            styleBtn.addEventListener('click', () => startElementPicker('style'));
          }
          // preserve args array length
          it.args = (it.args || []).slice(0, count);
        }

        function commit(){
          it.fn = fnSel.value || '';
          it.event = trgSel.value || 'click';
          // Read current inputs
          const vals = Array.from(inputsWrap.querySelectorAll('input')).map((inputEl) => {
            const v = String(inputEl.value || '').trim();
            if (v === '') return "''";
            if (v.startsWith("'") || v.startsWith('"')) return v; // already quoted
            // JSON-like only if it parses successfully
            if (v.startsWith('{') || v.startsWith('[')) {
              try { JSON.parse(v); return v; } catch {/* fall through to quote as string */}
            }
            if (/^-?\d+(?:\.\d+)?$/.test(v) || /^(true|false|null|undefined)$/i.test(v)) return v;
            const escaped = v.replace(/'/g, "\\'");
            return `'${escaped}'`;
          });
          it.args = vals;
          writeBack(items);
          // nothing else
          // keep expansion state for this updated signature
          if (collapsed) openSet.add(keyOf()); else openSet.delete(keyOf());
        }

        fnSel.addEventListener('change', () => { rebuildInputs(); commit(); });
        trgSel.addEventListener('change', () => { commit(); });
        delBtn.addEventListener('click', () => {
          items.splice(idx, 1);
          writeBack(items);
          render();
        });

        bubble.appendChild(inputsWrap);
        rebuildInputs();
        // collapse by default
        const applyCollapsed = () => { inputsWrap.style.display = collapsed ? 'none' : 'grid'; expBtn.innerHTML = collapsed
          ? '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 8l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
          : '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 10l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
        };
        applyCollapsed();
        expBtn.addEventListener('click', () => { collapsed = !collapsed; if (collapsed) openSet.add(keyOf()); else openSet.delete(keyOf()); applyCollapsed(); });
        container.appendChild(bubble);
      });
    }

    render();
  } catch {}

  // Add-property trigger button (centered)
  const addWrap = document.createElement('div');
  addWrap.className = 'add-wrap';
  addWrap.innerHTML = `
    <button type="button" title="Add property" aria-label="Add property" data-add-prop-trigger
      style="width:28px;height:28px;border-radius:6px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;font-size:18px;line-height:26px;">+</button>`;
  box.appendChild(addWrap);
  const trigger = addWrap.querySelector('[data-add-prop-trigger]');
  if (trigger) trigger.addEventListener('click', () => showAddPropRow(box), { once: true });
  // Apply edits only when the field commits (blur/change)
  box.addEventListener('change', onPropsInput, { once: true });
  // While typing in content textarea, switch to formula automatically if starts with '='
  box.addEventListener('input', (ev) => {
    const t = ev.target; if (!t || !t.matches('textarea[data-prop="content"]')) return;
    const val = String(t.value || '');
    if (val.startsWith('=')){
      // move value to formula field and clear content field
      const formCtl = box.querySelector('textarea[data-prop="formula"]');
      if (formCtl && formCtl !== t){ formCtl.value = val; formCtl.dispatchEvent(new Event('change', { bubbles:true })); }
      t.value = '';
    }
  });
}
function onPropsInput(e){
  const t = e.target; if (!t.matches('[data-prop]')) return;
  const key = t.dataset.prop; 
  let val;
  if (t.type === 'checkbox') {
    val = t.checked;
  } else {
    val = parsePropertyValue(t.value);
  }
  // Special case: validate id uniqueness across the document
  if (key === 'id'){
    const newId = String(val || '');
    const currentIds = new Set();
    try {
      (Model.document?.pages || []).forEach(p => (p.elements || []).forEach(el => currentIds.add(el.id)));
    } catch {}
    // Allow keeping the same id of the first selected element
    const firstSelected = (selectedIds && selectedIds.size) ? [...selectedIds][0] : null;
    if (firstSelected) currentIds.delete(firstSelected);
    const exists = currentIds.has(newId);
    if (exists || newId.trim() === ''){
      // Mark invalid and stop
      t.setAttribute('aria-invalid','true');
      t.style.borderColor = '#ef4444';
      t.style.background = '#fee2e2';
      // Rebind for next change
  propertiesContent().addEventListener('change', onPropsInput, { once: true });
      return;
    } else {
      t.removeAttribute('aria-invalid');
      t.style.borderColor = '';
      t.style.background = '';
    }
  }
  // Special handling for per-cell attrs when a cell is active
  if (key.startsWith('cell.') && tableSel){
    const tModel = getElementById(tableSel.tableId);
    if (tModel && tModel.type === 'table'){
      const ar = Math.min(tableSel.r0, tableSel.r1);
      const ac = Math.min(tableSel.c0, tableSel.c1);
      const cid = tModel.grid[ar]?.[ac];
      if (cid){
        const next = deepClone(tModel);
        next.cells[cid] = next.cells[cid] || { attrs: {} };
        next.cells[cid].attrs = Object.assign({}, next.cells[cid].attrs);
        const name = key.slice('cell.'.length);
        next.cells[cid].attrs[name] = val;
        updateElement(next.id, next);
        // Keep selection
        setTableSelection(next.id, ar, ac);
      }
    }
    propertiesContent().addEventListener('change', onPropsInput, { once: true });
    return;
  }

  // Special case: 'formula' maps to attrs.formula
  if (key === 'formula'){
    applyPatchToSelection(toPatch('attrs.formula', String(val || '')));
    try { if (typeof window.recalculateAllFormulas === 'function') window.recalculateAllFormulas(); } catch {}
    renderPage(getCurrentPage());
    propertiesContent().addEventListener('change', onPropsInput, { once: true });
    return;
  }

  // Special case: document-level properties
  if (key === 'docHeaderHeight' || key === 'docFooterHeight'){
    if (Model && Model.document){
      const patch = {};
      if (key === 'docHeaderHeight') {
        patch.headerHeight = Number(val) || 0;
      } else if (key === 'docFooterHeight') {
        patch.footerHeight = Number(val) || 0;
      }
      // Update the document model directly
      Object.assign(Model.document, patch);
      // Re-render all pages to reflect the new header/footer heights
      try {
        const pages = (Model && Model.document && Array.isArray(Model.document.pages)) ? Model.document.pages : [];
        pages.forEach(p => { try { renderPage(p); } catch {} });
      } catch {}
      // Update the input fields in the static HTML section
      const input = document.getElementById(key);
      if (input) input.value = val;
    }
    propertiesContent().addEventListener('change', onPropsInput, { once: true });
    return;
  }
  // If editing a reserved key or styles.* keep path, otherwise map to attrs.*
  const topKey = key.split('.')[0];
  const isReserved = RESERVED_MODEL_KEYS.has(topKey) || key.startsWith('styles.');
  const path = isReserved ? key : `attrs.${key}`;
  applyPatchToSelection(toPatch(path, val));
  // If stackByPage was toggled on/off, reflow immediately so element jumps in place
  if (key === 'stackByPage' || key === 'pageBreak' || key === 'repeatOnAllPages' || key === 'freeMove') {
    try { reflowStacks(getCurrentPage()); } catch {}
    // Ensure visual update immediately:
    // - For repeatOnAllPages we must re-render all pages, since clones are injected
    //   on non-first pages during renderPage().
    // - For other toggles, re-render just the current page for responsiveness.
    try {
      if (key === 'repeatOnAllPages') {
        const pages = (Model && Model.document && Array.isArray(Model.document.pages)) ? Model.document.pages : [];
        pages.forEach(p => { try { renderPage(p); } catch {} });
      } else {
        renderPage(getCurrentPage());
      }
    } catch {}
  }
  propertiesContent().addEventListener('change', onPropsInput, { once: true });
}
function showAddPropRow(container){
  // Replace trigger with input row
  const row = document.createElement('div');
  row.className = 'row';
  row.setAttribute('data-add-prop-row','');
  row.innerHTML = `
    <label>key</label>
    <input name="k" placeholder="path.like.styles.custom">
    <label>value</label>
    <textarea name="v" rows="3" placeholder="number / text / true / {…}"></textarea>
    <div class="row-hint"></div>
    <div style="display:flex; gap:6px; justify-content:flex-end;">
      <button type="button" data-confirm-add class="btn mini">Add</button>
      <button type="button" data-cancel-add class="btn mini">Cancel</button>
    </div>`;
  // Remove the trigger wrapper if it exists
  const trigWrap = container.querySelector('[data-add-prop-trigger]')?.parentElement;
  if (trigWrap) container.replaceChild(row, trigWrap); else container.appendChild(row);

  const keyInput = row.querySelector('input[name="k"]');
  const valInput = row.querySelector('[name="v"]');
  const confirmBtn = row.querySelector('[data-confirm-add]');
  const cancelBtn = row.querySelector('[data-cancel-add]');
  const confirm = () => {
    const key = keyInput.value.trim();
    const raw = valInput.value;
    if (!key) { keyInput.focus(); return; }
    const val = parsePropertyValue(raw);
    const topKey = key.split('.')[0];
    const isReserved = RESERVED_MODEL_KEYS.has(topKey) || key.startsWith('styles.');
    const path = isReserved ? key : `attrs.${key}`;
    applyPatchToSelection(toPatch(path, val), 'add-prop');
    renderProperties();
  };
  const cancel = () => { renderProperties(); };

  confirmBtn.addEventListener('click', confirm);
  cancelBtn.addEventListener('click', cancel);
  row.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); confirm(); }
    if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
  });
  keyInput.focus();
}

function normalizeZOrder(){
  const page = getCurrentPage();
  const sorted = [...page.elements].sort((a,b) => (a.z ?? 0) - (b.z ?? 0));
  sorted.forEach((el, i) => el.z = (i + 1) * 10);
}
function sendSelectionToFront(){
  normalizeZOrder(); const page = getCurrentPage();
  const maxZ = Math.max(...page.elements.map(e => e.z ?? 0), 0);
  [...selectedIds].forEach(id => { const m = getElementById(id); if (m) m.z = maxZ + 10; });
  normalizeZOrder(); renderPage(page); updateSelectionUI();
}
function sendSelectionToBack(){
  normalizeZOrder(); const page = getCurrentPage();
  const minZ = Math.min(...page.elements.map(e => e.z ?? 0), 10);
  [...selectedIds].forEach(id => { const m = getElementById(id); if (m) m.z = minZ - 10; });
  normalizeZOrder(); renderPage(page); updateSelectionUI();
}
function bringSelectionForward(){
  normalizeZOrder(); const page = getCurrentPage();
  [...selectedIds].forEach(id => { const m = getElementById(id); if (m) m.z += 15; });
  normalizeZOrder(); renderPage(page); updateSelectionUI();
}
function sendSelectionBackward(){
  normalizeZOrder(); const page = getCurrentPage();
  [...selectedIds].forEach(id => { const m = getElementById(id); if (m) m.z -= 15; });
  normalizeZOrder(); renderPage(page); updateSelectionUI();
}

/* ===== PDF Export Utilities ===== */
//onclick of the export pdf button, export the page to pdf
document.getElementById('savePdfBtn').addEventListener('click', () => ExportService.exportDocumentToPdf());
// Dynamically ensure required libs are available without changing app logic
async function loadExternalScript(src){
  return new Promise((resolve, reject) => {
    // Deduplicate loads
    let existing = document.querySelector(`script[data-dynamic-src="${src}"]`);
    if (existing){
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load: '+src)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.referrerPolicy = 'no-referrer';
    s.dataset.dynamicSrc = src;
    s.addEventListener('load', () => { s.dataset.loaded = 'true'; resolve(); });
    s.addEventListener('error', () => reject(new Error('Failed to load: '+src)));
    document.head.appendChild(s);
  });
}

// Export implementation moved to export.service.js

function serializeDocument(){
  const payload = {
    schema: (typeof SCHEMA_VERSION === 'number' ? SCHEMA_VERSION : 1),
    app: (typeof APP_VERSION === 'string' ? APP_VERSION : ''),
    document: Model.document
  };
  return JSON.stringify(payload);
}
function normalizeDocument(doc){
  const out = (doc && typeof doc === 'object') ? doc : { pages: [], currentPageId:'', nextElementId:1, editMode:false };
  if (!Array.isArray(out.pages)) out.pages = [];
  if (typeof out.currentPageId !== 'string') out.currentPageId = out.pages[0]?.id || '';
  if (typeof out.nextElementId !== 'number') out.nextElementId = 1;
  if (typeof out.editMode !== 'boolean') out.editMode = false;
  return out;
}
function migrateDocument(doc, fromVersion){
  let d = normalizeDocument(doc);
  const to = (typeof SCHEMA_VERSION === 'number' ? SCHEMA_VERSION : 1);
  // For now schemas are identical. Place future migrations here.
  if (fromVersion === to) return d;
  // Example: if (fromVersion === 0) { /* mutate d to new shape */ }
  return d;
}
function deserializeDocument(json){
  const parsed = JSON.parse(json);
  // Back-compat: older saves stored raw document object
  if (parsed && Array.isArray(parsed.pages)) {
    Model.document = normalizeDocument(parsed);
    return;
  }
  // New format wrapper
  if (parsed && parsed.document) {
    const fromSchema = Number(parsed.schema || 1);
    const doc = migrateDocument(parsed.document, fromSchema);
    Model.document = normalizeDocument(doc);
    return;
  }
  // Fallback: keep existing in-memory document
}
function download(filename, content, type='text/html'){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

// Save button UI feedback (both editor and hub buttons)
function getSaveBtns(){
  const a = document.getElementById('saveBtn');
  const b = document.getElementById('hubSaveBtn');
  return [a,b].filter(Boolean);
}
function indicateSaving(){
  getSaveBtns().forEach((btn) => {
    btn.classList.remove('saved');
    btn.classList.add('saving');
    btn.setAttribute('aria-busy', 'true');
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent || 'Save';
    btn.textContent = 'Saving…';
    // Watchdog to avoid getting stuck
    if (btn._saveWatchdog) clearTimeout(btn._saveWatchdog);
    btn._saveWatchdog = setTimeout(() => {
      if (btn.classList.contains('saving')){
        btn.classList.remove('saving');
        btn.removeAttribute('aria-busy');
        btn.textContent = btn.dataset.originalText || 'Save';
      }
    }, 8000);
  });
}
function indicateSaved(){
  getSaveBtns().forEach((btn) => {
    btn.classList.remove('saving');
    btn.classList.add('saved');
    btn.removeAttribute('aria-busy');
    btn.textContent = 'Saved';
    if (btn._saveResetTimer) clearTimeout(btn._saveResetTimer);
    btn._saveResetTimer = setTimeout(() => {
      btn.classList.remove('saved');
      btn.textContent = btn.dataset.originalText || 'Save';
    }, 1500);
  });
}

// ---- Extension Save Bridge ----
// Trigger the Chrome extension content script to perform a save (without faking Ctrl+S)
function triggerExtensionSave(){
  try { document.dispatchEvent(new CustomEvent('cm-request-save')); } catch {}
}
// Listen for lifecycle events from the content script to drive existing UI indicators
document.addEventListener('cm-save-start', () => { try { indicateSaving(); } catch {} });
document.addEventListener('cm-save-done', () => { try { indicateSaved(); } catch {} });
document.addEventListener('cm-save-error', (e) => { try { indicateSaved(); console.warn('[Save] error:', e?.detail?.error); } catch {} });

// ---------------- OPFS (Origin Private File System) helpers ----------------
// Scope autosave per file by deriving a stable key from the current path
function getFileScopeId(){
  try {
    const path = (window && window.location && window.location.pathname) ? window.location.pathname : '';
    const key = path.replace(/[^a-z0-9\-_.]/gi, '_').toLowerCase();
    return key || 'index';
  } catch (_) {
    return 'index';
  }
}
function getOpfsAutosaveName(){
  return `autosave-${getFileScopeId()}.json`;
}
function supportsOPFS(){
  return typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory;
}
async function opfsGetRoot(){
  return await navigator.storage.getDirectory();
}
async function opfsWriteFile(filename, text){
  const root = await opfsGetRoot();
  const fh = await root.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}
async function opfsReadTextIfExists(filename){
  try {
    const root = await opfsGetRoot();
    const fh = await root.getFileHandle(filename, { create: false });
    const file = await fh.getFile();
    return await file.text();
  } catch (_) {
    return null;
  }
}

// LocalStorage fallback for silent autosave when OPFS isn't available
function localAutosaveKey(){
  return `certificateMaker:autosave:v1:${getFileScopeId()}`;
}
function localSaveDocument(){
  try {
    const json = serializeDocument();
    localStorage.setItem(localAutosaveKey(), json);
    return true;
  } catch (_) { return false; }
}
function localLoadDocument(){
  try {
    const json = localStorage.getItem(localAutosaveKey());
    return json || null;
  } catch (_) { return null; }
}

// File System Access API helpers for silent saves after initial user selection
let currentFileHandle = null;
function supportsFileSystemAccess(){
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}
function buildSaveHtml(){
  const documentData = serializeDocument();
  // HTML-escape to keep JSON safe inside markup
  const escaped = String(documentData)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  let html = document.documentElement.outerHTML;
  // If an embedded payload already exists, replace it
  const preRe = /<pre\s+id=["']__doc__["'][^>]*>[\s\S]*?<\/pre>/i;
  if (preRe.test(html)){
    return html.replace(preRe, `<pre id="__doc__" style="display:none">${escaped}</pre>`);
  }
  // Otherwise, inject right after the opening <body ...>
  const bodyOpenRe = /<body([^>]*)>/i;
  return html.replace(bodyOpenRe, (m, attrs) => `<body${attrs}>\n  <pre id="__doc__" style="display:none">${escaped}</pre>`);
}

// Attempt to load latest autosave snapshot (OPFS or localStorage) when embedded doc not present
async function __tryLoadAutosaveSnapshot(){
  if (window.__docLoaded) return false; // already have a document
  let loaded = false;
  const scopeId = (function(){
    try { return getFileScopeId ? getFileScopeId() : (location.pathname||'index.html').replace(/[^a-z0-9\-_.]/gi,'_').toLowerCase(); } catch { return 'index'; }
  })();
  // 1) OPFS snapshot (saved by silent Persistence.saveDocument) => full HTML file containing <pre id="__doc__">
  try {
    if (!loaded && navigator.storage?.getDirectory){
      const root = await navigator.storage.getDirectory();
      const fname = `${scopeId}-autosave.html`;
      let fh = null;
      try { fh = await root.getFileHandle(fname, { create:false }); } catch {}
      if (fh){
        try {
          const file = await fh.getFile(); const html = await file.text();
          const m = html.match(/<pre\s+id=["']__doc__["'][^>]*>([\s\S]*?)<\/pre>/i);
            if (m && m[1]) {
              try { deserializeDocument(m[1].replaceAll('&lt;','<')); window.__docLoaded = true; loaded = true; console.info('[App] Loaded OPFS autosave snapshot'); } catch(e){ console.warn('[App] Failed to deserialize OPFS snapshot', e); }
            }
        } catch {}
      }
    }
  } catch(e){ try { console.warn('[App] OPFS autosave load error', e); } catch {} }
  // 2) localStorage snapshot (Persistence may have stored full HTML) or legacy JSON
  if (!loaded){
    try {
      const lsKey = `certificateMaker:autosave:v1:${scopeId}`;
      const raw = localStorage.getItem(lsKey);
      if (raw){
        let jsonPayload = null;
        if (/^\s*\{/.test(raw)) { // looks like pure JSON
          jsonPayload = raw;
        } else {
          // assume full HTML; extract embedded pre
            const m2 = raw.match(/<pre\s+id=["']__doc__["'][^>]*>([\s\S]*?)<\/pre>/i);
            if (m2 && m2[1]) jsonPayload = m2[1].replaceAll('&lt;','<');
        }
        if (jsonPayload){
          try { deserializeDocument(jsonPayload); window.__docLoaded = true; loaded = true; console.info('[App] Loaded localStorage autosave snapshot'); } catch(e){ console.warn('[App] Failed to deserialize localStorage snapshot', e); }
        }
      }
    } catch(e){ try { console.warn('[App] localStorage autosave load error', e); } catch {} }
  }
  return loaded;
}
async function verifyPermission(fileHandle, withWrite){
  const opts = {};
  if (withWrite) opts.mode = 'readwrite';
  if ((await fileHandle.queryPermission(opts)) === 'granted') return true;
  if ((await fileHandle.requestPermission(opts)) === 'granted') return true;
  return false;
}
async function writeFile(handle, content){
  const ok = await verifyPermission(handle, true);
  if (!ok) throw new Error('Permission denied');
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}


async function saveDocument(){
  // Update inline snapshot first
  try { if (AppState?.activeDocId) InlineDocs.set(AppState.activeDocId, Model.document); } catch {}
  // Show immediate feedback (extension will also emit start)
  try { indicateSaving(); } catch {}
  // Ask extension to perform the actual disk write
  triggerExtensionSave();
  // Do NOT call indicateSaved() here; we wait for cm-save-done / cm-save-error
}
function getCurrentFilename(){
  // Extract filename from the current URL
  const path = window.location.pathname;
  const filename = path.split('/').pop();
  
  // Return filename if it's an HTML file, otherwise null
  if (filename && filename.toLowerCase().endsWith('.html')) {
    return filename;
  }
  
  return null;
}

async function saveDocumentAs(){
  indicateSaving();
  try {
    const res = await Persistence.saveDocumentAs();
    if (res && res.ok) { indicateSaved(); return; }
  } catch {}
}
