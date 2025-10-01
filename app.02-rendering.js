/* ----------------------- Rendering ----------------------- */
function renderAll() {
  renderPagesList();
  clearSelection();
  // Do not force visibility when editing; users expect all elements visible in edit mode
  if (!(Model && Model.document && Model.document.editMode)) enforceVisibilityForAllPages();
}

