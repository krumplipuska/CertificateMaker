function gatherHtml() {
    return document.documentElement.outerHTML;

}

async function requestSave() {
    const html = gatherHtml();
   
    const fileUrl = location.href; // e.g., file:///C:/path/combined.html
    try {
        const res = await chrome.runtime.sendMessage({ type: "SAVE_HTML", fileUrl, html });
        if (res?.ok) {
            console.log("Saved:", res.path);
            showToast("Saved");
        } else {
            console.error("Save failed:", res?.error);
            showToast("Save failed");
        }
    } catch (e) {
        console.error("Save error:", e);
        showToast("Save error");
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
