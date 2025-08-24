// The users can use this file to add their own functions to the app.

// Functions register themselves to window.USER_FUNCTIONS (see below)
// Provide a global reader used by the Properties panel to populate the dropdown
function getUserFunctionChoices(){
    try {
        const list = Array.isArray(window.USER_FUNCTIONS) ? window.USER_FUNCTIONS : [];
        return list
            .filter(x => x && typeof x.name === 'string')
            .map(x => ({
                name: x.name,
                label: x.label || x.name,
                inputs: Number.isFinite(x.inputs) ? x.inputs : (typeof window[x.name] === 'function' ? window[x.name].length : 0),
                // optional array of placeholder strings for inputs
                placeholders: Array.isArray(x.placeholders) ? x.placeholders : []
            }));
    } catch { return []; }
}

// Register functions for the Properties panel dropdown
;(function(){
    try {
        if (!Array.isArray(window.USER_FUNCTIONS)) window.USER_FUNCTIONS = [];
        const ensure = (meta) => {
            if (!window.USER_FUNCTIONS.some(f => f && f.name === meta.name)) {
                window.USER_FUNCTIONS.push(meta);
            }
        };
        ensure({ name:'simpleConsoleLogFunction', label:'Console log', inputs:1, placeholders:["message to log"], triggers:['click','change','input','dblclick','focus','blur'] });
        ensure({ name:'coloringFunction', label:'coloringFunction', inputs:2, placeholders:["selected element (css selector)", "style string e.g. background:#ff0000; color:#fff;"], triggers:['click','change','input','dblclick','focus','blur'] });
        ensure({
            name:'conditionalFormatByOffset',
            label:'Conditional Format (offsets)',
            inputs:4,
            placeholders:[
                'min col offset (e.g., -2)',
                'max col offset (e.g., -1)',
                'OK style CSS (e.g., background:#9ccc65;color:#000)',
                'NOK style CSS (e.g., background:#ff6b6b;color:#fff)'
            ],
            triggers:['click','change','input','dblclick','focus','blur']
        });
    } catch {}
})();

