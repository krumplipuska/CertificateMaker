// core.update.js
// Pure model update helpers. No DOM access, no history.

/** Return a deep-cloned document with patches applied to element ids on the current page. */
function applyPatchToElements(documentModel, elementIds, patch){
	const doc = deepClone(documentModel);
	if (!doc || !Array.isArray(doc.pages)) return doc;
	const page = doc.pages.find(p => p.id === doc.currentPageId);
	if (!page) return doc;
	const ids = new Set((elementIds || []).filter(Boolean));
	if (ids.size === 0) return doc;
	page.elements = page.elements.map(el => {
		if (!ids.has(el.id)) return el;
		return deepMerge(el, patch || {});
	});
	return doc;
}

/**
 * Apply per-cell style patch to a rectangular range in a table element.
 * stylePatch accepts model style keys, mapped to table cell helpers internally.
 */
function applyPatchToTableCells(documentModel, tableId, range, stylePatch){
	const doc = deepClone(documentModel);
	if (!doc || !Array.isArray(doc.pages)) return doc;
	const page = doc.pages.find(p => p.id === doc.currentPageId);
	if (!page) return doc;
	const idx = page.elements.findIndex(e => e.id === tableId);
	if (idx === -1) return doc;
	let next = page.elements[idx];
	const styles = stylePatch || {};
	if (styles.fill != null) next = tableApplyCellBg(next, range, styles.fill);
	if (styles.textColor != null) next = tableApplyTextColor(next, range, styles.textColor);
	const alignH = (styles.textAlignH != null) ? styles.textAlignH : undefined;
	const alignV = (styles.textAlignV != null) ? styles.textAlignV : undefined;
	if (alignH || alignV) next = tableApplyAlign(next, range, alignH, alignV);
	const perCellKeys = ['strokeColor','strokeWidth','fontFamily','fontSize','bold','italic','underline', 'borderColor', 'borderWidth'];
	perCellKeys.forEach(k => { if (styles[k] != null) next = tableApplyCellStyle(next, range, k, styles[k]); });
	page.elements[idx] = next;
	return doc;
}

/**
 * Best-effort selector patching without DOM: supports "#id", "id" matching elements,
 * and cell ids inside any table element. Returns a new document.
 */
function applyPatchBySelector(documentModel, selector, patch){
	if (!selector) return documentModel;
	const token = String(selector).replace(/^#/, '');
	let doc = documentModel;
	// Try element id first
	const page = documentModel.pages.find(p => p.id === documentModel.currentPageId);
	if (page && page.elements.some(e => e.id === token)){
		doc = applyPatchToElements(doc, [token], patch);
		return doc;
	}
	// Try table cell id inside any table on the page
	if (page){
		for (const el of page.elements){
			if (el.type !== 'table') continue;
			if (el.cells && el.cells[token]){
				const cell = el.cells[token];
				const range = { r0: cell.row, c0: cell.col, r1: cell.row, c1: cell.col };
				doc = applyPatchToTableCells(doc, el.id, range, patch && patch.styles ? patch.styles : {});
				return doc;
			}
		}
	}
	return doc;
}


