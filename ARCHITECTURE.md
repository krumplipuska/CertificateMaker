## CertificateMaker Architecture

This document describes the current, refactored architecture of CertificateMaker: the runtime model, pure update layer, rendering, controllers, table module, services, and conventions. It is meant to be an accurate, implementation-level map of how the editor works today.

### High-level
- **Single model source of truth**: The in-memory `Model.document` (in `editor.core.js`) represents the entire document (pages, elements, selection-related flags).
- **Pure update layer**: All model writes go through small, pure helpers (`core.update.js`) that return new document snapshots. UI code wraps those calls with history, re-render, and selection preservation.
- **Idempotent rendering**: Rendering functions (`app.view.render.js`) update the DOM from the model and never mutate the model.
- **Controllers and gestures**: `editor.app.js` wires interactions/gestures and calls the pure update layer. A `Controller` state object contains ephemeral controller-only data (snapping, transient reflow suppression).
- **Tables contained**: Table data model, pure ops, rendering, selection, clipboard, and actions live in `editor.tables.js` (with an exported ops surface via `tables.ops.js`).
- **Services**: Persistence (`persistence.service.js`) and export (`export.service.js`) are accessed behind small facades.
- **Types & schema**: Lightweight JSDoc typedefs and schema-versioned serialization are used to keep the document contract explicit and migratable.


## Modules and responsibilities

### `editor.core.js` (core model)
- **Model**: 
  - `Model.document`: `{ pages: Page[], currentPageId: string, nextElementId: number, editMode: boolean }`
  - `SCHEMA_VERSION = 1`, `APP_VERSION` (string)
- **History**: `commitHistory`, `undo`, `redo`, `HISTORY_LIMIT`, and button state updates
- **IDs**: `generateId`, `isElementIdInUse`
- **Clone/merge**: `deepClone`, `deepMerge`
- **Zoom**: `getZoom`, `setZoomScale`, `setZoomPercent`, and zoom-at-point helpers
- **Page management**: create/remove/duplicate/move current page
- **DOM refs**: tiny helpers for key UI elements (toolbar, lists, overlays)

Intended behavior:
- Model is the single source of truth; rendering reflects the model.
- One history entry per user-visible operation.
- Zoom sets CSS `--zoom` and keeps overlays aligned.

### `core.update.js` (pure updates)
Pure, side-effect-free helpers that operate on a `DocumentModel` and return a new one:
- `applyPatchToElements(document, elementIds, patch)`
- `applyPatchToTableCells(document, tableId, range, stylePatch)`
- `applyPatchBySelector(document, selector, patch)`

These functions do not access the DOM, history, or selection. UI wraps them with history commits, re-render, and selection preservation.

### `app.view.render.js` (view-only rendering)
Idempotent DOM-updaters:
- `getPageNode(id?)`
- `ensureElementNode(elModel)`
- `applyElementStyles(node, model)`
- `renderPage(page)`

Rules:
- Never mutate the model here; only update DOM from model.
- Delegate table rendering to `renderTable` from `editor.tables.js`.

### `editor.app.js` (composition/controllers)
Coordinates rendering, updates, interactions, toolbar sync, properties, export, persistence, and bootstrap.

- **Controller state**: `Controller = { snapState: {x,y}, suppressReflow: number }` replaces magic globals (`snapState`, `__SUPPRESS_REFLOW__`).
- **Rendering**: `renderAll()` rebuilds pages list and clears selection; per-page rendering is delegated to `renderPage`.
- **Updates**: `updateElement(idOrSelectorOrNull, patch)` is the UI entry point that:
  - Resolves CSS selectors and table cell tokens when needed
  - Calls pure helpers in `core.update.js`
  - Commits history once (`update-element`/`update-multi`)
  - Re-renders and preserves element/table selections
- **Gestures**: Mouse down/move/up for move/resize/rotate/lasso; snapping uses `Controller.snapState`. A single history entry per gesture; DOM may be updated live during drag and normalized on mouseup.
- **Toolbar & properties**: Floating toolbar and properties panel sync from selection; align buttons toggle per element types and table cell context.
- **Bootstrap**: Delegates loading to `Persistence.tryAutoLoad()`, renders, binds global/window events (centralized), initializes panels and color picker.

