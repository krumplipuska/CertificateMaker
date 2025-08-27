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


## Known risks and brittle areas
- **Overloaded `updateElement`**: Handles selector resolution, element updates, and table cell mapping. High coupling and branching increase regression risk.
- **Global mutable state**: `selectedIds`, `tableSel`, `snapState`, `lastTableSel`, `__SUPPRESS_REFLOW__` are shared across modules and flows.
- **Render side-effects**: Some functions update DOM directly during gestures and re-render on mouseup; mixing in-place DOM writes with model updates can drift if an exception occurs.
- **Block reflow coupling**: `reflowStacks` mutates element positions based on visibility and flags; callers must remember to skip it in specific cases (e.g., table column add uses `__SUPPRESS_REFLOW__`).
- **No schema/versioned migrations**: `serializeDocument` stores raw JSON without versioning; future model changes risk breaking old saved files.
- **Custom attributes passthrough**: `getCustomAttributesFromModel` treats unknown top-level keys as `attrs.*`, which can hide typos or collide with future model fields.
- **Duplicate listener attachment risk**: Most listeners are bound in `bootstrap` (once). A second call to `bootstrap` could double-bind (guarded by DOMContentLoaded, but worth keeping in mind).


## Refactor roadmap (prioritized)

1) Stabilize contracts + types
- Add lightweight JSDoc typedefs for `Document`, `Page`, `Element`, `Table`, and cell structures. Export these typedefs in one place.
- Introduce a `SCHEMA_VERSION` in the serialized document; add a small migration hook in `deserializeDocument`.

2) Extract pure model layer
- Move all model-only helpers (ID generation, history, selectors like `getElementById`, `getCurrentPage`, deep clones) into a `core/` module.
- Split `updateElement` into pure functions:
  - `applyPatchToElements(document, elementIds, patch)`
  - `applyPatchToTableCells(document, tableId, range, stylePatch)`
  - `applyPatchBySelector(document, selector, patch)`
  The UI layer wraps these with history, render, and selection preservation.

3) Isolate rendering from controllers
- Move `renderPagesList`, `renderPage`, `applyElementStyles`, and table rendering into a `view/` folder. Keep rendering idempotent and side-effect free except for DOM updates.
- Ensure gesture handlers do not mutate DOM except through `applyElementStyles` or a small set of helpers.

4) Unify selection state
- Create a small selection store with explicit getters/setters/events for element selection and table cell selection; avoid cross-file mutation. Drive overlays via a single `requestAnimationFrame` scheduler.

5) Contain table module
- Keep all table pure ops in `tables/ops.js` and all table UI in `tables/view.js` and `tables/controller.js`. The rest of the app calls an explicit table controller API.

6) Safer persistence and exports
- Wrap OPFS/localStorage/File System Access in a `persistence/` service. Keep UI code oblivious to the storage mechanism.
- Add a pre-export preflight (fonts ready, zoom normalization, etc.) behind a single `exportDocumentToPdf(options)` function.

7) Incremental cleanups
- Replace magic globals (`__SUPPRESS_REFLOW__`, `snapState`) with local controller state.
- Centralize event binding/unbinding; guard against duplicate registrations.
- Normalize element style names and mapping in one place.

Non-goals (now): Converting to a framework. The above can be done as modular plain JS with JSDoc types and small files to reduce coupling.


## Conventions and guardrails
- One history entry per gesture or bulk action; do not stack history inside move/resize/drag loops.
- Never mutate the model from inside rendering functions; restrict to visual updates.
- Keep selection/table selection mutually aware; the toolbar should never style the table container when a cell selection is intended.
- Always re-apply selections after re-render to avoid user context loss.
- Keep table operations pure; only commit once and re-render afterwards.


## Where to start (quick wins)
- Add JSDoc typedefs and `SCHEMA_VERSION`.
- Split `updateElement` into smaller helpers behind a thin wrapper.
- Move `getElementById`, `getCurrentPage`, `deepMerge`, `deepClone` to a shared `core/` file.
- Extract `renderTable` and table ops into `tables/` folder (already close to this).
- Wrap persistence (OPFS/localStorage/File System Access) in a `persistence/` module with a single façade.

These changes reduce cross-module knowledge, make responsibilities clear, and let you refactor further without breaking working parts.


## Planned split of editor.app.js

Goal: reduce `editor.app.js` into cohesive, testable modules with clear boundaries while keeping runtime behavior identical. Below is a proposed minimal split you can do incrementally.

Proposed files (suggested names/roles):
- `app/render/pages.js`
  - `renderAll`, `renderPagesList`, `renderPage`, `ensureElementNode`, `applyElementStyles`
  - Depends on: `core/model` API (`getCurrentPage`, `getPageNode`, `deepClone`), table view (`tables/view`)

- `app/update/element.js`
  - `updateElement`, `deepMerge`, `applyPatchToSelection`, `toPatch`, `getByPath`
  - Internals split: selector resolution, element-id updates, table-cell mapping
  - Depends on: `app/render/pages` for `renderPage`, selection store, table ops

- `app/interaction/gestures.js`
  - Mouse down/move/up, lasso, move/resize/rotate, snapping (`snapSelectionBounds`, `showGuidesForBounds`, `getGuidesForCurrentPage`), resize helpers
  - Exposes hooks to update model via `updateElement`/direct page mutation during gesture, then final `renderPage`
  - Depends on: selection store, `app/render/pages`, `core/model`

