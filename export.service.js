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
	async function ensureHtml2Canvas(){ if (typeof window.html2canvas === 'function') return window.html2canvas; await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'); if (typeof window.html2canvas === 'function') return window.html2canvas; throw new Error('html2canvas is not available'); }
	async function ensureJsPDF(){ if (window.jspdf && typeof window.jspdf.jsPDF === 'function') return window.jspdf.jsPDF; if (typeof window.jsPDF === 'function') return window.jsPDF; await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'); if (window.jspdf && typeof window.jspdf.jsPDF === 'function') return window.jspdf.jsPDF; if (typeof window.jsPDF === 'function') return window.jsPDF; throw new Error('jsPDF is not available'); }

	async function exportDocumentToPdf({ filename = 'myfile.pdf', dpi = 220, orientation = 'portrait' } = {}){
		const pages = Array.from(document.querySelectorAll('.page')); if (!pages.length) return;
		// Preflight
		try { if (document.fonts && document.fonts.ready) { await document.fonts.ready; } } catch {}
		const originalZoom = typeof getZoom === 'function' ? getZoom() : 1; if (typeof setZoomScale === 'function') setZoomScale(1);
		const html2canvasFn = await ensureHtml2Canvas();
		const jsPDF = await ensureJsPDF();
		const scale = Math.max(1, Math.round(dpi / 96));
		const canvasScrollX = -window.scrollX || -7;
		const canvasScrollY = -window.scrollY || 0;
		const firstPage = pages[0]; const widthPx = firstPage.offsetWidth; const heightPx = firstPage.offsetHeight;
		const pdf = new jsPDF({ unit:'px', format:[widthPx, heightPx], orientation, compress:true });
		for (let i=0;i<pages.length;i++){
			const page = pages[i];
			const prevShadow = page.style.boxShadow; const prevRadius = page.style.borderRadius; page.style.boxShadow = 'none'; page.style.borderRadius = '0';
			const canvas = await html2canvasFn(page, { scale, useCORS:true, backgroundColor:'#ffffff', scrollX: canvasScrollX, scrollY: canvasScrollY });
			page.style.boxShadow = prevShadow; page.style.borderRadius = prevRadius;
			const imgData = canvas.toDataURL('image/jpeg', 0.75);
			if (i>0) pdf.addPage([widthPx, heightPx], orientation);
			pdf.addImage(imgData, 'JPEG', 0, 0, widthPx, heightPx);
		}
		pdf.save(filename);
		if (typeof setZoomScale === 'function') setZoomScale(originalZoom);
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

	return { exportDocumentToPdf, exportCurrentPageToImage };
})();