### `editor.selection.js` (element selection)
Element-level selection and overlays:
- **State/UI**: `selectedIds` set, `clearSelection`, `setSelection`, `addToSelection`, `toggleSelection`, `isSelected`
- **Overlay**: `updateSelectionUI`, `updateFormatToolbarVisibility`, `positionElementActions`, `updateSelectionBox`, `alignOverlays`
- **Interplay with tables**: When a table cell range is active, element selection is suppressed/cleared where appropriate; toolbar reflects anchor cell styles.

### `editor.tables.js` (tables)
All table behavior stays contained:
- **Data model**: `rows, cols, rowHeights, colWidths, grid, cells, border`
- **Pure ops**: add/delete rows/cols, merge/unmerge, normalize ranges, distribute/resize bands, per-cell style appliers, clipboard helpers
- **Rendering**: `renderTable(elModel, host)` with a11y roles and roving focus
- **Selection**: `tableSel`, `setTableSelection`, `clearTableSelection`, `highlightTableSelection`, `onTableGridKeydown`
- **Clipboard**: Global copy/paste (TSV/CSV/semicolon) grows and unmerges target area on paste
- **Controller coupling**: Uses `Controller.suppressReflow` during column/row add operations that would otherwise trigger block reflow during in-progress gestures

### `tables.ops.js` (ops surface)
Re-exports the pure table operations as a single `TableOps` surface for callers outside the tables module.

### `persistence.service.js` (persistence facade)
Small façade that wraps OPFS, localStorage, and File System Access API:
- `tryAutoLoad()` — precedence: embedded `<pre#__doc__>` → OPFS autosave → localStorage
- `saveDocument()` — tries OPFS → localStorage → FS Access handle → download fallback
- `saveDocumentAs()` — FS Access picker or download fallback

UI code calls the façade; it stays agnostic about the storage mechanism.

### `export.service.js` (export facade)
Single entry point for export with preflight:
- `exportDocumentToPdf({ filename, dpi, orientation })`
- Ensures web fonts are loaded and normalizes zoom; captures pages via `html2canvas`, assembles multipage PDFs using `jsPDF`.

### `selection.store.js` (selection scaffold)
Minimal store API intended to centralize selection state and eventing in the future. Current element selection remains in `editor.selection.js`; migration can be incremental.

### `style.map.js` (style normalization)
Centralized element/table style keys and conversions, e.g. mapping `styles.fill` to table per-cell `bg`, and collecting per-cell style keys.

### `userFunctions.js` (extensibility)
User-defined helpers that can be bound to DOM events via attributes on elements or table cells. Contains simple examples and style helpers.

### `index.html` (composition)
Loads scripts in an order that honors the above boundaries: core → pure updates → selection store → style map → selection, tables, table ops → persistence/export services → view renderers → app.


## Data model (contract)

### Document
```
Model.document = {
  pages: Page[],
  currentPageId: string,
  nextElementId: number,
  editMode: boolean
}
```

### Page
```
Page = {
  id: string,
  name: string,
  elements: Element[]
}
```

### Element (base + per-type additions)
- Base keys: `id, type, x, y, w, h, z, styles, content?, src?, x2?, y2?, parentId?, groupId?, attrs?`
- `styles` (common): `fill, strokeColor, strokeWidth, radius, textColor, fontFamily, fontSize, bold, italic, underline, textAlignH, textAlignV, rotate`
- `line`: uses `x,y,x2,y2` and `styles.stroke*`
- `image`: uses `src`
- `block`: `stackChildren: boolean`, `stackByPage: boolean`
- `table`: see Tables section (rows/cols/grid/cells, border)

Constraints:
- Element ids must be unique across the document.
- Table min `w/h` should not be smaller than the sum of column widths/row heights.
- When `editMode` is false, selection UI is hidden and text/rect editing is disabled (fields remain editable-only).

### Serialization format
```
{
  schema: 1,
  app: "v1.x.x",
  document: Model.document
}
```
- `deserializeDocument` normalizes and migrates the `document` payload by `schema` when necessary.


## Core flows

### Initialization (bootstrap)
1. `Persistence.tryAutoLoad()` attempts: embedded `#__doc__` → OPFS autosave → localStorage autosave
2. If none found, create an initial document with one page and set it as current
3. `renderAll()`; bind UI (panels, toolbar, clipboard), global listeners, and initialize zoom

### Render and update
- `renderAll()` builds page wrappers and calls `renderPage` for each
- `renderPage(page)` renders elements (parents first, then children), delegates tables to `renderTable`
- `updateElement` wraps pure update helpers:
  - Selector/DOM tokens → resolve element ids or table cell ids and apply in one history entry
  - `null` id: apply to current selection or active table cell range
  - Element id: deep-merge patch into the element
