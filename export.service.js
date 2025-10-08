// export.service.js
// Facade for PDF export with preflight.

const ExportService = (function(){
	async function loadExternalScript(src){
		return new Promise((resolve, reject) => {
			let existing = document.querySelector(`script[data-dynamic-src="${src}"]`);
			if (existing){ if (existing.dataset.loaded === 'true') return resolve(); existing.addEventListener('load', () => resolve()); existing.addEventListener('error', () => reject(new Error('Failed to load: '+src))); return; }
			const s = document.createElement('script'); s.src = src; s.async = true; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer'; s.dataset.dynamicSrc = src; s.addEventListener('load', () => { s.dataset.loaded = 'true'; resolve(); }); s.addEventListener('error', () => reject(new Error('Failed to load: '+src))); document.head.appendChild(s);
		});
	}
	async function ensureHtml2Canvas(){ if (typeof window.html2canvas === 'function') return window.html2canvas; throw new Error('html2canvas is not available - ensure libs/html2canvas.min.js is loaded'); }
	async function ensureJsPDF(){ if (window.jspdf && typeof window.jspdf.jsPDF === 'function') return window.jspdf.jsPDF; if (typeof window.jsPDF === 'function') return window.jsPDF; throw new Error('jsPDF is not available - ensure libs/jspdf.umd.min.js is loaded'); }

    // ---------------- Vector PDF (jsPDF primitives) ----------------
    const PX_PER_IN = 96;
    const MM_PER_IN = 25.4;
    const PX_PER_MM = PX_PER_IN / MM_PER_IN; // ~3.7795
    const MM_PER_PX = MM_PER_IN / PX_PER_IN; // ~0.26458
    const PT_PER_MM = 72 / MM_PER_IN; // ~2.83465
    const MM_PER_PT = MM_PER_IN / 72; // ~0.35278

    function pxToMm(px){ return (Number(px)||0) * MM_PER_PX; }
    function ptToMm(pt){ return (Number(pt)||0) * MM_PER_PT; }

    function isHiddenByAttrs(attrs){
        try {
            if (!attrs) return false;
            if (attrs.hidden === true || attrs.hidden === 'true') return true;
            const st = String(attrs.style || '');
            if (/display\s*:\s*none/i.test(st)) return true;
        } catch {}
        return false;
    }

    function getPageDomNodeById(id){
        try { return document.querySelector(`.page-wrapper[data-page-id="${id}"] .page`); } catch { return null; }
    }

    function getFirstPageNode(){
        try { return document.querySelector('.page'); } catch { return null; }
    }

    function measurePagePx(){
        // Prefer actual DOM page node at layout scale (offsetWidth doesn't include CSS transforms)
        const p = getFirstPageNode();
        if (p && p.offsetWidth && p.offsetHeight){
            return { wPx: p.offsetWidth, hPx: p.offsetHeight };
        }
        // Fallback to CSS variables (parse mm, convert to px)
        try {
            const cs = getComputedStyle(document.documentElement);
            const wVar = cs.getPropertyValue('--page-w');
            const hVar = cs.getPropertyValue('--page-h');
            const parseMm = (v)=> Number(String(v||'').trim().replace('mm','')) || 210;
            const wMm = parseMm(wVar), hMm = parseMm(hVar);
            return { wPx: Math.round(wMm * PX_PER_MM), hPx: Math.round(hMm * PX_PER_MM) };
        } catch {}
        // Last resort: A4 @ 96dpi
        return { wPx: Math.round(210 * PX_PER_MM), hPx: Math.round(297 * PX_PER_MM) };
    }

    function getPagesFromModel(){
        try {
            const doc = (typeof Model !== 'undefined' && Model && Model.document) ? Model.document : null;
            if (!doc || !Array.isArray(doc.pages)) return [];
            return doc.pages;
        } catch { return []; }
    }

    function collectRenderableElementsForPage(pages, pageIndex){
        const page = pages[pageIndex]; if (!page) return [];
        const out = [];
        // Elements defined on this page
        (page.elements || []).forEach((e, idx) => { if (e && !isHiddenByAttrs(e.attrs)) out.push({ elm: e, order: idx }); });
        // Repeat-on-all-pages: clone from previous pages
        for (let i = 0; i < pageIndex; i++){
            const prev = pages[i]; if (!prev) continue;
            (prev.elements || []).forEach((tpl) => {
                try {
                    if (tpl && (tpl.repeatOnAllPages === true || tpl.repeatOnAllPages === 'true') && !isHiddenByAttrs(tpl.attrs)){
                        // Shallow clone to avoid mutating model; keep absolute x/y
                        const clone = Object.assign({}, tpl);
                        out.push({ elm: clone, order: -1000 });
                    }
                } catch {}
            });
        }
        // Stable sort: by z (asc), then by original order
        out.sort((a,b)=>{
            const za = Number(a.elm?.z || 0), zb = Number(b.elm?.z || 0);
            if (za !== zb) return za - zb;
            return (a.order||0) - (b.order||0);
        });
        return out.map(x=>x.elm);
    }

    function setStroke(pdf, color, widthPx){
        try { if (color) pdf.setDrawColor(color); } catch {}
        try { if (Number.isFinite(widthPx)) pdf.setLineWidth(pxToMm(widthPx)); } catch {}
    }
    function setFill(pdf, color){ try { if (color) pdf.setFillColor(color); } catch {} }
    function setText(pdf, styles){
        // Font family mapping: default to helvetica for system-ui
        let ff = String(styles?.fontFamily || '').toLowerCase();
        if (!ff || ff === 'system-ui') ff = 'helvetica';
        try { pdf.setFont(ff, (styles?.italic ? 'italic' : 'normal'), (styles?.bold ? 'bold' : 'normal')); } catch { try { pdf.setFont('helvetica','normal'); } catch {} }
        try { pdf.setTextColor(styles?.textColor || '#111827'); } catch {}
        try { pdf.setFontSize(Number(styles?.fontSize || 14)); } catch {}
    }

    function drawRectLike(pdf, m){
        const x = pxToMm(m.x), y = pxToMm(m.y);
        const w = pxToMm(m.w || 0), h = pxToMm(m.h || 0);
        const r = pxToMm(m.styles?.radius || 0);
        const hasFill = !!m.styles?.fill && m.styles.fill !== 'transparent';
        const sw = Number(m.styles?.strokeWidth || 0);
        const hasStroke = sw > 0 && m.styles?.strokeColor && m.styles.strokeColor !== 'transparent';
        if (hasFill) setFill(pdf, m.styles.fill);
        if (hasStroke) setStroke(pdf, m.styles.strokeColor, sw);
        if (r > 0) pdf.roundedRect(x, y, w, h, r, r, hasFill && hasStroke ? 'FD' : (hasFill ? 'F' : (hasStroke ? 'S' : '')));
        else pdf.rect(x, y, w, h, hasFill && hasStroke ? 'FD' : (hasFill ? 'F' : (hasStroke ? 'S' : '')));
    }

    function drawLine(pdf, m){
        const x1 = pxToMm(m.x), y1 = pxToMm(m.y);
        const x2 = pxToMm(typeof m.x2 === 'number' ? m.x2 : m.x);
        const y2 = pxToMm(typeof m.y2 === 'number' ? m.y2 : m.y);
        setStroke(pdf, m.styles?.strokeColor || '#111827', Number(m.styles?.strokeWidth || 1));
        pdf.line(x1, y1, x2, y2);
    }

    function splitText(pdf, text, maxWidthMm){
        try { return pdf.splitTextToSize(String(text||''), Math.max(0, maxWidthMm)); } catch { return [String(text||'')]; }
    }

    function drawTextInBox(pdf, m){
        const x = pxToMm(m.x), y = pxToMm(m.y);
        const w = pxToMm(m.w || 0), h = pxToMm(m.h || 0);
        const pad = Number(m.styles?.padding || 0);
        const padMm = pxToMm(pad);
        setText(pdf, m.styles || {});
        const alignH = (m.styles?.textAlignH || 'left');
        const alignV = (m.styles?.textAlignV || 'top');
        const overflow = (m.styles?.textOverflow || 'wrap');
        const fontPt = Number(m.styles?.fontSize || 14);
        const lineH = ptToMm(fontPt) * 1.2; // simple leading
        const innerW = Math.max(0, w - 2*padMm);
        const innerH = Math.max(0, h - 2*padMm);
        let lines = [];
        if (overflow === 'nowrap') {
            lines = [String(m.content ?? '')];
        } else if (overflow === 'ellipsis') {
            // Greedy fit with ellipsis
            const raw = String(m.content ?? '');
            let low = 0, high = raw.length, fit = '';
            while (low <= high){
                const mid = Math.floor((low + high) / 2);
                const test = raw.slice(0, mid) + (mid < raw.length ? '…' : '');
                const wmm = pdf.getTextWidth ? (pdf.getTextWidth(test) * MM_PER_PT) : (test.length * ptToMm(fontPt) * 0.5);
                if (wmm <= innerW){ fit = test; low = mid + 1; } else { high = mid - 1; }
            }
            lines = [fit];
        } else {
            lines = splitText(pdf, String(m.content ?? ''), innerW);
        }
        const textWidthForLine = (s)=>{ try { return (pdf.getTextWidth ? (pdf.getTextWidth(s) * MM_PER_PT) : (s.length * ptToMm(fontPt) * 0.5)); } catch { return 0; } };
        const contentH = Math.max(lineH, lines.length * lineH);
        let startY = y + padMm + lineH;
        if (alignV === 'middle') startY = y + (h - contentH) / 2 + lineH / 2 + padMm;
        else if (alignV === 'bottom') startY = y + h - padMm - (contentH - lineH);
        lines.forEach((ln, i) => {
            let tx = x + padMm;
            if (alignH === 'center') tx = x + (w / 2);
            else if (alignH === 'right') tx = x + w - padMm;
            const tw = textWidthForLine(ln);
            const opts = { baseline: 'alphabetic' };
            if (alignH === 'center') opts.align = 'center';
            else if (alignH === 'right') opts.align = 'right';
            const ty = startY + i * lineH;
            pdf.text(ln, tx, ty, opts);
        });
    }

    async function loadImageAsJpegDataUrl(src, targetWpx, targetHpx, quality){
        return new Promise((resolve) => {
            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        const naturalW = img.naturalWidth || img.width;
                        const naturalH = img.naturalHeight || img.height;
                        // Downscale to ~1.5x target size to balance quality/file size
                        const maxW = Math.max(1, Math.min(naturalW, Math.round(targetWpx * 1.5)));
                        const maxH = Math.max(1, Math.min(naturalH, Math.round(targetHpx * 1.5)));
                        // Preserve aspect ratio (contain)
                        const scale = Math.min(maxW / naturalW, maxH / naturalH);
                        const outW = Math.max(1, Math.round(naturalW * scale));
                        const outH = Math.max(1, Math.round(naturalH * scale));
                        const canvas = document.createElement('canvas');
                        canvas.width = outW; canvas.height = outH;
                        const ctx = canvas.getContext('2d');
                        // White background to avoid black where PNG had transparency
                        ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,outW,outH);
                        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, outW, outH);
                        const url = canvas.toDataURL('image/jpeg', Math.min(1, Math.max(0.5, Number(quality)||0.78)));
                        resolve({ dataUrl: url, outW, outH });
                    } catch { resolve({ dataUrl: src }); }
                };
                img.onerror = () => resolve({ dataUrl: src });
                img.src = src;
            } catch { resolve({ dataUrl: src }); }
        });
    }

    async function drawImageElement(pdf, m){
        const x = pxToMm(m.x), y = pxToMm(m.y);
        const w = pxToMm(m.w || 0), h = pxToMm(m.h || 0);
        const targetWpx = Math.max(1, Math.round((m.w || 0)));
        const targetHpx = Math.max(1, Math.round((m.h || 0)));
        const { dataUrl, outW, outH } = await loadImageAsJpegDataUrl(String(m.src || ''), targetWpx, targetHpx, 0.78);
        if (!dataUrl) return;
        // Contain-fit inside the element box, centered
        const imgWRatio = outW / PX_PER_MM / (w || 1) / MM_PER_PX; // Not used directly; compute via mm
        const imgWmm = pxToMm(outW);
        const imgHmm = pxToMm(outH);
        const scale = Math.min((w || 1) / Math.max(0.0001, imgWmm), (h || 1) / Math.max(0.0001, imgHmm));
        const drawW = imgWmm * scale;
        const drawH = imgHmm * scale;
        const dx = x + ((w - drawW) / 2);
        const dy = y + ((h - drawH) / 2);
        pdf.addImage(dataUrl, 'JPEG', dx, dy, drawW, drawH);
    }

    function drawBlockBackground(pdf, m){
        // 'block' is a container; draw only its box (fill/stroke) without text
        drawRectLike(pdf, m);
    }

    function drawRectWithOptionalText(pdf, m){
        drawRectLike(pdf, m);
        const hasText = typeof m.content === 'string' && m.content !== '';
        if (hasText){ drawTextInBox(pdf, m); }
    }

    function getTableAccum(arr){ const out=[0]; let acc=0; for (const v of (arr||[])){ acc+= (Number(v)||0); out.push(acc); } return out; }

    function drawTableCellRect(pdf, ax, ay, aw, ah, cell){
        // Background
        if (cell?.styles?.bg){ setFill(pdf, cell.styles.bg); pdf.rect(ax, ay, aw, ah, 'F'); }
        // Borders per side
        const sides = cell?.styles?.borders || { top:false,right:false,bottom:false,left:false };
        const bw = Number(cell?.styles?.borderWidth ?? cell?.styles?.strokeWidth ?? 1);
        const bc = cell?.styles?.borderColor || cell?.styles?.strokeColor || '#000000';
        if (bw > 0){ setStroke(pdf, bc, bw); }
        if (sides.top)    pdf.line(ax, ay, ax+aw, ay);
        if (sides.right)  pdf.line(ax+aw, ay, ax+aw, ay+ah);
        if (sides.bottom) pdf.line(ax, ay+ah, ax+aw, ay+ah);
        if (sides.left)   pdf.line(ax, ay, ax, ay+ah);
    }

    function drawTableCellText(pdf, ax, ay, aw, ah, cell){
        const pad = Number(cell?.styles?.padding ?? 8);
        const padMm = pxToMm(pad);
        const innerW = Math.max(0, aw - 2*padMm);
        const innerH = Math.max(0, ah - 2*padMm);
        setText(pdf, cell?.styles || {});
        const fontPt = Number(cell?.styles?.fontSize || 14);
        const lineH = ptToMm(fontPt) * 1.2;
        const alignH = cell?.styles?.alignH || 'left';
        const alignV = cell?.styles?.alignV || 'top';
        const text = String(cell?.content ?? '');
        const lines = splitText(pdf, text, innerW);
        const contentH = Math.max(lineH, lines.length * lineH);
        let startY = ay + padMm + lineH;
        if (alignV === 'middle') startY = ay + (ah - contentH) / 2 + lineH / 2 + padMm;
        else if (alignV === 'bottom') startY = ay + ah - padMm - (contentH - lineH);
        lines.forEach((ln, i) => {
            let tx = ax + padMm;
            const opts = { baseline: 'alphabetic' };
            if (alignH === 'center'){ tx = ax + (aw / 2); opts.align = 'center'; }
            else if (alignH === 'right'){ tx = ax + aw - padMm; opts.align = 'right'; }
            const ty = startY + i * lineH;
            pdf.text(ln, tx, ty, opts);
        });
    }

    function drawTable(pdf, m){
        const x = pxToMm(m.x), y = pxToMm(m.y);
        const colWpx = (m.colWidths || []).map(v => Number(v)||0);
        const rowHpx = (m.rowHeights || []).map(v => Number(v)||0);
        const accXmm = getTableAccum(colWpx).map(pxToMm);
        const accYmm = getTableAccum(rowHpx).map(pxToMm);
        for (let r=0; r<(m.rows||0); r++){
            for (let c=0; c<(m.cols||0); c++){
                const id = m.grid?.[r]?.[c];
                const cell = id ? m.cells?.[id] : null;
                if (!cell || cell.hidden || cell.row !== r || cell.col !== c) continue; // only anchors
                const rr = cell.rowSpan || 1, cc = cell.colSpan || 1;
                const ax = x + accXmm[c];
                const ay = y + accYmm[r];
                const aw = accXmm[c+cc] - accXmm[c];
                const ah = accYmm[r+rr] - accYmm[r];
                drawTableCellRect(pdf, ax, ay, aw, ah, cell);
                drawTableCellText(pdf, ax, ay, aw, ah, cell);
            }
        }
    }

    async function exportDocumentToPdfVector({ filename = 'myfile.pdf', orientation } = {}){
        const jsPDF = await ensureJsPDF();
        const pages = getPagesFromModel();
        if (!pages || pages.length === 0){ throw new Error('No pages in model'); }
        const { wPx, hPx } = measurePagePx();
        const wMm = pxToMm(wPx), hMm = pxToMm(hPx);
        const ori = orientation || (wMm > hMm ? 'landscape' : 'portrait');
        const pdf = new jsPDF({ unit: 'mm', format: [wMm, hMm], orientation: ori, compress: true });

        for (let i=0; i<pages.length; i++){
            if (i>0) pdf.addPage([wMm, hMm], ori);
            const page = pages[i];
            const elms = collectRenderableElementsForPage(pages, i);
            for (const m of elms){
                try {
                    if (m.type === 'line') { drawLine(pdf, m); continue; }
                    if (m.type === 'image') { /* await */ await drawImageElement(pdf, m); continue; }
                    if (m.type === 'text' || m.type === 'field') { drawRectLike(pdf, m); drawTextInBox(pdf, m); continue; }
                    if (m.type === 'rect') { drawRectWithOptionalText(pdf, m); continue; }
                    if (m.type === 'block') { drawBlockBackground(pdf, m); continue; }
                    if (m.type === 'table') { drawTable(pdf, m); continue; }
                    // Unknown types: draw as plain box to make presence visible
                    drawRectLike(pdf, m);
                } catch (err) { try { console.warn('PDF draw error for element', m?.id, err); } catch {} }
            }
        }
        pdf.save(filename);
    }

    // Legacy raster export kept as fallback
    async function exportDocumentToPdfRaster({  dpi = 220, orientation = 'portrait' } = {}){
		//ctach the all the pages from the page-list
		//and create an image for each page by using only html2canvas
		//and add it to the pdf
		//save the pdf

		//sanitize the #docTitleInput value and use it as a filename
		const filename = sanitizeFileBaseName(document.getElementById('docTitleInput').value) + '.pdf';

		//if filename is empty, use a default filename
		if (!filename) filename = 'myfile.pdf';

		//make sure that the zoom level is set to a size to perfectly fit a a4 page. get the current zoom level and set it back after the export
		const originalZoom = typeof getZoom === 'function' ? getZoom() : 1; if (typeof setZoomScale === 'function') setZoomScale(1);
		if (typeof setZoomScale === 'function') setZoomScale(1.5);

		//hide all the selection boxes, cell selection, cell selection, and header and footer guides
		const selectionBoxes = document.querySelectorAll('.selection-box');
		const cellSelection = document.querySelectorAll('.cell-selection');
		const headerGuides = document.querySelectorAll('.hf-guide');
		selectionBoxes.forEach(box => box.style.display = 'none');
		cellSelection.forEach(box => box.style.display = 'none');
		headerGuides.forEach(box => box.style.display = 'none');

		try {
			//capture the each page one by one
			const pages = Array.from(document.querySelectorAll('.page'));
			if (!pages.length) return;
			
			// Pre-process images to work around html2canvas object-fit:cover issues
			const imageFixups = [];
			pages.forEach(page => {
			const imageElements = page.querySelectorAll('.element.image img');
			imageElements.forEach(img => {
				if (!img.src || img.style.display === 'none') return;
				
				const container = img.closest('.element.image');
				if (!container) return;
					
					// Save original state
					const originalImgStyle = {
						width: img.style.width,
						height: img.style.height,
						objectFit: img.style.objectFit,
						objectPosition: img.style.objectPosition,
						maxWidth: img.style.maxWidth,
						maxHeight: img.style.maxHeight,
						position: img.style.position,
						top: img.style.top,
						left: img.style.left,
						transform: img.style.transform
					};
					
					// Calculate the cover-fit dimensions
					const containerW = container.offsetWidth;
					const containerH = container.offsetHeight;
					const naturalW = img.naturalWidth || img.width;
					const naturalH = img.naturalHeight || img.height;
					
					if (naturalW && naturalH && containerW && containerH) {
						// Calculate scale to cover (same as object-fit: cover)
						const scaleX = containerW / naturalW;
						const scaleY = containerH / naturalH;
						const scale = Math.max(scaleX, scaleY);
						
						const scaledW = naturalW * scale;
						const scaledH = naturalH * scale;
						
						// Center the image
						const offsetX = (containerW - scaledW) / 2;
						const offsetY = (containerH - scaledH) / 2;
						
						// Apply explicit positioning and sizing for html2canvas
						img.style.position = 'absolute';
						img.style.left = offsetX + 'px';
						img.style.top = offsetY + 'px';
						img.style.width = scaledW + 'px';
						img.style.height = scaledH + 'px';
						img.style.maxWidth = 'none';
						img.style.maxHeight = 'none';
						img.style.objectFit = 'none';
						img.style.transform = 'none';
						
						imageFixups.push({ img, originalImgStyle });
					}
				});
			});
			
			const html2canvasFn = await ensureHtml2Canvas();
			const jsPDF = await ensureJsPDF();
			const scale = Math.max(1, Math.round(dpi / 96));
			const canvasScrollX = -window.scrollX || -7;
			const canvasScrollY = -window.scrollY || 0;
			const firstPage = pages[0]; const widthPx = firstPage.offsetWidth; const heightPx = firstPage.offsetHeight;
			const pdf = new jsPDF({ unit:'px', format:[widthPx, heightPx], orientation, compress:true });

			for (let i=0; i<pages.length; i++){
				if (i>0) pdf.addPage([widthPx, heightPx], orientation);
				const page = pages[i];
				const canvas = await html2canvasFn(page, { scale, useCORS:true, backgroundColor:'#ffffff', scrollX: canvasScrollX, scrollY: canvasScrollY });
				const imgData = canvas.toDataURL('image/jpeg', 0.8);
				pdf.addImage(imgData, 'JPEG', 0, 0, widthPx, heightPx);
			}

			// Restore original image styles
			imageFixups.forEach(({ img, originalImgStyle }) => {
				Object.keys(originalImgStyle).forEach(key => {
					img.style[key] = originalImgStyle[key];
				});
			});
			
			pdf.save(filename);
		} finally {
			isExporting = false;
			selectionBoxes.forEach(box => box.style.display = 'block');
			cellSelection.forEach(box => box.style.display = 'block');
			headerGuides.forEach(box => box.style.display = 'block');
		}
	}

	// New: Strict raster-only export at target DPI (no vector path)
	async function exportDocumentToPdfRasterOnly({ filename = 'myfile.pdf', dpi = 220, orientation } = {}){
		// Reuse the proven raster path 1:1 to avoid any vector steps
		return exportDocumentToPdfRaster({ filename, dpi, orientation });
	}

    let isExporting = false;
    async function exportDocumentToPdf({ filename = 'myfile.pdf', dpi = 220, orientation } = {}){
        if (isExporting) { console.warn('PDF export already in progress, ignoring duplicate call'); return; }
        isExporting = true;
        try {
            // Prefer vector export for fidelity and size
            await exportDocumentToPdfVector({ filename, orientation });
        } catch (err){
            try { console.warn('Vector export failed, falling back to raster:', err); } catch {}
            await exportDocumentToPdfRaster({ filename, dpi, orientation });
        } finally { isExporting = false; }
	}



	// Export only the current page as an image (PNG/JPEG)
	async function exportCurrentPageToImage({ filename, format = 'png', quality = 0.9 } = {}){
		const page = (typeof getPageNode === 'function') ? getPageNode() : document.querySelector('.page');
		if (!page) return;
		const html2canvasFn = await ensureHtml2Canvas();
		// Temporarily remove page shadows/radius to avoid artifacts in capture
		const prevShadow = page.style.boxShadow; const prevRadius = page.style.borderRadius; page.style.boxShadow = 'none'; page.style.borderRadius = '0';
		const canvas = await html2canvasFn(page, { scale: Math.max(1, Math.round( (typeof getZoom === 'function' ? 96*getZoom() : 96) / 96 )), useCORS:true, backgroundColor:'#ffffff' });
		page.style.boxShadow = prevShadow; page.style.borderRadius = prevRadius;
		const mime = (String(format).toLowerCase() === 'jpg' || String(format).toLowerCase() === 'jpeg') ? 'image/jpeg' : 'image/png';
		const dataUrl = canvas.toDataURL(mime, quality);
		const name = filename || `page-${new Date().toISOString().replace(/[:.]/g,'-')}.${mime === 'image/png' ? 'png' : 'jpg'}`;
		// Trigger download
		const a = document.createElement('a'); a.href = dataUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove();
		return dataUrl;
	}

	// Alternative PDF export using browser's built-in print functionality
	async function exportDocumentToPdfNative({ filename = 'myfile.pdf' } = {}) {
		if (isExporting) {
			console.warn('PDF export already in progress, ignoring duplicate call');
			return;
		}
		isExporting = true;
		
		try {
			const pages = Array.from(document.querySelectorAll('.page'));
			if (!pages.length) return;

			// Hide everything except our print content
			const originalBodyOverflow = document.body.style.overflow;
			document.body.style.overflow = 'hidden';

			// Create a temporary container for all pages with strict A4 dimensions
			const printContainer = document.createElement('div');
			printContainer.style.position = 'fixed';
			printContainer.style.left = '-9999px';
			printContainer.style.top = '0';
			printContainer.style.background = '#ffffff';
			printContainer.style.color = '#000000';
			printContainer.style.width = '210mm';
			printContainer.style.height = pages.length === 1 ? '297mm' : 'auto';
			printContainer.style.overflow = 'hidden';
			printContainer.style.margin = '0';
			printContainer.style.padding = '0';
			printContainer.style.boxSizing = 'border-box';
			printContainer.style.maxWidth = '210mm';
			printContainer.style.maxHeight = pages.length === 1 ? '297mm' : 'none';
			
			// Clone all pages and prepare for printing
			const pageClones = [];
			const isSinglePage = pages.length === 1;
			pages.forEach((page, index) => {
				const clone = page.cloneNode(true);
				// Create a fixed-size A4 frame that will contain the scaled page clone
				const frame = document.createElement('div');
				frame.className = 'print-page-frame';
				frame.style.width = '210mm';
				frame.style.height = '297mm';
				frame.style.overflow = 'hidden';
				frame.style.position = 'relative';
				frame.style.background = '#ffffff';
				if (index < pages.length - 1) {
					frame.style.pageBreakAfter = 'always';
				} else {
					frame.style.pageBreakAfter = 'avoid';
				}
				
				// Force page-sized frames but allow natural height for multi-page docs
				clone.style.transform = 'none';
				clone.style.transformOrigin = 'initial';
				clone.style.position = 'relative';
				clone.style.left = '0';
				clone.style.top = '0';
				clone.style.margin = '0';
				clone.style.padding = '0';
				clone.style.boxShadow = 'none';
				clone.style.borderRadius = '0';
				// Keep original pixel size and scale to fit the A4 frame exactly
				const pxPerMm = 96 / 25.4; // CSS px per mm at 96dpi
				const a4WidthPx = 210 * pxPerMm;
				const pageWidthPx = page.offsetWidth || 794; // fallback ~A4 px
				const pageHeightPx = page.offsetHeight || 1123;
				const scaleFactor = a4WidthPx / pageWidthPx;

				clone.style.width = pageWidthPx + 'px';
				clone.style.height = pageHeightPx + 'px';
				clone.style.maxWidth = 'none';
				clone.style.maxHeight = 'none';
				clone.style.overflow = 'hidden';
				clone.style.boxSizing = 'border-box';
				// Scale the entire page clone so layout remains identical to the app
				clone.style.transform = `scale(${scaleFactor})`;
				clone.style.transformOrigin = 'top left';
				// Position clone at top-left of the A4 frame
				clone.style.position = 'absolute';
				clone.style.left = '0';
				clone.style.top = '0';
				// Clip any overflow at the frame boundary
				clone.style.clipPath = 'inset(0)';
				
				// Remove only editor-only overlays/guides, preserve all content
				const overlaySelectors = [
					'.guide',
					'.hf-guide',
					'.smart-gap-line',
					'.gap-badge',
					'.gap-badges',
					'#selectionBox',
					'.selection-box',
					'.selbox',
					'#elementActions',
					'#tableActions',
					'.page-title',
					'.page-controls'
				];
				clone.querySelectorAll(overlaySelectors.join(',')).forEach(n => n.remove());
				
				// Aggressively clip any elements that extend beyond page boundaries
				const allElements = clone.querySelectorAll('*');
				allElements.forEach(element => {
					if (element.style) {
						// Force box-sizing to border-box for consistent sizing
						element.style.boxSizing = 'border-box';
						// Force all elements to stay within page boundaries
						element.style.maxWidth = '210mm';
						element.style.maxHeight = '297mm';
						element.style.overflow = 'hidden';
						// If element has absolute positioning, ensure it's within bounds
						if (element.style.position === 'absolute' || element.style.position === 'fixed') {
							element.style.maxWidth = '210mm';
							element.style.maxHeight = '297mm';
							element.style.clipPath = 'inset(0)';
						}
					}
				});
				
				// Ensure images show actual content, not placeholders, and compress when oversized
				const imageContainers = clone.querySelectorAll('.image-container');
				imageContainers.forEach(container => {
					const img = container.querySelector('img');
					const placeholder = container.querySelector('.image-placeholder');
					if (img && img.src) {
						img.style.display = 'block';
						img.style.visibility = 'visible';
						img.style.opacity = '1';
						img.style.objectFit = 'cover';
						img.style.objectPosition = 'center';
						img.style.imageRendering = 'high-quality';
						// Compress very large images down to near their printed size to reduce PDF size
						try {
							const isDataUrl = img.src.startsWith('data:');
							const srcLower = img.src.toLowerCase();
							const isJPEG = isDataUrl ? srcLower.startsWith('data:image/jpeg') || srcLower.startsWith('data:image/jpg') : /\.(jpe?g)(\?|$)/.test(srcLower);
							const isPNG = isDataUrl ? srcLower.startsWith('data:image/png') : /\.(png)(\?|$)/.test(srcLower);
							const naturalW = img.naturalWidth || 0;
							const naturalH = img.naturalHeight || 0;
							const displayW = Math.max(1, Math.round((img.offsetWidth || img.width || 0) * scaleFactor));
							const displayH = Math.max(1, Math.round((img.offsetHeight || img.height || 0) * scaleFactor));
							// Allow a small oversampling to keep quality
							const targetW = Math.max(1, Math.min(naturalW, Math.round(displayW * 1.5)));
							const targetH = Math.max(1, Math.min(naturalH, Math.round(displayH * 1.5)));
							// Convert PNG to JPEG for much smaller file size
							//if (naturalW > 0 && naturalH > 0) {
								const canvas = document.createElement('canvas');
								canvas.width = naturalW;
								canvas.height = naturalH;
								const ctx = canvas.getContext('2d');
								ctx.drawImage(img, 0, 0);
								// Convert PNG to JPEG for much smaller size
								const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
								// Replace src with compressed version for print clone only
								img.src = dataUrl;
							//}
						} catch (err) {
							// Non-fatal (e.g., cross-origin); keep original image
						}
						if (placeholder) {
							placeholder.style.display = 'none';
							placeholder.style.visibility = 'hidden';
						}
					}
				});
				
				// Don't add page breaks - let the browser handle it naturally
				
				pageClones.push(frame);
				frame.appendChild(clone);
				printContainer.appendChild(frame);
			});
			
			// Add to DOM temporarily
			document.body.appendChild(printContainer);
			
			// Add print-specific CSS
			const printStyles = document.createElement('style');
			printStyles.textContent = `
				@media print {
					@page {
						size: A4;
						margin: 0;
					}
					html, body {
						margin: 0 !important;
						padding: 0 !important;
						height: auto !important;
						overflow: visible !important;
						background: white !important;
						color: black !important;
					}
					/* Hide everything except our print container */
					body > *:not(.print-container) {
						display: none !important;
						visibility: hidden !important;
					}
				/* Show our print container and its contents */
				.print-container {
						display: block !important;
						visibility: visible !important;
						position: static !important;
						left: auto !important;
						top: auto !important;
						width: 210mm !important;
						height: auto !important;
						margin: 0 auto !important;
						padding: 0 !important;
						background: white !important;
						page-break-inside: avoid !important;
						overflow: visible !important;
						outline: none !important;
						border: none !important;
						box-shadow: none !important;
						-webkit-print-color-adjust: exact !important;
						print-color-adjust: exact !important;
						/* A4 width constraint */
						max-width: 210mm !important;
						box-sizing: border-box !important;
					}
				.print-container * {
						visibility: visible !important;
						-webkit-print-color-adjust: exact !important;
						print-color-adjust: exact !important;
					}
				/* New fixed-size A4 frame per page */
				.print-container > .print-page-frame {
					width: 210mm !important;
					height: 297mm !important;
					page-break-after: always !important;
					page-break-inside: avoid !important;
					background: white !important;
					position: relative !important;
					overflow: hidden !important;
					box-sizing: border-box !important;
				}
				.print-container > .print-page-frame:last-child {
					page-break-after: avoid !important;
				}
					/* Force all child elements to stay within strict A4 boundaries */
					.print-container > .page > * {
						max-width: 210mm !important;
						max-height: 297mm !important;
						box-sizing: border-box !important;
						overflow: hidden !important;
						clip-path: inset(0) !important;
					}
					/* Hide all guides completely (safety) */
					.print-container .guide,
					.print-container .hf-guide,
					.print-container .smart-gap-line,
					.print-container .gap-badge,
					.print-container .gap-badges,
					.print-container .page-title,
					.print-container .page-controls {
						display: none !important;
						visibility: hidden !important;
					}
					/* Ensure images show actual content */
					.print-container .image-container img {
						display: block !important;
						visibility: visible !important;
						opacity: 1 !important;
					}
					.print-container .image-placeholder {
						display: none !important;
						visibility: hidden !important;
					}
				}
			`;
			document.head.appendChild(printStyles);
			
			// Add class to container for CSS targeting
			printContainer.classList.add('print-container');
			
			// Small delay to ensure styles are applied
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Trigger browser print dialog
			window.print();
			
			// Cleanup after a delay (print dialog might still be open)
			setTimeout(() => {
				document.body.removeChild(printContainer);
				document.head.removeChild(printStyles);
				document.body.style.overflow = originalBodyOverflow;
				isExporting = false;
			}, 1000);
			
		} catch (error) {
			console.error('Native PDF export failed:', error);
			isExporting = false;
		}
	}

	return { exportDocumentToPdf, exportCurrentPageToImage, exportDocumentToPdfNative, exportDocumentToPdfRasterOnly };
})();


