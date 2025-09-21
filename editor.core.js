// editor.core.js
// Extracted from script.js on 2025-08-20T18:47:33.901424Z
// Range: [0:5800] bytes

// Minimal editor logic refactor: model-driven, side panels, floating toolbar, edit mode, pages

/**
 * @typedef {Object} Cell
 * @property {string} id
 * @property {number} row
 * @property {number} col
 * @property {number} rowSpan
 * @property {number} colSpan
 * @property {boolean} hidden
 * @property {string} [content]
 * @property {Object} [styles]
 * @property {Object} [attrs]
 */
/**
 * @typedef {Object} TableElement
 * @property {string} id
 * @property {"table"} type
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} rows
 * @property {number} cols
 * @property {number[]} rowHeights
 * @property {number[]} colWidths
 * @property {{ inner:number, outer:number, color:string, style:string }} border
 * @property {Object.<string, Cell>} cells
 * @property {string[][]} grid
 * @property {Object} [styles]
 * @property {Object} [attrs]
 */
/**
 * @typedef {Object} BaseElement
 * @property {string} id
 * @property {"text"|"field"|"rect"|"line"|"image"|"block"|"table"} type
 * @property {number} x
 * @property {number} y
 * @property {number} [w]
 * @property {number} [h]
 * @property {number} [z]
 * @property {Object} styles
 * @property {string} [content]
 * @property {string} [src]
 * @property {number} [x2]
 * @property {number} [y2]
 * @property {string} [parentId]
 * @property {string} [groupId]
 * @property {Object} [attrs]
 */
/**
 * @typedef {BaseElement|TableElement} Element
 */
/**
 * @typedef {Object} Page
 * @property {string} id
 * @property {string} name
 * @property {Element[]} elements
 */
/**
 * @typedef {Object} DocumentModel
 * @property {Page[]} pages
 * @property {string} currentPageId
 * @property {number} nextElementId
 * @property {boolean} editMode
 */

/* ----------------------- Model ----------------------- */
const Model = {
  document: {
    pages: [],
    currentPageId: '',
    nextElementId: 1,
    editMode: false,
    // Global header/footer reserved heights in logical pixels
    headerHeight: 10,
    footerHeight: 10,
  },
};

// Centralized history (keep out of the document snapshot so multiple undos work)
const HISTORY_LIMIT = 10;
const History = { past: [], future: [] };
const APP_VERSION = 'v1.0.0';
// Schema for serialized document payloads
const SCHEMA_VERSION = 1;

function isElementIdInUse(id){
  try {
    return (Model.document?.pages || []).some(p => (p.elements || []).some(el => el.id === id));
  } catch { return false; }
}
function generateId(prefix = 'el') {
  // Ensure uniqueness even if nextElementId is out of sync with existing data
  let id = `${prefix}-${Model.document.nextElementId++}`;
  while (isElementIdInUse(id)) {
    id = `${prefix}-${Model.document.nextElementId++}`;
  }
  return id;
}

/* ----------------------- DOM refs ----------------------- */
const pagesList = () => document.getElementById('pagesList');
const elementsPanel = () => document.getElementById('elementsPanel');
const propertiesContent = () => document.getElementById('propertiesContent');
const formatToolbar = () => document.getElementById('formatToolbar');
const elementActions = () => document.getElementById('elementActions');
// Zoom
const zoomSlider = () => document.getElementById('zoomSlider');
const zoomLabel  = () => document.getElementById('zoomLabel');
let __zoom = 1; // scale (1 = 100%)
function getZoom(){ return __zoom; }
function setZoomScale(scale){
  const clamped = Math.min(3, Math.max(0.25, Number(scale) || 1));
  __zoom = clamped;
  document.documentElement.style.setProperty('--zoom', String(clamped));
  if (zoomSlider()) zoomSlider().value = String(Math.round(clamped * 100));
  if (zoomLabel())  zoomLabel().textContent = `${Math.round(clamped * 100)}%`;
  alignOverlays();
}
function setZoomPercent(pct){ setZoomScale((Number(pct)||100) / 100); }