- Re-render the current page and re-apply selections to avoid context loss

### Selection and gestures
- Element selection lives in `editor.selection.js` and drives the toolbar/properties
- Gestures provide one history entry per gesture; snapping uses `Controller.snapState`
- Overlays are aligned via a single `requestAnimationFrame` scheduler

### Tables
- Click to anchor cell; drag to select range; F2/dblclick to edit (plaintext)
- Copy/paste TSV/CSV; paste grows table and unmerges target
- Column/row resizing shows ghost lines, respects zoom, updates dimensions live; commit on mouseup

### Persistence and export
- Saves go through `Persistence.saveDocument()` / `.saveDocumentAs()`; callers do not depend on storage mechanism
- Export uses `ExportService.exportDocumentToPdf()` with font readiness and zoom normalization preflight


## Event model (summary)
- Global:
  - `DOMContentLoaded` → `bootstrap()` + panel controls + custom color picker
  - Window listeners (centralized): `mousemove`, `mouseup`, `resize` (overlays/toolbar), `scroll` (overlay alignment)
- Canvas:
  - `mousedown` on page/viewport → selection, lasso, place elements, start gestures
- Table:
  - Cell `mousedown/dblclick/keydown`; document `copy/paste` when a table anchor exists
- Toolbar/Properties:
  - `input/click` mapped to element patches or table cell ops depending on context


## Conventions and guardrails
- One history entry per gesture or bulk action; do not stack history inside drag loops
- Never mutate the model from inside rendering functions
- Keep element vs table selection mutually aware; the toolbar must not style the table container when a cell selection is intended
- Always re-apply selections after re-render to avoid user context loss
- Keep table operations pure; only commit once and re-render afterwards


## Known notes and future work
- Element selection is still implemented in `editor.selection.js`; `selection.store.js` exists to support centralization if/when needed
- Table UI/ops are still in one file (`editor.tables.js`); `tables.ops.js` exposes an explicit ops surface for the rest of the app
- Continue migrating ad-hoc style mappings to `style.map.js` where appropriate

## CertificateMaker Architecture Overview

This document summarizes the current structure and behavior of the app to make future refactors safer and easier. It focuses on what the core parts are, how they fit together, and what each part is supposed to do.

### High-level
- **Runtime model (in-memory state)**: Single `Model` object in `editor.core.js` holds the document, pages, elements, and UI state.
- **Rendering layer**: Functions in `editor.app.js` render the model into DOM and keep DOM in sync on updates.
- **Interaction + selection**: `editor.selection.js` manages element selection and selection UI; `editor.app.js` manages mouse/keyboard gestures; `editor.tables.js` manages cell/range selection inside tables.
- **Tables module**: `editor.tables.js` contains table data model, pure operations (rows/cols/merge/clipboard), rendering, selection, and commands.
- **Persistence**: `editor.app.js` serializes/deserializes the model and handles autosave (OPFS/localStorage) and explicit save.
- **Extensibility**: `userFunctions.js` lets users register simple functions and bind them to element or cell DOM events through attributes.


## Modules and responsibilities

### `editor.core.js`
Core, app-wide primitives.
- **Model**: 
  - `Model.document`: `{ pages: Page[], currentPageId: string, nextElementId: number, editMode: boolean }`
  - ID helpers: `generateId`, `isElementIdInUse`
- **History**: Central undo/redo stacks, `commitHistory`, `undo`, `redo`, `updateUndoRedoButtons`. Limit via `HISTORY_LIMIT`.
- **Zoom**: `getZoom`, `setZoomScale`, `setZoomPercent`, helpers to zoom at a point or center; calls `alignOverlays` to keep overlays positioned.
- **DOM refs**: Small helpers returning key nodes (pages list, toolbars, etc.).
- **Document/page management**: Create/remove/duplicate/move current page.

Intended behavior:
- Model is the single source of truth; UI reflects the model via renderers.
- History captures user-visible operations (move/resize/update/etc.) once per gesture/action.
- Zooming updates CSS variable `--zoom` and keeps overlays aligned.

### `editor.selection.js`
Element-level selection state and UI.
- `selectedIds: Set<string>`: multi-select by element id.
- API: `clearSelection`, `setSelection`, `addToSelection`, `toggleSelection`, `isSelected`.
- UI sync: `updateSelectionUI`, `updateFormatToolbarVisibility`, `positionElementActions`, `updateSelectionBox`, `alignOverlays`.

