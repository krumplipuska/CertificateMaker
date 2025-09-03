## Purpose

This document is the guide for anyone (humans or LLMs) changing the editor. It explains what the app does, how the code is structured, which functions are foundational, and how to safely extend it without breaking core flows.

## What this app does (goals)

- Visual A4 editor for certificates/templates with multiple pages
- Elements: text, field, rectangle, line, image, table, block (container)
- Edit mode vs View mode toggle
- Export: whole document to PDF; current page to PNG/JPG
- Save/Load: autosave to OPFS/localStorage or full HTML via File System Access API/download
- Extensibility: custom user functions runnable from inline element/cell attributes

## Architectural overview

The app is intentionally small and dependency-light. It should easily run on any pc without any prerequires. Even without internet.

It follows a model-driven architecture:

- Model (state): in-memory `Model.document` (pages and elements)
- Pure update functions: apply patches to the model without DOM access
- View renderer: idempotent DOM updates derived from the model
- Controller/interactions: selection, drag/resize, keyboard, toolbar actions
- Services: persistence (save/load) and export (PDF/image)

Script modules (load order from `index.html`):

- `editor.core.js`: global model, history (undo/redo), zoom, common utils
- `core.update.js`: pure model update helpers (no DOM). Element and table-cell patchers
- `selection.store.js`: minimal centralized store (not the primary selection impl)
- `style.map.js`: maps element-level style patches to table per-cell styles
- `editor.selection.js`: selection state and overlays (elements and table)
- `editor.tables.js`: table model, pure ops, rendering, selection, clipboard
- `tables.ops.js`: stable surface exposing pure table ops
- `persistence.service.js`: autosave and save-as (OPFS/localStorage/FSA)
- `export.service.js`: export to PDF and page to PNG/JPG (html2canvas/jsPDF)
- `userFunctions.js`: end-user extension hooks and helpers
- `app.view.render.js`: idempotent view-only render helpers
- `editor.app.js`: app bootstrap, render list/pages, updateElement, interactions

## Data model (core types)

- `DocumentModel`: `{ pages: Page[], currentPageId: string, nextElementId: number, editMode: boolean }`
- `Page`: `{ id: string, name: string, elements: Element[] }`
- `Element` (union): base element or `TableElement`
  - Base element: `{ id, type: 'text'|'field'|'rect'|'line'|'image'|'block', x, y, w?, h?, z?, styles, content?, src?, x2?, y2?, parentId?, groupId?, attrs? }`
  - `TableElement`: `{ id, type:'table', x, y, w, h, rows, cols, rowHeights[], colWidths[], border, cells: {[cellId]: Cell}, grid: string[][], styles?, attrs? }`
  - `Cell`: `{ id, row, col, rowSpan, colSpan, hidden, content?, styles?, attrs? }`

Invariants to keep:

- Element ids are unique; use `generateId()` (respects `nextElementId`)
- Pure ops never touch the DOM
- `grid[r][c]` maps to an anchor cell id; merged regions share the anchor id

## Rendering pipeline (View)

High-level flow:

1. `renderAll()`
2. `renderPagesList()` → builds page wrappers and calls `renderPage(page)` for each
3. `renderPage(page)` (in `app.view.render.js`)
   - `ensureElementNode()` creates/finds DOM node for each element
   - `applyElementStyles(node, model)` applies position, size, styles, visibility, z-order
   - Content population for text/field/image, and `renderTable(elm, node)` for tables
   - Aligns selection overlays via `updateSelectionBox()`
4. `applyEventAttributesForMode(page)` enforces inline handler availability based on `editMode`

Notes:

- Prefer `renderPage(getCurrentPage())` over `renderAll()` to avoid UI resets
- Visibility is enforced last; `attrs.hidden`/`attrs.style` wins

## Update pipeline (Model → View)

All editing flows route through `updateElement` (in `editor.app.js`):

- `updateElement(id, patch)` cases:
  - `id` is a CSS selector (or `#id` or cell id): resolves matching element ids and/or table cells, then
    - `commitHistory('update-multi')`
    - elements: `applyPatchToElements(doc, ids, patch)`
    - cells: `applyPatchToTableCells(doc, tableId, range, patch.styles)`
    - `Model.document = doc`, `renderPage(getCurrentPage())`, restore selections
  - `id == null`: applies to current selection
    - If table selection exists: `commitHistory('update-element')` then `applyPatchToTableCells`
    - Else: `commitHistory('update-multi')` then `applyPatchToElements`
  - `id` is an element id: `commitHistory('update-element')`, preserve table selection for that table, `applyPatchToElements`, re-render and restore selection

Pure helpers (in `core.update.js`):

- `applyPatchToElements(documentModel, elementIds, patch)`
- `applyPatchToTableCells(documentModel, tableId, range, elementStylePatch)`
- `applyPatchBySelector(documentModel, selector, patch)` (best-effort, no DOM)

Style mapping (in `style.map.js`):

- `tablePatchFromElementPatch(stylePatch)` maps element-level keys to per-cell keys

History/undo (in `editor.core.js`):

- Central history: `commitHistory`, `undo`, `redo` (limits and button states)

## Selection, overlays, and interactions

- Element selection API (in `editor.selection.js`): `clearSelection`, `setSelection`, `addToSelection`, `toggleSelection`, `updateSelectionUI`, selection box, and action bubble
- Table selection state (in `editor.tables.js`): `tableSel`, `setTableSelection`, `clearTableSelection`, `highlightTableSelection`, keyboard nav, edit-in-cell, copy/paste
- Zoom and overlays: `setZoomScale`, `alignOverlays`