- `app/ui/toolbar.js`
  - Floating toolbar wiring (`bindFloatingToolbar`, `syncFormatToolbar`), align buttons, Z-order helpers
  - Depends on: selection store, `update/element`, table ops, `app/render/pages`

- `app/ui/properties.js`
  - `renderProperties`, `onPropsInput`, `showAddPropRow`, `getCustomAttributesFromModel`, constants like `RESERVED_MODEL_KEYS`
  - Depends on: selection store, `update/element`

- `app/bootstrap/index.js`
  - `bootstrap`, event registrations (global listeners, panel init, color picker init, clipboard binding), zoom init
  - Imports the above modules and coordinates startup

- `persistence/storage.js`
  - OPFS helpers, localStorage helpers, File System Access helpers, `serializeDocument`, `deserializeDocument`, `buildSaveHtml`, `saveDocument`, `saveDocumentAs`
  - Exports a small façade used by UI

- `export/pdf.js`
  - `exportPdf`, `ensureHtml2Canvas`, `ensureJsPDF`, `loadExternalScript`

Supporting module:
- `core/model.js`
  - `Model`, `History`, `commitHistory/undo/redo`, `getCurrentPage`, `getPageNode`, `generateId`, `deepClone`, zoom helpers, constants

Incremental steps (safe order):
1. Extract `core/model.js` with readonly exports first (helpers + typedefs). Update imports in-place.
2. Move `render*` and `applyElementStyles` into `app/render/pages.js`. Keep API identical; re-export from `editor.app.js` temporarily for compatibility.
3. Extract `export/pdf.js` (self-contained) and `persistence/storage.js` (keep existing save buttons calling through façade).
4. Move toolbar/properties into `app/ui/*`. Wire from `bootstrap`.
5. Finally, split `updateElement` into `app/update/element.js` and replace usages.
6. Extract gestures/snapping into `app/interaction/gestures.js`.

Guidelines:
- Preserve function names and signatures; export them from new files and import where used.
- Keep one history entry per action; do not change gesture sequencing.
- After each move, run a quick manual test: load, select, move, resize, table edit, copy/paste, save, export.
- Prefer small PRs: one logical extraction per change.


## UX and Usability Enhancements

Practical improvements to make the editor easier, clearer, and faster to use. Each item notes priority and likely module(s).

- **Add tips for the buttons**: Add tips for the buttons.

- **Fit/zoom controls (Now)**: Fit page, fit width, 100% toggle, spacebar pan, zoom to selection. Modules: `core/model` (zoom), `app/ui/toolbar`.
- **Smart alignment and spacing (Now)**: Distribute spacing, equalize sizes, show measured distances when dragging. Modules: `app/interaction/gestures`, `app/ui/toolbar`.
- **Snap/grid toggles (Next)**: Toggle snap; show/hide grid; set grid size. Modules: `app/interaction/gestures`, `app/render/pages`.
- **Layers/outline panel (Now)**: Minimal list of elements with hide/lock/rename/reorder. Modules: `app/ui/properties` or new `app/ui/layers`.
- **Lock/Hide elements (Now)**: Quick lock/unlock and visibility toggle in action bubble and properties. Modules: `app/ui/toolbar`, `app/ui/properties`.
- **Better number/color inputs (Now)**: Shift+Arrow steps, unit hints (pt/px), accessible color inputs with history (already present) + eyedropper fallback. Modules: `app/ui/properties`.
- **Selection clarity (Now)**: Indeterminate states for multi-select; show common vs mixed values; batch apply safely. Modules: `app/ui/properties`, `update/element`.
- **Keyboard shortcuts help (Now)**: “?” to open a shortcuts sheet; surface common combos (copy/paste, align, zoom). Modules: `app/bootstrap`, `app/ui/*`.
- **History panel (Next)**: Visible undo stack labels; optional named checkpoints. Modules: `core/model` (labels), `app/ui/*`.
- **Status and toasts (Now)**: Non-blocking toasts for save/export/errors; last saved timestamp and autosave indicator. Modules: `persistence/storage`, `app/ui/*`.
- **Accessibility (Next)**: Tabbable controls, visible focus, ARIA on toolbars/panels, high-contrast theme toggle. Modules: `app/ui/*`, `style.css`.


## Feature Backlog (Candidate roadmap)

Priorities reflect effort vs. impact. All should respect the model/render separation and single-entry `updateElement` contract.

### Now (high impact, low/med effort)
- **Fit and zoom suite**: Fit page/width, 100%, zoom to selection, spacebar/middle-mouse pan.
- **Distribute/align/size tools**: Distribute spacing horizontally/vertically; match width/height across selection.
- **Layers/outline MVP**: List elements on the current page with lock/hide/reorder and rename.
- **PNG export**: Export selected page(s) as PNG at chosen DPI (reuse html2canvas pipeline). Modules: `export/pdf` → new `export/png`.
- **Shortcuts overlay**: “?” opens a modal with context-aware shortcuts and tips.

### Next (medium effort)

- **Style presets**: Named style tokens (colors, text styles, borders) applied from toolbar. Modules: `app/ui/toolbar`, `update/element`.
- **QR/Barcode element**: Generate from text/URL using a small client lib. Modules: new `elements/qr`, `render/pages`.
- **Table enhancements**: Header row flag, number formatting, CSV import to table, simple formulas (SUM/AVG over range). Modules: `editor.tables.js` split into ops/ui.


Implementation notes
- Map each item to the planned module split (render, update, interaction, ui, persistence, export) to avoid cross-cutting changes.
- Prefer feature flags and incremental rollouts to minimize regression risk.

