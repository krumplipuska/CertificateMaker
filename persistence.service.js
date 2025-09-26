// persistence.service.js
// Facade over OPFS, localStorage, File System Access API.

const Persistence = (function(){
	// Debug helper
	function log(...args){ try { console.info('[Persistence]', ...args); } catch {} }
	function getFileScopeId(){
		try {
			const path = (window && window.location && window.location.pathname) ? window.location.pathname : '';
			const key = path.replace(/[^a-z0-9\-_.]/gi, '_').toLowerCase();
			return key || 'index';
		} catch (_) { return 'index'; }
	}
	function supportsOPFS(){ return typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory; }
	async function opfsGetRoot(){ return await navigator.storage.getDirectory(); }
	async function opfsWriteFile(filename, text){ const root = await opfsGetRoot(); const fh = await root.getFileHandle(filename, { create: true }); const w = await fh.createWritable(); await w.write(text); await w.close(); }
	async function opfsReadTextIfExists(filename){ try { const root = await opfsGetRoot(); const fh = await root.getFileHandle(filename, { create: false }); const file = await fh.getFile(); return await file.text(); } catch (_) { return null; } }
	function localAutosaveKey(){ return `certificateMaker:autosave:v1:${getFileScopeId()}`; }
	function localSave(text){ try { localStorage.setItem(localAutosaveKey(), text); return true; } catch (_) { return false; } }
	function localLoad(){ try { return localStorage.getItem(localAutosaveKey()); } catch (_) { return null; } }
	let currentFileHandle = null;
	function supportsFSA(){ return typeof window !== 'undefined' && 'showSaveFilePicker' in window; }
	async function verifyPermission(fileHandle, withWrite){ const opts = {}; if (withWrite) opts.mode = 'readwrite'; if ((await fileHandle.queryPermission(opts)) === 'granted') return true; if ((await fileHandle.requestPermission(opts)) === 'granted') return true; return false; }
	async function writeHandle(handle, content){ const ok = await verifyPermission(handle, true); if (!ok) throw new Error('Permission denied'); const writable = await handle.createWritable(); await writable.write(content); await writable.close(); }

	// --- Persisting the file handle across reloads (IndexedDB) ---
	async function openDb(){
		return await new Promise((resolve, reject) => {
			try {
				const req = indexedDB.open('cm-persistence', 1);
				req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles'); };
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			} catch (e) { reject(e); }
		});
	}
	async function storeHandle(handle){
		try { const db = await openDb(); await new Promise((res, rej) => { const tx = db.transaction('handles', 'readwrite'); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.objectStore('handles').put(handle, 'current'); }); log('Stored file handle'); return true; } catch (e) { log('Failed to store handle', e); return false; }
	}
	async function loadHandle(){
		try { const db = await openDb(); return await new Promise((res, rej) => { const tx = db.transaction('handles','readonly'); tx.onerror = () => rej(tx.error); const req = tx.objectStore('handles').get('current'); req.onsuccess = () => res(req.result || null); req.onerror = () => rej(req.error); }); } catch (e) { log('Failed to load handle', e); return null; }
	}
	async function restoreHandle(){
		if (!supportsFSA()) { log('FSA not supported; cannot restore handle'); return false; }
		try {
			const h = await loadHandle();
			if (h){
				try { await h.queryPermission?.({ mode: 'readwrite' }); } catch {}
				currentFileHandle = h; log('Restored file handle'); return true;
			}
		} catch (e) { log('Restore handle failed', e); }
		return false;
	}

	async function saveDocument(opts){
		const options = opts || {};
		log('saveDocument called', { silent: !!options.silent, isSecureContext: (typeof window!== 'undefined' && window.isSecureContext), supportsFSA: supportsFSA(), hasHandle: !!currentFileHandle, supportsOPFS: supportsOPFS() });
		// If we already have permission to a file handle, write silently.
		if (supportsFSA() && currentFileHandle){
			try { const html = buildSaveHtml(); await writeHandle(currentFileHandle, html); log('Saved via FSA'); return { ok:true, via:'fsa' }; } catch(e){ log('FSA save failed', e); }
		}
		// Silent background save path: try OPFS first, then localStorage as a last resort
		if (options.silent){
			try {
				const html = buildSaveHtml();
				if (supportsOPFS()) { await opfsWriteFile(`${getFileScopeId()}-autosave.html`, html); log('Saved via OPFS'); return { ok:true, via:'opfs' }; }
				// Fall back to localStorage snapshot
				localSave(html); log('Saved via localStorage');
				return { ok:true, via:'local' };
			} catch (e) { log('Silent save failed', e); }
		}
		// If not silent, fall back to a regular download of the HTML (prompts user)
		if (!options.silent){
			const currentFilename = (function(){ const path = window.location.pathname; const filename = path.split('/').pop(); if (filename && filename.toLowerCase().endsWith('.html')) return filename; return null; })();
			if (currentFilename){ const html = buildSaveHtml(); download(currentFilename, html, 'text/html'); log('Saved via download to', currentFilename); return { ok:true, via:'download' }; }
		}
		console.warn('[Persistence] Save failed');
		return { ok:false };
	}

	async function saveDocumentAs(){
		if (supportsFSA()){
			try {
				const defaultName = `certificate-maker-${new Date().toISOString().slice(0,19).replace(/[:.]/g,'-')}.html`;
				const handle =  await window.showSaveFilePicker({ suggestedName: defaultName, types:[{ description:'HTML', accept:{ 'text/html': ['.html','.htm'] } }] });
				currentFileHandle = handle;		
				
				console.log('Save As to handle', handle);

				const html = buildSaveHtml();
				await writeHandle(currentFileHandle, html);
				try { await storeHandle(handle); } catch {}
				log('Save As via FSA');
				return { ok:true, via:'fsa' };
			} catch(_){}
		}
		const defaultName = `certificate-maker-${new Date().toISOString().slice(0,19).replace(/[:.]/g,'-')}.html`;
		const html = buildSaveHtml();
		download(defaultName, html, 'text/html'); log('Save As via download', defaultName);
		return { ok:true, via:'download' };
	}

	async function tryAutoLoad(){
		// Only load if the document is embedded in the current HTML file.
		const saved = document.getElementById('__doc__');
		if (saved && saved.textContent) {
			try { deserializeDocument(saved.textContent.replaceAll('&lt;','<')); return { ok:true, via:'embedded' }; } catch {}
		}
		return { ok:false };
	}

	return { saveDocument, saveDocumentAs, tryAutoLoad, restoreHandle };
})();