## Table subsystem (model + view + ops)

- Model and pure ops (in `editor.tables.js`):
  - Creation: `makeTableElement(rows, cols)`
  - Structural ops: `tableAddRow/Column`, `tableDeleteRow/Column`, `tableMergeRange`, `tableUnmerge`
  - Sizing/distribution: `tableResizeRows/Cols`, `tableDistributeRows/Cols`
  - Per-cell styles: `tableApplyCellBg/TextColor/Align/CellStyle`, `tableAnyCellStyleOff`
  - Clipboard: `parseClipboardGrid`, `gridToTSV`, `extractGridFromSelection`, `pasteGridIntoTable`
  - Utilities: `mapToAnchorCoords`, `getActiveTableAnchor`
- Rendering: `renderTable(elModel, host)` + `applyCellStyles`
- Public stable surface: `TableOps` in `tables.ops.js`

## Persistence and export

- Persistence (in `persistence.service.js`):
  - `saveDocument`, `saveDocumentAs`, `tryAutoLoad`
  - Backends: OPFS, localStorage, File System Access API, and download fallback
  - Embeds serialized payload into HTML via `buildSaveHtml()` when saving full file
- Export (in `export.service.js`):
  - `exportDocumentToPdf({ filename, dpi, orientation })`
  - `exportCurrentPageToImage({ filename, format, quality })`
  - Dynamically ensures `html2canvas` and `jsPDF`

## User extension hooks

- `userFunctions.js` exposes a registry `window.USER_FUNCTIONS` used by the Properties panel to populate callable actions
- Built-ins include: `simpleConsoleLogFunction`, `coloringFunction`, `toggleVisibility`, `conditionalFormatByOffset`
- Helpers: `parseStyleString`, `styleToModelPatch`, `modelPatchToCellStyle`, `normalizeColorToHex`
- Functions should no-op during edit mode when invoked from inline handlers, unless explicitly allowed

## Critical functions (handle with care)

- `updateElement` (editor.app.js): central mutation entry; preserves selections; supports selectors and cells
- `applyPatchToElements`, `applyPatchToTableCells` (core.update.js): pure; define patch semantics
- `renderPage`, `applyElementStyles` (app.view.render.js): idempotent DOM updates, visibility rules
- `renderTable`, `applyCellStyles` (editor.tables.js): table layout and DOM structure
- `commitHistory`, `undo`, `redo` (editor.core.js): history integrity and UI state
- `serializeDocument`, `deserializeDocument`, `buildSaveHtml` (editor.app.js): persistence schema and HTML embedding
- `applyEventAttributesForMode` (app.view.render.js): inline handler gating by `editMode`
- `setTableSelection`, `clearTableSelection`, `highlightTableSelection` (editor.tables.js): selection UX and a11y

If you change any of the above, run through the "Regression checklist" below.

## Safe change patterns (LLM/human)

- Keep pure operations free of DOM access; keep view code free of direct model mutation
- Use `commitHistory(label)` before persistent changes that users might undo
- Prefer `renderPage(getCurrentPage())` after updates to minimize UI side-effects
- Preserve selections: re-apply `setSelection` or `setTableSelection` when replacing models
- Use `generateId()` for any new ids; avoid collisions with `nextElementId`
- For tables, use the provided pure ops; do not mutate table `grid`/`cells` directly unless cloning first
- Map style patches through `style.map.js` when targeting table cells
- Respect `editMode` when enabling inline events; use `applyEventAttributesForMode`

## Anti-patterns (avoid)

- Mutating `Model.document` directly without cloning/patch helpers
- Direct DOM reads/writes inside pure model functions
- Calling `renderAll()` for single-page/element updates unless absolutely necessary
- Changing dataset/class names used by selectors (e.g., `.element`, `.table-cell`, `data-id`)
- Breaking selector semantics in `updateElement` (CSS selectors, `#id`, cell ids)

## Recipes

- Add a new element type
  - Extend creation path in `placePendingAt` (editor.app.js)
  - Handle rendering in `renderPage` and `applyElementStyles` if needed
  - Define default styles and content
- Add a new editable style property
  - Update toolbar bindings (editor.app.js) and/or properties panel
  - Extend `applyElementStyles` (for elements) or `applyCellStyles` (for tables)
  - Ensure serialization covers the new field (usually automatic if stored under `styles`)
- Extend table behavior
  - Implement a pure op in `editor.tables.js`, expose via `TableOps` if public
  - Wire UI in toolbar/context menu, calling `updateElement(tableId, nextTable)`
- Add a persistence backend
  - Extend `Persistence` facade; avoid changing `serializeDocument` schema unintentionally
- Add a user function
  - Register in `window.USER_FUNCTIONS`; keep runtime safe in view mode (no-ops unless intended)

## Regression checklist (after changes)

- Basic editing: add/move/resize elements; undo/redo works; selection stays correct
- Table: select/merge/unmerge; add/delete rows/cols; resize; paste from Excel; undo/redo
- Export: PDF and PNG/JPG produce correct output
- Save/Load: autosave reloads; Save As produces self-contained HTML that reopens correctly
- Edit/View toggle: inline handlers gated correctly; no accidental triggers in edit mode

## Glossary

- Anchor cell: the visible cell of a merged range stored in `grid` and `cells`
- Table selection: `tableSel = { tableId, r0,c0,r1,c1 }` (normalized on set)
- Element selection: `selectedIds` Set managed by selection module

## Notes on simplicity & reuse

The code favors small, reusable pure functions and explicit render steps. When extending, prefer composable helpers over monolithic changes, and keep separation between model, view, and controller logic.