// Zoom helpers that keep a focal point stable on screen
function zoomAtClientPoint(clientX, clientY, nextScale){
  const vp = document.getElementById('pageViewport');
  const page = getPageNode(); if (!vp || !page) return setZoomScale(nextScale);
  const before = page.getBoundingClientRect();
  const z0 = getZoom();
  const px = (clientX - before.left) / z0; // logical point on page
  const py = (clientY - before.top)  / z0;
  setZoomScale(nextScale);
  const after = page.getBoundingClientRect();
  const z1 = getZoom();
  const nx = px * z1; const ny = py * z1; // new on-screen offset from page top-left
  const dx = nx - (clientX - after.left);
  const dy = ny - (clientY - after.top);
  vp.scrollLeft += dx;
  vp.scrollTop  += dy;
}
function zoomAtViewportCenter(nextScale){
  const vp = document.getElementById('pageViewport'); if (!vp) return setZoomScale(nextScale);
  const r = vp.getBoundingClientRect();
  const cx = r.left + r.width/2; const cy = r.top + r.height/2;
  zoomAtClientPoint(cx, cy, nextScale);
}

const undoBtn = () => document.getElementById('undoBtn');
const redoBtn = () => document.getElementById('redoBtn');
const editToggleBtn = () => document.getElementById('editToggleBtn');
const saveBtn = () => document.getElementById('saveBtn');
const saveAsBtn = () => document.getElementById('saveAsBtn');
const savePdfBtn = () => document.getElementById('savePdfBtn');

/* ----------------------- Utilities ----------------------- */
function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
function deepMerge(target, patch){
	const out = deepClone(target);
	Object.keys(patch || {}).forEach(k => {
		if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])) {
			out[k] = deepMerge(out[k] || {}, patch[k]);
		} else {
			out[k] = patch[k];
		}
	});
	return out;
}
function nowSnapshot() { return deepClone(Model.document); }
function commitHistory(label) {
  History.past.push(nowSnapshot());
  if (History.past.length > HISTORY_LIMIT) History.past.shift();
  History.future = [];
  updateUndoRedoButtons();
  // Trigger inline autosave (debounced in editor.app.js)
  try { if (typeof autosaveInline === 'function') autosaveInline(); } catch {}
}
function undo() {
  if (!History.past.length) return;
  History.future.push(nowSnapshot());
  Model.document = History.past.pop();
  renderAll();
  updateUndoRedoButtons();
}
function redo() {
  if (!History.future.length) return;
  History.past.push(nowSnapshot());
  Model.document = History.future.pop();
  renderAll();
  updateUndoRedoButtons();
}
function updateUndoRedoButtons() {
  undoBtn().disabled = History.past.length === 0;
  redoBtn().disabled = History.future.length === 0;
}

function setEditMode(on) {
  Model.document.editMode = on;
  document.body.classList.toggle('edit-off', !on);
  try { const btn = (typeof editToggleBtn === 'function') ? editToggleBtn() : null; if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false'); } catch {}
  // hide selection and toolbar if turning off
  if (!on) {
    try { clearSelection(); } catch {}
    try { const bar = document.getElementById('tableActions'); if (bar) bar.classList.add('hidden'); } catch {}
    try { const lasso = document.getElementById('lasso'); if (lasso) lasso.hidden = true; } catch {}
  }
  // Instead of re-rendering from scratch (which can reset some visibility),
  // update only inline event attributes to reflect mode.
  try {
    if (typeof window.applyEventAttributesForMode === 'function') window.applyEventAttributesForMode(getCurrentPage());
  } catch {}
  // Re-apply element styles to honor edit-mode visibility policy without rebuilding all pages
  try {
    const page = getCurrentPage();
    if (page) page.elements.forEach(el => {
      const node = document.querySelector(`.page-wrapper[data-page-id="${page.id}"] .page .element[data-id="${el.id}"]`);
      if (node) applyElementStyles(node, el);
    });
  } catch {}
  // Sync the toggle button UI (icon, text, pressed state)
  try {
    const btn = (typeof editToggleBtn === 'function') ? editToggleBtn() : null;
    if (btn){
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on){
        btn.innerHTML = '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="currentColor"></path><path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"></path></svg><span>Edit mode</span>';
        btn.title = 'Edit mode';
        btn.setAttribute('aria-label', 'Edit mode');
      } else {
        btn.innerHTML = '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" fill="none" stroke="currentColor" stroke-width="2"></path><circle cx="12" cy="12" r="3" fill="currentColor"></circle></svg><span>View mode</span>';
        btn.title = 'View mode';
        btn.setAttribute('aria-label', 'View mode');
      }
    }
  } catch {}
  // Update padding after mode change
  if (typeof window.updateWorkspacePadding === 'function') window.updateWorkspacePadding();
}

