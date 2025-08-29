// persistence.service.js
// Facade over OPFS, localStorage, File System Access API.

const Persistence = (function(){
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

	async function saveDocument(){
		const json = serializeDocument();
		if (supportsOPFS()){
			try { await opfsWriteFile(`autosave-${getFileScopeId()}.json`, json); return { ok:true, via:'opfs' }; } catch (_) {}
		}
		if (localSave(json)) return { ok:true, via:'localStorage' };
		if (supportsFSA() && currentFileHandle){
			try { const html = buildSaveHtml(); await writeHandle(currentFileHandle, html); return { ok:true, via:'fsa' }; } catch(_){}
		}
		const currentFilename = (function(){ const path = window.location.pathname; const filename = path.split('/').pop(); if (filename && filename.toLowerCase().endsWith('.html')) return filename; return null; })();
		if (currentFilename){ const html = buildSaveHtml(); download(currentFilename, html, 'text/html'); return { ok:true, via:'download' }; }
		return { ok:false };
	}

	async function saveDocumentAs(){
		if (supportsFSA()){
			try {
				const defaultName = `certificate-maker-${new Date().toISOString().slice(0,19).replace(/[:.]/g,'-')}.html`;
				const handle = await window.showSaveFilePicker({ suggestedName: defaultName, types:[{ description:'HTML', accept:{ 'text/html': ['.html','.htm'] } }] });
				currentFileHandle = handle;
				const html = buildSaveHtml();
				await writeHandle(currentFileHandle, html);
				return { ok:true, via:'fsa' };
			} catch(_){}
		}
		const defaultName = `certificate-maker-${new Date().toISOString().slice(0,19).replace(/[:.]/g,'-')}.html`;
		const html = buildSaveHtml();
		download(defaultName, html, 'text/html');
		return { ok:true, via:'download' };
	}

	async function tryAutoLoad(){
		// Embedded first
		const saved = document.getElementById('__doc__');
		if (saved && saved.textContent) {
			try { deserializeDocument(saved.textContent.replaceAll('&lt;','<')); return { ok:true, via:'embedded' }; } catch {}
		}
		// OPFS
		if (supportsOPFS()){
			try { const text = await opfsReadTextIfExists(`autosave-${getFileScopeId()}.json`); if (text){ deserializeDocument(text); return { ok:true, via:'opfs' }; } } catch(_){}
		}
		// LocalStorage
		const ls = localLoad(); if (ls){ try { deserializeDocument(ls); return { ok:true, via:'localStorage' }; } catch{} }
		return { ok:false };
	}

	return { saveDocument, saveDocumentAs, tryAutoLoad };
})();