Intended behavior:
- Selection box/toolbar visibility reflect whether anything is selected and whether edit mode is on.
- Selection updates drive the Properties panel and the floating format toolbar.
- Table cell selection (from `editor.tables.js`) coexists: element selection is suppressed/cleared when a table cell/range is active.

### `editor.tables.js`
Table data model, pure functions, rendering, selection, keyboarding, clipboard, and actions.
- **Model shape**: Table element extends base element with `{ rows, cols, rowHeights, colWidths, grid, cells, border }`. Each anchor cell has `{row,col,rowSpan,colSpan,hidden,content,styles,attrs}`.
- **Pure ops**: `tableAddRow/Column/DeleteRow/DeleteColumn`, `tableMergeRange`, `tableUnmerge`, `tableNormalizeRange`, `tableResizeRows/Cols`, `tableDistributeRows/Cols`, `tableApply*` style helpers, etc. Always return a new table object (cloned).
- **Rendering**: `renderTable(elModel, host)` renders grid cells and resizer ghosts, sets ARIA roles, wires input, drag/resizing.
- **Selection**: `tableSel` `{ tableId, r0,c0,r1,c1 }`, `setTableSelection`, `clearTableSelection`, `highlightTableSelection`, keyboard nav (`onTableGridKeydown`). Keeps a single overlay rectangle and roving tabindex.
- **Clipboard**: `bindTableClipboard` implements Excel-style copy/paste to/from TSV/CSV/semicolon-CSV. Paste grows table size and unmerges target area as needed.
- **Actions**: Context menu (`#tableMenu`) and floating action bar (`#tableActions`) call pure ops via `updateElement`.

Intended behavior:
- All structural edits to tables use pure ops and commit once per user action.
- Table styling is per-cell; toolbar reflects anchor cell styles when a range is selected.
- Selection overlay shows the bounding box of the range even when merged cells are inside.

### `editor.app.js`
App composition: rendering, updates, mouse/keyboard interactions, guides/snap, toolbar and properties wiring, export, persistence, and bootstrap.

- **Rendering**:
  - `renderAll()`: Rebuilds pages list + clears selection.
  - `renderPagesList()`: Renders wrappers, per-page controls, and calls `renderPage(p)`.
  - `renderPage(page)`: Clears old `.element` nodes, renders elements (parents before children), delegates to `renderTable` for tables and to `applyElementStyles` for common properties.
  - `applyElementStyles(node, model)`: Positioning, size, border/background/typography, text alignment, transforms, line endpoints, z-index, and custom `attrs`.

- **Updates**:
  - `updateElement(id, patch)`: Core mutator. Handles three cases:
    1) `id` is a selector ⇒ resolve element ids or table cell targets from DOM and apply `patch` to each.
    2) If a table cell selection exists ⇒ map model `styles.*` to per-cell ops.
    3) `id` is an element id ⇒ deep-merge patch and re-render page.
  - `deepMerge`, `applyPatchToSelection`, Z-order helpers.

- **Interaction/gestures**:
  - Mouse down/move/up handlers for move/resize/rotate, multi-selection lasso, with snap-to-guides (`snapSelectionBounds`, `showGuidesForBounds`).
  - Group/ungroup selection, multi-copy/paste, delete, alignment toggles.

- **Toolbar & Properties**:
  - Floating format toolbar wires `input`/`click` to either table cell ops (when a cell range exists) or element patches.
  - Properties panel reflects selected element and custom attributes; supports adding arbitrary `attrs.*`.

- **Export & persistence**:
  - PDF export (`exportPdf`) via html2canvas + jsPDF (loaded dynamically).
  - Serialization: `serializeDocument`, `deserializeDocument`.
  - Autosave precedence: embedded `<pre#__doc__>` → OPFS (`autosave-*.json`) → localStorage; explicit save (File System Access API if available, else download).

- **Bootstrap**:
  - `bootstrap()` loads a document (per precedence), renders, binds panels, canvas interactions, keyboard shortcuts, save/export, floating toolbar, table clipboard, zoom controls, custom color picker, and various global listeners.
  - DOMContentLoaded calls `bootstrap()`, `initializePanelControls()`, `initializeCustomColorPicker()`.

Intended behavior:
- `updateElement` is the only write entry point for element/table updates (besides direct DOM in-place updates during a gesture) and is responsible for committing history once and preserving selections.
- Gesture start commits a single history entry; DOM is updated live; final render after gesture normalizes state and reflows block stacks.

