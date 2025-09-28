// Bridge helper events so the page can react to extension-driven saves
function sendStart() {
    try { document.dispatchEvent(new CustomEvent("cm-save-start")); } catch {}
}
function sendDone(ok, err) {
    try {
        const type = ok ? "cm-save-done" : "cm-save-error";
        const detail = err ? { error: String(err) } : undefined;
        document.dispatchEvent(new CustomEvent(type, { detail }));
    } catch {}
}

function gatherHtml() {
    return document.documentElement.outerHTML;
}

// Allow page scripts to explicitly request a save without synthesizing a key event
document.addEventListener("cm-request-save", () => { requestSave(); });

// Allow the page to request a file rename (without reload). We keep an override
// URL so subsequent saves go to the renamed path, even if the address bar did
// not change.
let __cmOverrideFileUrl = null;
let __cmRenameInFlight = false;
document.addEventListener("cm-request-rename", async (e) => {
    if (__cmRenameInFlight) return; // drop duplicates
    const newBaseName = String(e?.detail?.newBaseName || "").trim();
    if (!newBaseName) return;
    try {
        __cmRenameInFlight = true;
        const currentUrl = __cmOverrideFileUrl || location.href;
        const res = await chrome.runtime.sendMessage({ type: "RENAME_FILE", fileUrl: currentUrl, newBaseName });
        if (res?.ok) {
            console.log("Renamed:", res);
            __cmOverrideFileUrl = res.newFileUrl || res.fileUrl || __cmOverrideFileUrl;
            // Ask background for current zoom so we can restore it after navigation
            let zoomBefore = null;
            try {
                const zRes = await chrome.runtime.sendMessage({ type: 'GET_SAVED_ZOOM' });
                if (zRes?.ok && typeof zRes.zoom === 'number') zoomBefore = zRes.zoom;
            } catch {}
            // Update visible URL without a full reload when possible; otherwise navigate
            let navigated = false;
            try {
                if (location.protocol === 'file:' && __cmOverrideFileUrl?.startsWith('file://')) {
                    history.replaceState(null, "", __cmOverrideFileUrl);
                } else {
                    window.location.href = __cmOverrideFileUrl;
                    navigated = true;
                }
            } catch {
                window.location.href = __cmOverrideFileUrl;
                navigated = true;
            }
            // After navigation completes, ask background to apply the saved zoom back
            if (navigated && typeof zoomBefore === 'number') {
                window.addEventListener('pageshow', async () => {
                    try { await chrome.runtime.sendMessage({ type: 'APPLY_ZOOM', zoom: zoomBefore }); } catch {}
                }, { once: true });
            } else if (typeof zoomBefore === 'number') {
                try { await chrome.runtime.sendMessage({ type: 'APPLY_ZOOM', zoom: zoomBefore }); } catch {}
            }
            document.dispatchEvent(new CustomEvent("cm-rename-done", { detail: { newFileUrl: __cmOverrideFileUrl } }));
        } else {
            document.dispatchEvent(new CustomEvent("cm-rename-error", { detail: { error: res?.error || "Rename failed" } }));
        }
    } catch (err) {
        document.dispatchEvent(new CustomEvent("cm-rename-error", { detail: { error: err?.message || String(err) } }));
    } finally {
        __cmRenameInFlight = false;
    }
});

async function requestSave() {
    const html = gatherHtml();
    const fileUrl = location.href; // e.g., file:///C:/path/combined.html
    try {
        sendStart();
        const res = await chrome.runtime.sendMessage({ type: "SAVE_HTML", fileUrl, html });
        if (res?.ok) {
            console.log("Saved:", res.path);
            sendDone(true);
        } else {
            console.error("Save failed:", res?.error);
            sendDone(false, res?.error);
        }
    } catch (e) {
        console.error("Save error:", e);
        sendDone(false, e?.message || e);
    }
}

// Optional: intercept Ctrl/Cmd+S
document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        requestSave();
    }
});

// Allow toolbar click -> background -> here
chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "REQUEST_SAVE") requestSave();
});

// Tiny visual feedback
function showToast(text) {
    try {
        const t = document.createElement("div");
        t.textContent = text;
        Object.assign(t.style, {
            position: "fixed", right: "12px", bottom: "12px",
            padding: "8px 12px", background: "#222", color: "#fff",
            borderRadius: "8px", font: "13px/1.2 system-ui", zIndex: 2e9, opacity: "0.95"
        });
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 1200);
    } catch { }
}
