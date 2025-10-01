/* ----------------------- Multi copy/delete ----------------------- */
let clipboardElements = []; // Internal clipboard for elements

function copyToClipboard() {
  if (selectedIds.size === 0) return;
  clipboardElements = [...selectedIds].map(id => {
    const element = deepClone(getElementById(id));
    return element;
  });
}

function pasteFromClipboard() {
  if (clipboardElements.length === 0) return;
  
  const page = getCurrentPage();
  const clones = [];
  const offset = 12; // Offset for pasted elements
  
  clipboardElements.forEach(src => {
    const clone = deepClone(src);
    clone.id = generateId();
    clone.x += offset; 
    clone.y += offset;
    if (clone.type === 'line' && typeof clone.x2 === 'number' && typeof clone.y2 === 'number') {
      clone.x2 += offset; 
      clone.y2 += offset;
    }
    clones.push(clone);
  });
  
  if (clones.length === 0) return;
  commitHistory('paste-multi');
  page.elements.push(...clones);
  setSelection(clones.map(c => c.id));
  renderPage(page);
}

function copySelection(offset = 12){
  if (selectedIds.size === 0) return;
  const page = getCurrentPage();
  const clones = [];
  [...selectedIds].forEach(id => {
    const src = deepClone(getElementById(id));
    if (!src) return;
    src.id = generateId();
    src.x += offset; src.y += offset;
    if (src.type === 'line' && typeof src.x2 === 'number' && typeof src.y2 === 'number'){
      src.x2 += offset; src.y2 += offset;
    }
    clones.push(src);
  });
  if (clones.length === 0) return;
  commitHistory('copy-multi');
  page.elements.push(...clones);
  setSelection(clones.map(c => c.id));
  renderPage(page);
}

function deleteSelection(){
  if (selectedIds.size === 0) return;
  const page = getCurrentPage();
  commitHistory('delete-multi');
  page.elements = page.elements.filter(e => !selectedIds.has(e.id));
  clearSelection();
  renderPage(page);
  // Hide actions bubble after delete
  elementActions().classList.add('hidden');
}

