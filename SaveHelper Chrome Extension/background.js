// Click the toolbar button to trigger a save on the active tab
chrome.action.onClicked.addListener(async (tab) => {
    console.log('[background] toolbar clicked', { tabId: tab?.id, tabTitle: tab?.title });
    if (tab?.id) {
        console.log('[background] sending REQUEST_SAVE to tab', tab.id);
        chrome.tabs.sendMessage(tab.id, { type: "REQUEST_SAVE" });
    }
});

// Relay SAVE_HTML messages from the content script to the native host
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== "SAVE_HTML") return;

    console.log('[background] received SAVE_HTML message from content script', {
        from: sender?.id || sender?.tab?.id || 'unknown',
        fileUrl: msg.fileUrl,
        htmlLength: msg.html ? msg.html.length : 0
    });
  
    const port = chrome.runtime.connectNative("com.your.savehost");
    console.log('[background] connected to native host com.your.savehost', { port });

    port.onMessage.addListener((response) => {
        console.log('[background] native host response', response);
        sendResponse(response); // {ok:true,path:...} or {ok:false,error:...}
        try {
            port.disconnect();
            console.log('[background] port disconnected after response');
        } catch (e) {
            console.warn('[background] error disconnecting port', e);
        }
    });

    port.onDisconnect.addListener(() => {
        console.log('[background] native host port disconnected');
        if (chrome.runtime.lastError) {
            console.error('[background] native host error', chrome.runtime.lastError.message);
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        }
    });

    const payload = { type: "save", fileUrl: msg.fileUrl, html: msg.html };
    console.log('[background] posting message to native host (html trimmed for log)', {
        type: payload.type,
        fileUrl: payload.fileUrl,
        htmlPreview: payload.html ? payload.html.slice(0, 200) : ''
    });
    port.postMessage(payload);
    return true; // keep sendResponse alive for async reply
});



// Test runner: connect to the native messaging host declared in native-host/test.json
// This will call the native host executable (test.py) which prints a message to stdout.
// Usage:
// - Click the extension toolbar button (calls chrome.action.onClicked)
// - Or send a runtime message: chrome.runtime.sendMessage({ type: 'RUN_NATIVE_TEST' })

// const NATIVE_HOST_NAME = 'mytest'; // matches "name" in native-host/test.json

// function runNativeTest() {
// 	console.log('[background] running native test via host', NATIVE_HOST_NAME);

// 	let port;
// 	try {
// 		port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
// 	} catch (err) {
// 		console.error('[background] failed to connect to native host', NATIVE_HOST_NAME, err);
// 		return;
// 	}

// 	port.onMessage.addListener((response) => {
// 		console.log('[background] native host response', response);
// 		try {
// 			port.disconnect();
// 			console.log('[background] port disconnected after response');
// 		} catch (e) {
// 			console.warn('[background] error disconnecting port', e);
// 		}
// 	});

// 	port.onDisconnect.addListener(() => {
// 		console.log('[background] native host port disconnected');
// 		if (chrome.runtime.lastError) {
// 			console.error('[background] native host error', chrome.runtime.lastError.message);
// 		}
// 	});

// 	const payload = { type: 'test' };
// 	console.log('[background] posting test message to native host', payload);
// 	try {
// 		port.postMessage(payload);
// 	} catch (err) {
// 		console.error('[background] error posting message to native host', err);
// 	}
// }

// // Run test when toolbar icon is clicked (if action API is available)
// if (chrome.action && chrome.action.onClicked) {
// 	chrome.action.onClicked.addListener((tab) => {
// 		console.log('[background] toolbar clicked, running native test', { tabId: tab?.id, tabTitle: tab?.title });
// 		runNativeTest();
// 	});
// }

// // Allow other extension parts (or dev console) to trigger the test via runtime message
// chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
// 	if (!msg || msg.type !== 'RUN_NATIVE_TEST') return;
// 	console.log('[background] RUN_NATIVE_TEST received from', sender);
// 	runNativeTest();
// 	sendResponse({ ok: true, message: 'native test started' });
// 	return true; // keep sendResponse alive (not strictly needed here)
// });

