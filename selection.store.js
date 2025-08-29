// selection.store.js
// Centralized selection store to avoid cross-file mutation. Minimal API.

const SelectionStore = (function(){
	let elementIds = new Set();
	let listeners = new Set();
	return {
		get(){ return new Set(elementIds); },
		set(ids){ elementIds = new Set((ids||[]).filter(Boolean)); listeners.forEach(fn=>fn()); },
		clear(){ elementIds.clear(); listeners.forEach(fn=>fn()); },
		add(id){ if (!id) return; elementIds.add(id); listeners.forEach(fn=>fn()); },
		toggle(id){ if (!id) return; elementIds.has(id) ? elementIds.delete(id) : elementIds.add(id); listeners.forEach(fn=>fn()); },
		on(fn){ listeners.add(fn); return () => listeners.delete(fn); }
	};
})();