/* ----------------------- Page & Elements ----------------------- */
function createPage(name = `Page ${Model.document.pages.length + 1}`) {
  const id = `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return { id, name, elements: [] };
}

function getCurrentPage() {
  return Model.document.pages.find(p => p.id === Model.document.currentPageId);
}

/** Return element model by id from the current page. */
function getElementById(id){
	const page = getCurrentPage();
	return page && page.elements ? page.elements.find(e => e.id === id) : null;
}

function addPage() {
  commitHistory('add-page');
  const p = createPage();
  Model.document.pages.push(p);
  Model.document.currentPageId = p.id;
  renderAll();
}

function removeCurrentPage() {
  if (Model.document.pages.length <= 1) return;
  commitHistory('remove-page');
  const idx = Model.document.pages.findIndex(p => p.id === Model.document.currentPageId);
  Model.document.pages.splice(idx, 1);
  const newIdx = Math.max(0, idx - 1);
  Model.document.currentPageId = Model.document.pages[newIdx].id;
  renderAll();
}

function duplicateCurrentPage() {
  const page = getCurrentPage();
  commitHistory('duplicate-page');
  const clone = deepClone(page);
  // Create a fresh page shell to get a new id and name
  const fresh = createPage(page.name + ' copy');
  clone.id = fresh.id;
  clone.name = fresh.name;
  // Remap element ids and fix parentId references so all elements (including hidden ones) are preserved
  const idMap = new Map();
  clone.elements = (clone.elements || []).map(e => {
    const newId = generateId();
    idMap.set(e.id, newId);
    return { ...e, id: newId };
  });
  clone.elements = clone.elements.map(e => {
    const pid = e.parentId;
    if (pid && idMap.has(pid)) return { ...e, parentId: idMap.get(pid) };
    return e;
  });
  const idx = Model.document.pages.findIndex(p => p.id === page.id);
  Model.document.pages.splice(idx + 1, 0, clone);
  Model.document.currentPageId = clone.id;
  renderAll();
}

function moveCurrentPage(delta) {
  const idx = Model.document.pages.findIndex(p => p.id === Model.document.currentPageId);
  const target = idx + delta;
  if (target < 0 || target >= Model.document.pages.length) return;
  commitHistory('move-page');
  const [pg] = Model.document.pages.splice(idx, 1);
  Model.document.pages.splice(target, 0, pg);
  renderAll();
}

/* ----------------------- Formula Engine ----------------------- */
/**
 * Evaluate a simple Excel-like formula string.
 * Supported:
 *  - Arithmetic: +, -, *, /, %, parentheses
 *  - Functions: SUM(...), AVG(...), MIN(...), MAX(...), ROUND(x[,d]), FLOOR(x), CEIL(x), ABS(x)
 *  - References to other elements/cells using #id tokens (e.g., #el-1 or #cell-abc)
 * Returns { value:string, error?:string } where value is a string suitable for content.
 */
function evaluateFormulaExpression(expr){
  try {
    if (!expr || typeof expr !== 'string') return { value: '' };
    const raw = String(expr).trim();
    if (!raw.startsWith('=')) return { value: raw };
    const body = raw.slice(1);

    // Support both raw #id tokens and quoted "#id" tokens from picker
    let toEval = body
      .replace(/"#([A-Za-z0-9_\-:]+)"/g, (m, id) => `r('${id}')`)
      .replace(/#([A-Za-z0-9_\-:]+)/g, (m, id) => `r('${id}')`);

    // Helper to resolve a numeric value from an element or table cell by id
    function r(id){
      try {
        for (const p of (Model.document?.pages || [])){
          const el = (p.elements || []).find(e => e && e.id === id);
          if (el){
            const txt = String(el.content ?? '').trim();
            const num = Number(txt);
            return Number.isFinite(num) ? num : 0;
          }
          const table = (p.elements || []).find(e => e && e.type === 'table' && e.cells && e.cells[id]);
          if (table){
            const cell = table.cells[id];
            const txt = String(cell?.content ?? '').trim();
            const num = Number(txt);
            return Number.isFinite(num) ? num : 0;
          }
        }
      } catch {}
      return 0;
    }

    // Whitelist functions
    const SUM = (...args) => args.reduce((a,b)=>a + (Number(b)||0), 0);
    const AVG = (...args) => { const arr = args.map(v=>Number(v)||0); return arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0; };
    const MIN = (...args) => Math.min(...args.map(v=>Number(v)||0));
    const MAX = (...args) => Math.max(...args.map(v=>Number(v)||0));
    const ROUND = (x, d=0) => { const n = Number(x)||0; const k = Math.pow(10, Number(d)||0); return Math.round(n*k)/k; };
    const FLOOR = (x) => Math.floor(Number(x)||0);
    const CEIL  = (x) => Math.ceil(Number(x)||0);
    const ABS   = (x) => Math.abs(Number(x)||0);

    // Very light sanitization: allow digits, ops, commas, parentheses, dots, letters, and r('id') calls.
    // Strip r('...') arguments before checking for disallowed characters so quotes inside r() are permitted.
    const sanitized = toEval.replace(/r\('\s*[A-Za-z0-9_\-:]+\s*'\)/g, 'r(x)');
    if (/[^0-9A-Za-z_\-:#(),.\s+\-*\/%%]/.test(sanitized)) {
      return { value: '', error: 'Invalid characters in formula' };
    }

    // Evaluate in a restricted scope
    // eslint-disable-next-line no-new-func
    const fn = new Function('r','SUM','AVG','MIN','MAX','ROUND','FLOOR','CEIL','ABS', `return (${toEval});`);
    const num = fn(r, SUM, AVG, MIN, MAX, ROUND, FLOOR, CEIL, ABS);
    const asNum = Number(num);
    if (Number.isFinite(asNum)) return { value: String(asNum) };
    return { value: String(num ?? '') };
  } catch (err){
    try { console.warn('evaluateFormulaExpression failed', err); } catch {}
    return { value: '' , error: String(err && err.message || err) };
  }
}

/**
 * Scan the whole document and update element/cell content from attrs.formula when present.
 * Mutates Model.document in-place (no history). Safe to call frequently.
 */
function recalculateAllFormulas(){
  try {
    const doc = Model.document; if (!doc || !Array.isArray(doc.pages)) return;
    for (let pass=0; pass<2; pass++){
      for (const p of (doc.pages || [])){
        for (const el of (p.elements || [])){
          try {
            if (el && (el.type === 'text' || el.type === 'field' || el.type === 'rect')){
              const f = String(el?.attrs?.formula || '').trim();
              if (f){
                const out = evaluateFormulaExpression(f);
                el.content = out.value;
              }
            }
            if (el && el.type === 'table' && el.cells){
              Object.keys(el.cells).forEach((cid) => {
                try {
                  const cell = el.cells[cid]; if (!cell || !cell.attrs) return;
                  const ff = String(cell.attrs.formula || '').trim();
                  if (ff){
                    const out = evaluateFormulaExpression(ff);
                    cell.content = out.value;
                  }
                } catch {}
              });
            }
          } catch {}
        }
      }
    }
  } catch {}
}

try { window.evaluateFormulaExpression = evaluateFormulaExpression; } catch {}
try { window.recalculateAllFormulas = recalculateAllFormulas; } catch {}

