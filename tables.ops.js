// tables.ops.js
// Explicit export surface for table operations (pure).

const TableOps = {
	addRow: tableAddRow,
	addColumn: tableAddColumn,
	deleteRow: tableDeleteRow,
	deleteColumn: tableDeleteColumn,
	deleteRowsRange: tableDeleteRowsRange,
	deleteColsRange: tableDeleteColsRange,
	mergeRange: tableMergeRange,
	unmerge: tableUnmerge,
	unmergeRange: tableUnmergeRange,
	resizeRows: tableResizeRows,
	resizeCols: tableResizeCols,
	distributeRows: tableDistributeRows,
	distributeCols: tableDistributeCols,
	applyCellBg: tableApplyCellBg,
	applyTextColor: tableApplyTextColor,
	applyAlign: tableApplyAlign,
	applyCellStyle: tableApplyCellStyle,
	anyCellStyleOff: tableAnyCellStyleOff,
};


