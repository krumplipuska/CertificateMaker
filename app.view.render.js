// app.view.render.js
// View-only render helpers extracted from editor.app.js (idempotent DOM updates only)

function getPageNode(id = Model.document.currentPageId) {
	return document.querySelector(`.page-wrapper[data-page-id="${id}"] .page`);
}

function ensureElementNode(elModel) {
	const pageNode = getPageNode(elModel.pageId || Model.document.currentPageId);
	let node = pageNode.querySelector(`[data-id="${elModel.id}"]`);
	if (!node) {
		node = document.createElement('div');
		node.className = `element ${elModel.type}`;
		node.dataset.id = elModel.id;
		pageNode.appendChild(node);
		// Keep resize cursor behavior; no state mutations
		node.addEventListener('mousemove', (e) => updateResizeCursor(e, node));
		node.addEventListener('mouseleave', () => { node.style.cursor = ''; });
	}
	return node;
}

function applyElementStyles(node, m) {
	let relX = m.x, relY = m.y;
	if (m.parentId){
		const parent = getElementById(m.parentId);
		if (parent){ relX = (m.x - parent.x); relY = (m.y - parent.y); }
	}
	node.style.left = relX + 'px';
	node.style.top = relY + 'px';
	// Apply raw attributes first so subsequent style assignments can override
	// any generic cssText coming from attrs.style (avoids wiping width/height)
	const attrs = m.attrs || {};
	Object.keys(attrs).forEach((name) => {
		const val = attrs[name];
		// In edit mode, suppress inline event attributes (onclick, oninput, ...)
		// unless the element explicitly opts in (role="button" or data-run-actions-in-edit="true").
		if (/^on[a-z]/i.test(String(name))) {
			if (Model && Model.document && Model.document.editMode) {
				const role = String(attrs.role || '').toLowerCase();
				const runInEdit = String(attrs['data-run-actions-in-edit'] || '').toLowerCase();
				const allow = (role === 'button') || (runInEdit === 'true');
				if (!allow) { node.removeAttribute(name); return; }
			}
		}
		if (val === false || val == null || val === '') node.removeAttribute(name);
		else if (val === true) node.setAttribute(name, '');
		else node.setAttribute(name, String(val));
	});

	// Determine hidden status from attrs once and apply at the end to win the cascade
	let isHidden = false;
	try {
		if (attrs && (attrs.hidden === true || attrs.hidden === 'true')) isHidden = true;
		const st = String(attrs && attrs.style ? attrs.style : '');
		if (/display\s*:\s*none/i.test(st)) isHidden = true;
	} catch {}
	if (m.type !== 'line') {
		if (m.type === 'table'){
			const minW = (m.colWidths || []).reduce((a,b)=>a+b, 0) || 0;
			const minH = (m.rowHeights || []).reduce((a,b)=>a+b, 0) || 0;
			m.w = Math.max(m.w || 0, minW);
			m.h = Math.max(m.h || 0, minH);
		}
		node.style.width = (m.w || 0) + 'px';
		node.style.height = (m.h || 0) + 'px';
		node.style.borderRadius = (m.styles.radius || 0) + 'px';
		if (m.type !== 'image') {
			node.style.background = m.styles.fill || 'transparent';
		}
		node.style.border = `${m.styles.strokeWidth || 0}px solid ${m.styles.strokeColor || 'transparent'}`;
		node.style.color = m.styles.textColor || '#111827';
		node.style.fontFamily = m.styles.fontFamily || 'system-ui';
		node.style.fontSize = (m.styles.fontSize || 14) + 'pt';
		node.style.fontWeight = m.styles.bold ? '700' : '400';
		node.style.fontStyle = m.styles.italic ? 'italic' : 'normal';
		node.style.textDecoration = m.styles.underline ? 'underline' : 'none';
		const rot = Number(m.styles.rotate || 0);
		node.style.transformOrigin = '50% 50%';
		node.style.transform = rot ? `rotate(${rot}deg)` : '';
		if (m.type === 'text' || m.type === 'field' || m.type === 'rect'){
			// Defer display assignment until after we evaluated hidden
			node.style.flexDirection = 'column';
			node.style.justifyContent = (m.styles.textAlignV || 'top') === 'top' ? 'flex-start' : ((m.styles.textAlignV || 'top') === 'middle' ? 'center' : 'flex-end');
			node.style.alignItems = (m.styles.textAlignH || 'left') === 'left' ? 'flex-start' : ((m.styles.textAlignH || 'left') === 'center' ? 'center' : 'flex-end');
			node.style.textAlign = m.styles.textAlignH || 'left';
		}
	}
	if (m.type === 'line'){
		const dx = (m.x2 ?? m.x) - m.x;
		const dy = (m.y2 ?? m.y) - m.y;
		const length = Math.sqrt(dx*dx + dy*dy);
		node.style.width = `${length}px`;
		node.style.height = '0px';
		node.style.borderTop = `${m.styles.strokeWidth || 1}px solid ${m.styles.strokeColor || '#111827'}`;
		const angle = Math.atan2(dy, dx) * 180 / Math.PI;
		node.style.transformOrigin = '0 0';
		node.style.transform = `rotate(${angle}deg)`;
	}
	if (typeof m.z === 'number') node.style.zIndex = String(100 + (m.z||0));

	// Finally, enforce visibility
	// Respect model hidden state in both modes; mode only gates inline handlers
	if (isHidden) {
		node.style.display = 'none';
	} else {
		if (m.type === 'text' || m.type === 'field' || m.type === 'rect') node.style.display = 'flex';
		else node.style.display = '';
	}
}

