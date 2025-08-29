// style.map.js
// Centralized style mapping and normalization.

const ELEMENT_STYLE_KEYS = [
	'fill','strokeColor','strokeWidth','radius','textColor','fontFamily','fontSize','bold','italic','underline','textAlignH','textAlignV','rotate'
];

const TABLE_PER_CELL_KEYS = [
	'strokeColor','strokeWidth','fontFamily','fontSize','bold','italic','underline','borderColor','borderWidth'
];

function tablePatchFromElementPatch(stylePatch){
	const s = stylePatch || {};
	const out = {
		bg: s.fill != null ? s.fill : undefined,
		textColor: s.textColor != null ? s.textColor : undefined,
		alignH: s.textAlignH != null ? s.textAlignH : undefined,
		alignV: s.textAlignV != null ? s.textAlignV : undefined,
		perCell: {}
	};
	TABLE_PER_CELL_KEYS.forEach(k => {
		if (Object.prototype.hasOwnProperty.call(s, k)) out.perCell[k] = s[k];
	});
	return out;
}


