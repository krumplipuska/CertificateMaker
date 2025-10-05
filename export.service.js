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

	let isExporting = false;
	async function exportDocumentToPdf({ filename = 'myfile.pdf', dpi = 220, orientation = 'portrait' } = {}){
		if (isExporting) {
			console.warn('PDF export already in progress, ignoring duplicate call');
			return;
		}
		isExporting = true;
		try {
		const pages = Array.from(document.querySelectorAll('.page')); if (!pages.length) return;
		// Preflight
		try { if (document.fonts && document.fonts.ready) { await document.fonts.ready; } } catch {}
			const originalZoom = typeof getZoom === 'function' ? getZoom() : 1; 
			if (typeof setZoomScale === 'function') setZoomScale(1);
			
			// Force CSS zoom to 1 and wait for full propagation
			document.documentElement.style.setProperty('--zoom', '1');
			
			// Stabilize layout: neutralize scroll and wait for styles to apply
			const vp = document.getElementById('pageViewport');
			const prevVpScrollLeft = vp ? vp.scrollLeft : 0;
			const prevVpScrollTop  = vp ? vp.scrollTop  : 0;
			const prevWinScrollX = window.scrollX, prevWinScrollY = window.scrollY;
			try { if (vp) vp.scrollTo(0,0); window.scrollTo(0,0); } catch {}
			
			// Triple RAF to ensure CSS var --zoom=1 takes effect before measuring/capture
			await new Promise(res => requestAnimationFrame(() => 
				requestAnimationFrame(() => requestAnimationFrame(res))));

		const html2canvasFn = await ensureHtml2Canvas();
		const jsPDF = await ensureJsPDF();
			const scale = 1; // Always use 1:1 scale for exact PDF reproduction
			const canvasScrollX = 0;
			const canvasScrollY = 0;
			
			// Measure page dimensions after zoom stabilization
			const firstPage = pages[0]; 
			const widthPx = firstPage.offsetWidth; 
			const heightPx = firstPage.offsetHeight;
			
			console.log(`Page dimensions after zoom=1: ${widthPx}x${heightPx}`);
			console.log(`Page computed style transform: ${window.getComputedStyle(firstPage).transform}`);
			console.log(`CSS --zoom value: ${getComputedStyle(document.documentElement).getPropertyValue('--zoom')}`);
			
			// Log some element positions for debugging
			const elements = firstPage.querySelectorAll('.element');
			if (elements.length > 0) {
				console.log(`Found ${elements.length} elements on page`);
				elements.forEach((el, idx) => {
					const rect = el.getBoundingClientRect();
					const computed = window.getComputedStyle(el);
					console.log(`Element ${idx}: pos(${el.style.left}, ${el.style.top}) size(${el.style.width}, ${el.style.height}) transform(${computed.transform})`);
				});
			}
		const pdf = new jsPDF({ unit:'px', format:[widthPx, heightPx], orientation, compress:true });
		for (let i=0;i<pages.length;i++){
			const page = pages[i];
				const prevShadow = page.style.boxShadow; 
				const prevRadius = page.style.borderRadius; 
				const prevTransform = page.style.transform;
				const prevTransformOrigin = page.style.transformOrigin;
				
				// Remove all transforms for clean capture
				page.style.boxShadow = 'none'; 
				page.style.borderRadius = '0';
				page.style.transform = 'none';
				page.style.transformOrigin = 'initial';
			// Hide editor-only guides (including header/footer bands) while capturing
			const guides = Array.from(page.querySelectorAll('.guide, .hf-guide'));
			const prevGuideDisplay = guides.map(n => n.style.display);
			guides.forEach(n => n.style.display = 'none');
			
			// Prepare images for better export quality
			const images = Array.from(page.querySelectorAll('img'));
			const prevImageStyles = images.map(img => ({
				objectFit: img.style.objectFit,
				objectPosition: img.style.objectPosition
			}));
			
			// Ensure all images are loaded and properly styled
			await Promise.all(images.map(img => {
				if (img.complete && img.naturalWidth > 0) {
					return Promise.resolve();
				}
				return new Promise((resolve) => {
					img.onload = resolve;
					img.onerror = resolve;
					// Timeout after 5 seconds
					setTimeout(resolve, 5000);
				});
			}));
			
			images.forEach(img => {
				img.style.objectFit = 'contain';
				img.style.objectPosition = 'center';
				img.style.imageRendering = 'high-quality';
			});
			
			// Small delay to ensure styles are applied
			await new Promise(resolve => setTimeout(resolve, 100));
				const canvas = await html2canvasFn(page, { 
				scale, 
				useCORS: true, 
				backgroundColor: '#ffffff', 
				scrollX: canvasScrollX, 
				scrollY: canvasScrollY,
				allowTaint: true,
				foreignObjectRendering: true,
				imageTimeout: 15000,
				logging: false,
				width: widthPx,
				height: heightPx
			});
			// Restore styles
			page.style.boxShadow = prevShadow; 
			page.style.borderRadius = prevRadius;
			page.style.transform = prevTransform;
			page.style.transformOrigin = prevTransformOrigin;
			guides.forEach((n, idx) => { n.style.display = prevGuideDisplay[idx]; });
			
			// Restore image styles
			images.forEach((img, idx) => {
				const prevStyle = prevImageStyles[idx];
				img.style.objectFit = prevStyle.objectFit;
				img.style.objectPosition = prevStyle.objectPosition;
				img.style.imageRendering = '';
			});
			
			console.log(`Page ${i+1}: Canvas dimensions: ${canvas.width}x${canvas.height}, Page dimensions: ${widthPx}x${heightPx}`);
			
			const imgData = canvas.toDataURL('image/jpeg', 0.75);
			if (i>0) pdf.addPage([widthPx, heightPx], orientation);
			pdf.addImage(imgData, 'JPEG', 0, 0, widthPx, heightPx);
		}
		pdf.save(filename);
		if (typeof setZoomScale === 'function') setZoomScale(originalZoom);
		} finally {
			// Restore viewport/window scroll and zoom regardless of outcome
			try { if (typeof setZoomScale === 'function') setZoomScale(originalZoom); } catch {}
			try { document.documentElement.style.setProperty('--zoom', String(originalZoom)); } catch {}
			try { if (vp) vp.scrollTo(prevVpScrollLeft, prevVpScrollTop); window.scrollTo(prevWinScrollX, prevWinScrollY); } catch {}
			isExporting = false;
		}
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
						img.style.objectFit = 'contain';
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

	return { exportDocumentToPdf, exportCurrentPageToImage, exportDocumentToPdfNative };
})();


