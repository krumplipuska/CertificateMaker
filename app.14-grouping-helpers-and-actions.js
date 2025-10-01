/* ----------------------- Grouping helpers & actions ----------------------- */
function ensureGroupId(){ return 'grp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,6); }
function getElementsByGroup(groupId){ return getCurrentPage().elements.filter(e => e.groupId === groupId); }
function getElementGroupId(id){ const m = getElementById(id); return m?.groupId ?? null; }
function assignGroup(ids, groupId){ const p = getCurrentPage(); ids.forEach(id => { const m = p.elements.find(e => e.id === id); if (m) m.groupId = groupId; }); }
function clearGroup(ids){ const p = getCurrentPage(); ids.forEach(id => { const m = p.elements.find(e => e.id === id); if (m) m.groupId = null; }); }

function groupSelection(){
  if (selectedIds.size < 2) return;
  const gid = ensureGroupId();
  commitHistory('group');
  assignGroup([...selectedIds], gid);
  renderPage(getCurrentPage()); updateSelectionUI();
}
function ungroupSelection(){
  if (selectedIds.size === 0) return;
  const first = getElementById([...selectedIds][0]);
  const gid = first?.groupId; if (!gid) return;
  const allSame = [...selectedIds].every(id => getElementById(id)?.groupId === gid);
  if (!allSame) return;
  commitHistory('ungroup');
  clearGroup([...selectedIds]);
  renderPage(getCurrentPage()); updateSelectionUI();
}

// Toggle group/ungroup for action bar button
function updateGroupToggleButton(){
  const actions = elementActions(); if (!actions) return;
  const btn = actions.querySelector('[data-group-toggle]'); if (!btn) return;
  const first = selectedIds.size ? getElementById([...selectedIds][0]) : null;
  const gid = first?.groupId;
  const allSame = gid && [...selectedIds].every(id => getElementById(id)?.groupId === gid);
  btn.textContent = allSame ? 'Ungroup' : 'Group';
  btn.disabled = selectedIds.size < 2 && !allSame;
}
function toggleGroupSelection(){
  const first = selectedIds.size ? getElementById([...selectedIds][0]) : null;
  const gid = first?.groupId;
  const allSame = gid && [...selectedIds].every(id => getElementById(id)?.groupId === gid);
  if (allSame) { ungroupSelection(); }
  else if (selectedIds.size >= 2) { groupSelection(); }
}

