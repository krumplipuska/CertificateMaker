// editor.core.js
// Extracted from script.js on 2025-08-20T18:47:33.901424Z
// Range: [0:5800] bytes

// Minimal editor logic refactor: model-driven, side panels, floating toolbar, edit mode, pages

/* ----------------------- Model ----------------------- */
const Model = {
  document: {
    pages: [],
    currentPageId: '',
    nextElementId: 1,
    editMode: true,
  },
};

// Centralized history (keep out of the document snapshot so multiple undos work)
const HISTORY_LIMIT = 10;
const History = { past: [], future: [] };
const APP_VERSION = 'v1.0.0';

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
const editToggle = () => document.getElementById('editToggle');
const saveBtn = () => document.getElementById('saveBtn');
const saveAsBtn = () => document.getElementById('saveAsBtn');
const savePdfBtn = () => document.getElementById('savePdfBtn');

/* ----------------------- Utilities ----------------------- */
function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
function nowSnapshot() { return deepClone(Model.document); }
function commitHistory(label) {
  History.past.push(nowSnapshot());
  if (History.past.length > HISTORY_LIMIT) History.past.shift();
  History.future = [];
  updateUndoRedoButtons();
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
  // hide selection and toolbar if turning off
  if (!on) clearSelection();
}

/* ----------------------- Page & Elements ----------------------- */
function createPage(name = `Page ${Model.document.pages.length + 1}`) {
  const id = `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return { id, name, elements: [] };
}

function getCurrentPage() {
  return Model.document.pages.find(p => p.id === Model.document.currentPageId);
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
  clone.id = createPage(page.name + ' copy').id;
  // ensure unique element ids
  clone.elements = clone.elements.map(e => ({ ...e, id: generateId() }));
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

