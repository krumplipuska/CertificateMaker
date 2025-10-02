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
		// Keep resize cursor behavior; suppress in view mode (no state mutations)
		node.addEventListener('mousemove', (e) => { if (!Model || !Model.document || !Model.document.editMode){ node.style.cursor = ''; return; } updateResizeCursor(e, node); });
		node.addEventListener('mouseleave', () => { node.style.cursor = ''; });
	}
	return node;
}

function applyElementStyles(node, m, pageForParentLookup) {
	let relX = m.x, relY = m.y;
	if (m.parentId){
		let parent = null;
		try {
			if (pageForParentLookup && Array.isArray(pageForParentLookup.elements)){
				parent = pageForParentLookup.elements.find(e => e && e.id === m.parentId) || null;
			} else {
				parent = getElementById(m.parentId);
			}
		} catch {}
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

	// Free move: no special visual treatment now; ensure classes removed
	try { node.classList.remove('free-move'); node.classList.remove('outside-page'); } catch {}

	// If element repeats in header/footer, make it non-interactive and pinned band-wise
	try {
		if (m.repeatInHeader || m.repeatInFooter) {
			node.classList.add('repeated');
			// Width/height already applied; leave top adjusted in renderPage for current page
		}
	} catch {}
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
	// Before rendering, recalc formulas so displayed content is up to date
	try { if (typeof window.recalculateAllFormulas === 'function') window.recalculateAllFormulas(); } catch {}
	try { console.log('[RENDER] renderPage', { pageId: page.id, elements: page.elements?.length }); } catch {}
	Array.from(container.querySelectorAll('.element')).forEach(n => n.remove());
	if (!page) return;

	// Repeat-in-header/footer elements: clone from the nearest previous page
	// that defines any elements with repeatOnAllPages=true. This allows
	// different headers/footers for different sections.
	try {
		const doc = Model && Model.document ? Model.document : { pages: [] };
		const pages = doc.pages || [];
		const idx = pages.findIndex(p => p && p.id === page.id);
		if (idx > 0) {
			// Collect all repeaters defined on any previous page (cumulative headers/footers)
			const allShared = [];
			for (let i = 0; i < idx; i++) {
				const p = pages[i]; if (!p) continue;
				(p.elements || []).forEach(e => { if (e && (e.repeatOnAllPages === true || e.repeatOnAllPages === 'true')) allShared.push(e); });
			}
			allShared.forEach((tpl) => {
				const clone = Object.assign({}, tpl, { pageId: page.id });
				let node = ensureElementNode(clone);
				applyElementStyles(node, clone, page);
				node.classList.add('repeated');
				// Populate content for all element types so images/tables/text render in clones
				if (clone.type === 'text' || clone.type === 'field' || clone.type === 'rect'){
					const txt = typeof clone.content === 'string' ? clone.content : '';
					if (node.textContent !== txt) node.textContent = txt;
				} else if (clone.type === 'image'){
					// Create image container for repeated elements if it doesn't exist
					let imgContainer = node.querySelector('.image-container');
					if (!imgContainer) {
						imgContainer = document.createElement('div');
						imgContainer.className = 'image-container';
						imgContainer.style.width = '100%';
						imgContainer.style.height = '100%';
						imgContainer.style.display = 'flex';
						imgContainer.style.flexDirection = 'column';
						imgContainer.style.alignItems = 'center';
						imgContainer.style.justifyContent = 'center';
						imgContainer.style.position = 'relative';
						node.appendChild(imgContainer);

						// Create placeholder
						const placeholder = document.createElement('div');
						placeholder.className = 'image-placeholder';
						placeholder.style.display = 'flex';
						placeholder.style.flexDirection = 'column';
						placeholder.style.alignItems = 'center';
						placeholder.style.justifyContent = 'center';
						placeholder.style.width = '100%';
						placeholder.style.height = '100%';
						placeholder.style.backgroundColor = '#f8f9fa';
						placeholder.style.border = '2px dashed #dee2e6';
						placeholder.style.borderRadius = '8px';
						placeholder.style.color = '#6c757d';
						placeholder.style.fontSize = '12px';
						placeholder.style.textAlign = 'center';

						// Create SVG icon using the exact file content
						const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
						svgIcon.setAttribute('width', '32');
						svgIcon.setAttribute('height', '32');
						svgIcon.setAttribute('viewBox', '0 0 32 32');
						svgIcon.setAttribute('version', '1.1');
						svgIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
						svgIcon.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
						svgIcon.style.marginBottom = '4px';

						// Use the exact SVG content from the file
						svgIcon.innerHTML = '<g transform="translate(-360.000000, -99.000000)" fill="currentColor"><path d="M368,109 C366.896,109 366,108.104 366,107 C366,105.896 366.896,105 368,105 C369.104,105 370,105.896 370,107 C370,108.104 369.104,109 368,109 L368,109 Z M368,103 C365.791,103 364,104.791 364,107 C364,109.209 365.791,111 368,111 C370.209,111 372,109.209 372,107 C372,104.791 370.209,103 368,103 L368,103 Z M390,116.128 L384,110 L374.059,120.111 L370,116 L362,123.337 L362,103 C362,101.896 362.896,101 364,101 L388,101 C389.104,101 390,101.896 390,103 L390,116.128 L390,116.128 Z M390,127 C390,128.104 389.104,129 388,129 L382.832,129 L375.464,121.535 L384,112.999 L390,118.999 L390,127 L390,127 Z M364,129 C362.896,129 362,128.104 362,127 L362,126.061 L369.945,118.945 L380.001,129 L364,129 L364,129 Z M388,99 L364,99 C361.791,99 360,100.791 360,103 L360,127 C360,129.209 361.791,131 364,131 L388,131 C390.209,131 392,129.209 392,127 L392,103 C392,100.791 390.209,99 388,99 L388,99 Z"></path></g>';
						placeholder.appendChild(svgIcon);

						// Create text
						const text = document.createElement('div');
						text.textContent = 'Image';
						text.style.fontSize = '10px';
						text.style.fontWeight = '500';
						placeholder.appendChild(text);

						imgContainer.appendChild(placeholder);

						// Create actual image element (initially hidden)
						const img = document.createElement('img');
						img.alt = '';
						img.style.width = '100%';
						img.style.height = '100%';
						img.style.objectFit = 'contain';
						img.style.display = 'none';
						imgContainer.appendChild(img);
					}

					// Update image visibility for repeated elements
					const placeholder = imgContainer.querySelector('.image-placeholder');
					const img = imgContainer.querySelector('img');

					if (clone.src) {
						img.src = clone.src;
						img.style.display = 'block';
						placeholder.style.display = 'none';
					} else {
						img.style.display = 'none';
						placeholder.style.display = 'flex';
					}
				} else if (clone.type === 'table'){
					renderTable(clone, node);
				}
				container.appendChild(node);
			});
		}
	} catch {}

	const roots = page.elements.filter(e => !e.parentId);
	const childrenByParent = new Map();
	page.elements.filter(e => e.parentId).forEach(e => {
		if (!childrenByParent.has(e.parentId)) childrenByParent.set(e.parentId, []);
		childrenByParent.get(e.parentId).push(e);
	});
	const renderOne = (elm, parentNode) => {
		const node = ensureElementNode({ ...elm, pageId: page.id });
		applyElementStyles(node, elm, page);
		// (no extra clamping needed; header/footer sizing only affects stacking, not rendering)
		try { console.log('[RENDER] applyElementStyles', elm.id, elm.type); } catch {}
		// Populate content for text-like elements so edits persist after re-render
        if (elm.type === 'text' || elm.type === 'field' || elm.type === 'rect') {
            const raw = typeof elm.content === 'string' ? elm.content : '';
            // If a decimals style is set, display with fixed decimals like Excel (do not mutate model)
            let txt = raw;
            try {
                const places = Number(elm?.styles?.decimals);
                if (Number.isFinite(places) && places >= 0 && typeof window.formatNumberForDisplay === 'function'){
                    txt = window.formatNumberForDisplay(raw, places);
                }
            } catch {}
            if (node.textContent !== txt) node.textContent = txt;
        }
		if (elm.type === 'image') {
			// Create image container if it doesn't exist
			let imgContainer = node.querySelector('.image-container');
			if (!imgContainer) {
				imgContainer = document.createElement('div');
				imgContainer.className = 'image-container';
				imgContainer.style.width = '100%';
				imgContainer.style.height = '100%';
				imgContainer.style.display = 'flex';
				imgContainer.style.flexDirection = 'column';
				imgContainer.style.alignItems = 'center';
				imgContainer.style.justifyContent = 'center';
				imgContainer.style.position = 'relative';
				node.appendChild(imgContainer);

				// Create placeholder
				const placeholder = document.createElement('div');
				placeholder.className = 'image-placeholder';
				placeholder.style.display = 'flex';
				placeholder.style.flexDirection = 'column';
				placeholder.style.alignItems = 'center';
				placeholder.style.justifyContent = 'center';
				placeholder.style.width = '100%';
				placeholder.style.height = '100%';
				placeholder.style.backgroundColor = '#f8f9fa';
				placeholder.style.border = '2px dashed #dee2e6';
				placeholder.style.borderRadius = '8px';
				placeholder.style.color = '#6c757d';
				placeholder.style.fontSize = '12px';
				placeholder.style.textAlign = 'center';
				placeholder.style.cursor = 'pointer';

				// Create SVG icon using the exact file content
				const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
				svgIcon.setAttribute('width', '48');
				svgIcon.setAttribute('height', '48');
				svgIcon.setAttribute('viewBox', '0 0 32 32');
				svgIcon.setAttribute('version', '1.1');
				svgIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
				svgIcon.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
				svgIcon.style.marginBottom = '8px';

				// Use the exact SVG content from the file
				svgIcon.innerHTML = '<g transform="translate(-360.000000, -99.000000)" fill="currentColor"><path d="M368,109 C366.896,109 366,108.104 366,107 C366,105.896 366.896,105 368,105 C369.104,105 370,105.896 370,107 C370,108.104 369.104,109 368,109 L368,109 Z M368,103 C365.791,103 364,104.791 364,107 C364,109.209 365.791,111 368,111 C370.209,111 372,109.209 372,107 C372,104.791 370.209,103 368,103 L368,103 Z M390,116.128 L384,110 L374.059,120.111 L370,116 L362,123.337 L362,103 C362,101.896 362.896,101 364,101 L388,101 C389.104,101 390,101.896 390,103 L390,116.128 L390,116.128 Z M390,127 C390,128.104 389.104,129 388,129 L382.832,129 L375.464,121.535 L384,112.999 L390,118.999 L390,127 L390,127 Z M364,129 C362.896,129 362,128.104 362,127 L362,126.061 L369.945,118.945 L380.001,129 L364,129 L364,129 Z M388,99 L364,99 C361.791,99 360,100.791 360,103 L360,127 C360,129.209 361.791,131 364,131 L388,131 C390.209,131 392,129.209 392,127 L392,103 C392,100.791 390.209,99 388,99 L388,99 Z"></path></g>';
				placeholder.appendChild(svgIcon);

				// Create text
				const text = document.createElement('div');
				text.textContent = 'Double click to add image';
				text.style.fontSize = '11px';
				text.style.fontWeight = '500';
				placeholder.appendChild(text);

				imgContainer.appendChild(placeholder);

				// Create actual image element (initially hidden)
				const img = document.createElement('img');
				img.alt = '';
				img.style.width = '100%';
				img.style.height = '100%';
				img.style.objectFit = 'contain';
				img.style.display = 'none';
				imgContainer.appendChild(img);

				// Set up double-click handler on the placeholder
				placeholder.addEventListener('dblclick', async () => {
					if (!Model.document.editMode) return;
					const input = document.createElement('input');
					input.type = 'file'; input.accept = 'image/*';
					input.onchange = () => {
						const file = input.files?.[0]; if (!file) return;
						const reader = new FileReader();
						reader.onload = () => {
							const src = String(reader.result || '');
							img.src = src;
							img.style.display = 'block';
							placeholder.style.display = 'none';
							updateElement(elm.id, { src: src });
						};
						reader.readAsDataURL(file);
					};
					input.click();
				});
			}

			// Update image visibility based on whether we have a source
			const placeholder = imgContainer.querySelector('.image-placeholder');
			const img = imgContainer.querySelector('img');

			if (elm.src) {
				img.src = elm.src;
				img.style.display = 'block';
				placeholder.style.display = 'none';
			} else {
				img.style.display = 'none';
				placeholder.style.display = 'flex';
			}
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