// Toggle only inline event attributes according to edit mode without re-rendering everything
function applyEventAttributesForMode(page = getCurrentPage()){
    try {
        if (!page) return;
        const allowInEdit = (attrs) => {
            const role = String((attrs && attrs.role) || '').toLowerCase();
            const runInEdit = String((attrs && attrs['data-run-actions-in-edit']) || '').toLowerCase();
            return (role === 'button') || (runInEdit === 'true');
        };
        const pageNode = getPageNode(page.id);
        if (!pageNode) return;
        (page.elements || []).forEach((elm) => {
            try {
                // Element-level inline handlers
                const node = pageNode.querySelector(`.element[data-id="${elm.id}"]`);
                const attrs = (elm && elm.attrs) ? elm.attrs : {};
                if (node && attrs){
                    Object.keys(attrs).forEach((name) => {
                        if (!/^on[a-z]/i.test(String(name))) return;
                        if (Model && Model.document && Model.document.editMode){
                            if (!allowInEdit(attrs)) node.removeAttribute(name);
                            else if (attrs[name] === false || attrs[name] == null || attrs[name] === '') node.removeAttribute(name);
                            else node.setAttribute(name, String(attrs[name]));
                        } else {
                            if (attrs[name] === false || attrs[name] == null || attrs[name] === '') node.removeAttribute(name);
                            else node.setAttribute(name, String(attrs[name]));
                        }
                    });
                }
                // Table cell-level inline handlers
                if (elm && elm.type === 'table' && elm.cells){
                    Object.keys(elm.cells).forEach((cid) => {
                        try {
                            const cell = elm.cells[cid];
                            const cattrs = (cell && cell.attrs) ? cell.attrs : {};
                            if (!cattrs) return;
                            const div = pageNode.querySelector(`.table-cell[data-id="${cid}"]`);
                            if (!div) return;
                            Object.keys(cattrs).forEach((name) => {
                                if (!/^on[a-z]/i.test(String(name))) return;
                                if (Model && Model.document && Model.document.editMode){
                                    if (!allowInEdit(cattrs)) div.removeAttribute(name);
                                    else if (cattrs[name] === false || cattrs[name] == null || cattrs[name] === '') div.removeAttribute(name);
                                    else div.setAttribute(name, String(cattrs[name]));
                                } else {
                                    if (cattrs[name] === false || cattrs[name] == null || cattrs[name] === '') div.removeAttribute(name);
                                    else div.setAttribute(name, String(cattrs[name]));
                                }
                            });
                        } catch {}
                    });
                }
            } catch {}
        });
    } catch {}
}
try { window.applyEventAttributesForMode = applyEventAttributesForMode; } catch {}

function renderPage(page) {
	const container = getPageNode(page.id);
	if (!container) return;
	try { console.log('[RENDER] renderPage', { pageId: page.id, elements: page.elements?.length }); } catch {}
	Array.from(container.querySelectorAll('.element')).forEach(n => n.remove());
	if (!page) return;
	const roots = page.elements.filter(e => !e.parentId);
	const childrenByParent = new Map();
	page.elements.filter(e => e.parentId).forEach(e => {
		if (!childrenByParent.has(e.parentId)) childrenByParent.set(e.parentId, []);
		childrenByParent.get(e.parentId).push(e);
	});
	const renderOne = (elm, parentNode) => {
		const node = ensureElementNode({ ...elm, pageId: page.id });
		applyElementStyles(node, elm);
		try { console.log('[RENDER] applyElementStyles', elm.id, elm.type); } catch {}
		// Populate content for text-like elements so edits persist after re-render
		if (elm.type === 'text' || elm.type === 'field' || elm.type === 'rect') {
			const txt = typeof elm.content === 'string' ? elm.content : '';
			// Only touch when different to avoid caret jumps if future live updates occur
			if (node.textContent !== txt) node.textContent = txt;
		}
		if (elm.type === 'image') {
			if (!node.querySelector('img')) {
				const img = document.createElement('img');
				img.alt = '';
				node.appendChild(img);
				node.addEventListener('dblclick', async () => {
					if (!Model.document.editMode) return;
					const input = document.createElement('input');
					input.type = 'file'; input.accept = 'image/*';
					input.onchange = () => {
						const file = input.files?.[0]; if (!file) return;
						const reader = new FileReader();
						reader.onload = () => { 
							const src = String(reader.result || '');
							img.src = src;
							updateElement(elm.id, { src: src });
						};
						reader.readAsDataURL(file);
					};
					input.click();
				});
			}
			const img = node.querySelector('img');
			if (img && elm.src) img.src = elm.src;
		} else if (elm.type === 'table') {
			renderTable(elm, node);
		}
		(parentNode || container).appendChild(node);
		const kids = childrenByParent.get(elm.id) || [];
		if (kids.length){ kids.forEach(k => renderOne(k, node)); }
	};
	roots.forEach(r => renderOne(r, null));
	updateSelectionBox();
}