function normalizeColorToHex(val){
    if (val == null) return val;
    const str = String(val).trim();
    // #RRGGBB
    let m = str.match(/^#([0-9a-fA-F]{6})$/);
    if (m) return '#' + m[1].toLowerCase();
    // #RGB -> #RRGGBB
    m = str.match(/^#([0-9a-fA-F]{3})$/);
    if (m) return '#' + m[1].split('').map(x => x + x).join('').toLowerCase();
    // #RRGGBBAA -> drop alpha
    m = str.match(/^#([0-9a-fA-F]{8})$/);
    if (m) return '#' + m[1].slice(0,6).toLowerCase();
    // rgb/rgba
    m = str.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (m){
        const r = Math.max(0, Math.min(255, parseInt(m[1], 10))).toString(16).padStart(2,'0');
        const g = Math.max(0, Math.min(255, parseInt(m[2], 10))).toString(16).padStart(2,'0');
        const b = Math.max(0, Math.min(255, parseInt(m[3], 10))).toString(16).padStart(2,'0');
        return `#${r}${g}${b}`;
    }
    // Try browser normalization for named colors etc.
    try {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = str; // throws for invalid
        const out = ctx.fillStyle; // often '#rrggbb' or 'rgba(...)'
        if (/^#/.test(out)) return normalizeColorToHex(out);
        const rgbm = out.match(/^rgba?\((.*)\)$/i);
        if (rgbm) return normalizeColorToHex(out);
    } catch {}
    return str; // fall back
}

function styleToModelPatch(styleObj, model, opts){
    const patch = { styles: {} };
    const s = patch.styles;
    const get = (k) => styleObj[k] ?? styleObj[k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())];

    const bg = get('background') ?? get('backgroundColor');
    if (bg != null) s.fill = normalizeColorToHex(bg);

    const txt = get('color') ?? get('textColor');
    if (txt != null) s.textColor = normalizeColorToHex(txt);

    const br = get('border');
    if (br){
        const str = String(br).trim();
        const wM = str.match(/(\d+(?:\.\d+)?)px/);
        if (wM) s.strokeWidth = Number(wM[1]) || 1;
        const cM = str.match(/(#[0-9a-fA-F]{3,8}|rgba?\([^\)]+\)|hsla?\([^\)]+\)|[a-zA-Z]+)\s*$/);
        if (cM) {
            const col = cM[1];
            const hex = normalizeColorToHex(col);
            if (/^#([0-9a-fA-F]{6})$/.test(hex)) s.strokeColor = hex;
        }
    }
    const brW = get('borderWidth'); if (brW != null) s.strokeWidth = Number(String(brW).replace('px','')) || 0;
    const brC = get('borderColor'); if (brC != null) {
        const hex = normalizeColorToHex(brC);
        if (/^#([0-9a-fA-F]{6})$/.test(hex)) s.strokeColor = hex;
    }

    const rad = get('borderRadius') ?? get('radius');
    if (rad != null) s.radius = Number(String(rad).replace('px','')) || 0;

    // Typography
    const ff = get('fontFamily'); if (ff != null) s.fontFamily = String(ff);
    const fzRaw = get('fontSize');
    if (fzRaw != null){
        const raw = String(fzRaw).trim();
        const num = parseFloat(raw);
        if (!isNaN(num)){
            if (/px$/i.test(raw)) s.fontSize = Math.round((num * 72) / 96); // px -> pt
            else s.fontSize = Math.round(num); // assume pt or unitless means pt
        }
    }
    const fw = get('fontWeight');
    if (fw != null){
        const w = String(fw).toLowerCase();
        const wNum = parseInt(w, 10);
        s.bold = w === 'bold' || (!isNaN(wNum) && wNum >= 600) ? true : (w === 'normal' ? false : s.bold);
    }
    const fst = get('fontStyle');
    if (fst != null){
        const v = String(fst).toLowerCase();
        if (v === 'italic' || v === 'normal') s.italic = (v === 'italic');
    }
    const tdec = get('textDecoration') ?? get('textDecorationLine');
    if (tdec != null){
        const v = String(tdec).toLowerCase();
        if (v.includes('underline')) s.underline = true;
        if (v === 'none') s.underline = false;
    }

    // Alignment
    const ta = get('textAlign');
    if (ta != null){
        const v = String(ta).toLowerCase();
        if (v === 'left' || v === 'center' || v === 'right') s.textAlignH = v;
    }
    const ai = get('alignItems');
    if (ai != null){
        const v = String(ai).toLowerCase();
        if (v === 'flex-start') s.textAlignH = s.textAlignH || 'left';
        if (v === 'center') s.textAlignH = s.textAlignH || 'center';
        if (v === 'flex-end') s.textAlignH = s.textAlignH || 'right';
    }
    const jc = get('justifyContent');
    if (jc != null){
        const v = String(jc).toLowerCase();
        if (v === 'flex-start') s.textAlignV = 'top';
        if (v === 'center') s.textAlignV = 'middle';
        if (v === 'flex-end') s.textAlignV = 'bottom';
    }

    // Rotation
    const rot = get('rotate');
    if (rot != null){
        const m = String(rot).match(/-?\d+(?:\.\d+)?/);
        if (m) s.rotate = Number(m[0]);
    }
    const tf = get('transform');
    if (tf != null){
        const m = String(tf).match(/rotate\((-?\d+(?:\.\d+)?)deg\)/i);
        if (m) s.rotate = Number(m[1]);
    }

    // If nothing mapped, return null so we don't commit empty patches
    if (Object.keys(s).length === 0) return null;

    // Optional: emit table-ready keys instead of generic element keys
    if (opts && opts.target === 'table'){
        const tableStyles = modelPatchToCellStyle(s);
        if (!tableStyles || Object.keys(tableStyles).length === 0) return null;
        return { styles: tableStyles };
    }
    return patch;
}

function parseStyleString(styleString){
    const out = {};
    if (!styleString) return out;
    const src = String(styleString);
    // Split on ';' or ',' but only when outside parentheses (e.g., rgb(...))
    const parts = [];
    let buf = '';
    let depth = 0; // parentheses depth
    for (let i = 0; i < src.length; i++){
        const ch = src[i];
        if (ch === '(') { depth++; buf += ch; continue; }
        if (ch === ')') { depth = Math.max(0, depth-1); buf += ch; continue; }
        if ((ch === ';' || ch === ',') && depth === 0){
            const seg = buf.trim(); if (seg) parts.push(seg); buf='';
            continue;
        }
        buf += ch;
    }
    if (buf.trim()) parts.push(buf.trim());
    parts.forEach(part => {
        const idx = part.indexOf(':');
        const k = (idx >= 0 ? part.slice(0, idx) : '').trim();
        const v = (idx >= 0 ? part.slice(idx+1) : '').trim();
        if (!k || !v) return;
        out[k] = v;
    });
    return out;
}


//border-top-left-radius:25px; border-top-right-radius:25px; border-bottom-right-radius:25px; border-bottom-left-radius:25px; background-image:initial; background-position-x:initial; background-position-y:initial; background-size:initial; background-repeat:initial; background-attachment:initial; background-origin:initial; background-clip:initial; background-color:rgb(28, 210, 4); border-top-width:9px; border-right-width:9px; border-bottom-width:9px; border-left-width:9px; border-top-style:solid; border-right-style:solid; border-bottom-style:solid; border-left-style:solid; border-top-color:rgb(17, 24, 39); border-right-color:rgb(17, 24, 39); border-bottom-color:rgb(17, 24, 39); border-left-color:rgb(17, 24, 39); border-image-source:initial; border-image-slice:initial; border-image-width:initial; border-image-outset:initial; border-image-repeat:initial; color:rgb(17, 24, 39); font-family:system-ui; font-size:14pt; font-weight:400; font-style:normal; text-decoration-line:none; text-decoration-thickness:initial; text-decoration-style:initial; text-decoration-color:initial; transform-origin:50% 50%; display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; text-align:left


//your function in here!!



function simpleConsoleLogFunction(message){
    console.log(message);
}

function coloringFunction(targetSelector, styleString){
    try {
        // Normalize inputs (strip wrapping quotes if any)
        const normalizeArg = (v) => String(v == null ? '' : v).trim().replace(/^['"]|['"]$/g, '');
        const sel = normalizeArg(targetSelector);

        // Resolve styles: accept string (CSS style fragment) or object
        const rawStyle = (styleString && typeof styleString === 'object') ? styleString : parseStyleString(normalizeArg(styleString));
        // Drop outline-related props (picker-only visual aid)
        const style = Object.keys(rawStyle || {}).reduce((acc, key) => {
            const normKey = String(key).replace(/[A-Z]/g, m => '-' + m.toLowerCase()).toLowerCase();
            if (normKey === 'outline' || normKey.startsWith('outline-')) return acc;
            acc[key] = rawStyle[key];
            return acc;
        }, {});

        // Convert style object to editor model patch
        const patch = styleToModelPatch(style, null);
        if (!patch) return; // nothing to apply

        if (typeof updateElement !== 'function') return;

        // Decide how to target: selector string, triggering element id, or current selection
        if (sel) {
            updateElement(sel, patch);
        } else {
            const el = (this && this.nodeType === 1) ? this : null;
            const id = el?.dataset?.id;
            if (id) updateElement(id, patch);
            else updateElement(null, patch);
        }
    }
    catch(err){ console.warn('coloringFunction failed', err); }
}





//onclick="coloringFunction('#el-2', 'background:red;')"
//onclick="coloringFunction('[data-id="el-2"]', 'background:red;')"


// Map generic element patch.styles to table cell style keys
function modelPatchToCellStyle(patchStyles){
    if (!patchStyles) return null;
    const s = patchStyles; const out = {};
    if (s.fill) out.bg = s.fill;
    if (s.textColor) out.textColor = s.textColor;
    if (Object.prototype.hasOwnProperty.call(s, 'strokeWidth')) out.borderWidth = s.strokeWidth;
    if (s.strokeColor) out.borderColor = s.strokeColor;
    if (s.fontFamily) out.fontFamily = s.fontFamily;
    if (s.fontSize) out.fontSize = s.fontSize;
    if (Object.prototype.hasOwnProperty.call(s, 'bold')) out.bold = !!s.bold;
    if (Object.prototype.hasOwnProperty.call(s, 'italic')) out.italic = !!s.italic;
    if (Object.prototype.hasOwnProperty.call(s, 'underline')) out.underline = !!s.underline;
    if (s.textAlignH) out.alignH = s.textAlignH;
    if (s.textAlignV) out.alignV = s.textAlignV;
    return out;
}

// Conditional formatting using relative column offsets within the same row
function conditionalFormatByOffset(minColOffset, maxColOffset, styleIfOk, styleIfNok){
    try {
        const normalizeArg = (v) => String(v == null ? '' : v).trim().replace(/^['"]|['"]$/g, '');
        const offMin = parseInt(minColOffset, 10); const offMax = parseInt(maxColOffset, 10);
        const dMin = Number.isFinite(offMin) ? offMin : 0;
        const dMax = Number.isFinite(offMax) ? offMax : 0;

        // Resolve context cell (prefer DOM "this" from inline handler; fallback to active table anchor)
        let tableId = null, r = null, c = null;
        if (this && this.nodeType === 1 && this.classList && this.classList.contains('table-cell')){
            tableId = this.dataset.tableId; r = Number(this.dataset.r); c = Number(this.dataset.c);
        } else if (typeof getActiveTableAnchor === 'function'){
            const a = getActiveTableAnchor(); if (a){ tableId = a.tableId; r = a.r; c = a.c; }
        }
        if (!tableId) return;

        const t = getElementById(tableId); if (!t) return;
        if (typeof mapToAnchorCoords === 'function'){ const mapped = mapToAnchorCoords(t, r, c); r = mapped.r; c = mapped.c; }

        const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
        const cMin = clamp(c + dMin, 0, t.cols - 1);
        const cMax = clamp(c + dMax, 0, t.cols - 1);
        const idMin = t.grid[r]?.[cMin];
        const idMax = t.grid[r]?.[cMax];
        const idSelf = t.grid[r]?.[c];
        if (idMin == null || idMax == null || idSelf == null) return;

        const num = (v) => {
            const raw = String(v ?? '').trim();
            // Keep numbers like "1,234.56" by dropping non-numeric except . - +
            const cleaned = raw.replace(/[^0-9+\-.]/g, '');
            const n = parseFloat(cleaned);
            return Number.isFinite(n) ? n : null;
        };
        const vMin = num(t.cells[idMin]?.content);
        const vMax = num(t.cells[idMax]?.content);
        const vSelf = num(t.cells[idSelf]?.content);
        if (vMin == null || vMax == null || vSelf == null) return;

        const lo = Math.min(vMin, vMax);
        const hi = Math.max(vMin, vMax);
        const isOk = vSelf >= lo && vSelf <= hi;

        // Resolve styles
        const rawOk = styleIfOk && typeof styleIfOk === 'object' ? styleIfOk : parseStyleString(normalizeArg(styleIfOk));
        const rawNok = styleIfNok && typeof styleIfNok === 'object' ? styleIfNok : parseStyleString(normalizeArg(styleIfNok));
        const okPatch = styleToModelPatch(rawOk || {}, null, { target: 'table' });
        const nokPatch = styleToModelPatch(rawNok || {}, null, { target: 'table' });
        const okCell = okPatch ? okPatch.styles : null;
        const nokCell = nokPatch ? nokPatch.styles : null;
        const nextStyle = isOk ? okCell : nokCell;
        if (!nextStyle) return;

        // Apply to the single cell
        const next = JSON.parse(JSON.stringify(t));
        const tgt = next.cells[idSelf];
        tgt.styles = { ...(tgt.styles || {}), ...nextStyle };
        updateElement(next.id, next);
    } catch(err){ console.warn('conditionalFormatByOffset failed', err); }
}

// Example usage on a table cell (inline attribute):
// onclick="conditionalFormatByOffset(-2, -1, 'background:#9ccc65;color:#000', 'background:#ff6b6b;color:#fff')"

