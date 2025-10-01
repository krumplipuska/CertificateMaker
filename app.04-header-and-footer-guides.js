/* ----------------------- Header & Footer Guides ----------------------- */
function updateHeaderFooterGuides(pageNode){
  try {
    if (!pageNode) return;
    const hh = Number(Model?.document?.headerHeight || 0);
    const fh = Number(Model?.document?.footerHeight || 0);
    const header = pageNode.querySelector('.hf-guide.header');
    const footer = pageNode.querySelector('.hf-guide.footer');
    if (header){ header.style.height = Math.max(0, hh) + 'px'; header.style.display = hh > 0 ? 'block' : 'none'; }
    if (footer){ footer.style.height = Math.max(0, fh) + 'px'; footer.style.display = fh > 0 ? 'block' : 'none'; }
  } catch {}
}

function setHeaderFooterHeights({ header, footer }){
  commitHistory('set-header-footer');
  Model.document.headerHeight = Math.max(0, Number(header || 0));
  Model.document.footerHeight = Math.max(0, Number(footer || 0));
  // Update all page guides and reflow stacks for usable height
  try {
    document.querySelectorAll('.page').forEach(p => updateHeaderFooterGuides(p));
  } catch {}
  try { reflowStacks(getCurrentPage()); } catch {}
}
function attachHeaderFooterResizers(pageNode, pageId){
  try {
    const header = pageNode.querySelector('.hf-guide.header .hf-resize');
    const footer = pageNode.querySelector('.hf-guide.footer .hf-resize');
    const z = (typeof getZoom === 'function') ? (getZoom() || 1) : 1;
    if (header){
      let startY = 0; let startH = 0; let moving = false;
      header.addEventListener('mousedown', (e) => {
        if (!Model.document.editMode) return;
        moving = true; startY = e.clientY; startH = Number(Model.document.headerHeight || 0);
        document.body.classList.add('hf-resizing');
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      });
      window.addEventListener('mousemove', (e) => {
        if (!moving) return;
        const dy = (e.clientY - startY) / (z || 1);
        const nh = Math.max(0, Math.round(startH + dy));
        Model.document.headerHeight = nh;
        updateHeaderFooterGuides(pageNode);
      });
      window.addEventListener('mouseup', () => { if (moving){ moving = false; setHeaderFooterHeights({ header: Model.document.headerHeight, footer: Model.document.footerHeight }); document.body.classList.remove('hf-resizing'); } });
    }
    if (footer){
      let startY = 0; let startH = 0; let moving = false; const pageRect = () => pageNode.getBoundingClientRect();
      footer.addEventListener('mousedown', (e) => {
        if (!Model.document.editMode) return; moving = true; startY = e.clientY; startH = Number(Model.document.footerHeight || 0); document.body.classList.add('hf-resizing'); e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      });
      window.addEventListener('mousemove', (e) => {
        if (!moving) return; const dy = (startY - e.clientY) / (z || 1); const nh = Math.max(0, Math.round(startH + dy)); Model.document.footerHeight = nh; updateHeaderFooterGuides(pageNode);
      });
      window.addEventListener('mouseup', () => { if (moving){ moving = false; setHeaderFooterHeights({ header: Model.document.headerHeight, footer: Model.document.footerHeight }); document.body.classList.remove('hf-resizing'); } });
    }
  } catch {}
}


