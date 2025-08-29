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
			node.style.display = 'flex';
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
	const attrs = m.attrs || {};
	Object.keys(attrs).forEach((name) => {
		const val = attrs[name];
		if (val === false || val == null || val === '') node.removeAttribute(name);
		else if (val === true) node.setAttribute(name, '');
		else node.setAttribute(name, String(val));
	});
}

function renderPage(page) {
	const container = getPageNode(page.id);
	if (!container) return;
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