### `userFunctions.js`
User-defined helpers and style mapping.
- Registry: `window.USER_FUNCTIONS` metadata used by the Properties panel to list callable functions.
- Built-in examples: `simpleConsoleLogFunction`, `coloringFunction`, `toggleVisibility`, `conditionalFormatByOffset` (cell-relative conditional styling).
- Style mapping: `styleToModelPatch` converts CSS-like input (string or object) into a model patch; `modelPatchToCellStyle` adapts to table cell keys.

Intended behavior:
- Users can attach calls to DOM events via attributes on elements or table cells (e.g., `onclick="coloringFunction('#el-2', 'background:red;')"`).
- Mapping normalizes colors and common style properties; unknown top-level element keys become `attrs.*`.

### Other files
- `index.html`: Layout, panels, toolbars, and script/style loading.
- `style.css`: Visuals and editor UI styles.
- `helper.py`: Out of band utility (not part of runtime app).


## Data model (contract)

### Document
```
Model.document = {
  pages: Page[],
  currentPageId: string,
  nextElementId: number,
  editMode: boolean
}
```

### Page
```
Page = {
  id: string,
  name: string,
  elements: Element[]
}
```

### Element (base + per-type additions)
- Base keys: `id, type, x, y, w, h, z, styles, content?, src?, x2?, y2?, parentId?, groupId?, attrs?`
- `styles` (common): `fill, strokeColor, strokeWidth, radius, textColor, fontFamily, fontSize, bold, italic, underline, textAlignH, textAlignV, rotate`
- `line`: uses `x,y,x2,y2` and `styles.stroke*`
- `image`: uses `src`
- `block`: `stackChildren: boolean`, `stackByPage: boolean`
- `table`: see Tables section (rows/cols/grid/cells, border)

Constraints:
- Element ids must be unique across the document.
- Table min `w/h` should not be smaller than the sum of column widths/row heights.
- When `editMode` is false, selection UI is hidden and text/rect editing is disabled (fields remain editable-only).


## Core flows (how things should work)

### Initialization (bootstrap)
1. Attempt to load embedded document from `#__doc__` in the HTML.
2. If not found, attempt OPFS autosave `autosave-*.json` (file-scoped).
3. Fallback to localStorage autosave.
4. If none found, create an initial document with one page.
5. Render pages; bind all UI/event listeners; set initial zoom.

### Render and update
- `renderAll()` builds page wrappers, calls `renderPage` for each, and clears selection.
- `renderPage(page)` renders base elements and delegates:
  - tables → `renderTable`
  - images → `<img>` with `dblclick` to pick file
  - lines → rotated div from endpoints
- `updateElement` deep-merges patches and re-renders the current page. When a table selection exists, patches are mapped to per-cell style ops and selection is preserved.

### Selection and gestures
- Element selection lives in `editor.selection.js` and drives the floating toolbar and the properties panel.
- Mouse gestures support move/resize/rotate with snapping and a single history entry per gesture.
- Lasso selection works both inside a page and within the viewport outside the page.
- ESC clears menus; outside-click clears selection (excluding overlays/panels).
- Group/ungroup toggles via the action bubble.

### Tables
- Clicking a table cell activates table selection; drag extends the range.
- `F2` or double-click starts editing a cell (plaintext-only). Commit on blur/Enter; fire `change` + custom `cellchange` events.
- Copy/paste serializes the selected rectangle to TSV/CSV; paste grows the table and unmerges the target region before writing values.
- Column/row resizing uses ghost lines, respects zoom, and updates table dimensions live; commits once on mouseup.
- Context menu and floating action bar call pure ops to add/delete/merge/unmerge.

### Persistence and export
- Save order: OPFS (silent) → localStorage (silent) → File System Access (explicit) → download fallback.
- PDF export renders each `.page` via html2canvas at integer scale, then assembles a multipage PDF via jsPDF.


## Event model (summary)
- Global:
  - `DOMContentLoaded` → `bootstrap()` + panel controls + custom color picker.
  - Window listeners: `mousemove`, `mouseup`, `resize` (overlays and toolbar), `scroll` (align overlays) and passive zoom wheel.
- Canvas:
  - `mousedown` on `.page` or viewport → selection, lasso, add-element placement, start gestures.
- Table:
  - Cell `mousedown/dblclick/keydown`; document `copy/paste` when a table anchor exists.
- Toolbar/Properties:
  - `input/click` events mapped to either table cell style ops or element patching.

