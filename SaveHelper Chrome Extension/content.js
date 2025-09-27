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
