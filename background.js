// --- Globals ---
let currentAudio = null; // Reference to the offscreen audio controller
let isReading = false;
let isPaused = false; // Differentiate between stopped and paused
let contextMenuId = "veniceReadAloudSelection"; // Renamed for clarity
let readPageContextMenuId = "veniceReadAloudPage";
let offscreenDocumentPath = 'offscreen.html';
let activeReadingTabId = null; // ID of the tab where reading is active and UI is shown
const VENICE_API_KEY = "LNRBov4RrgLbmDCLQY-ZT3HoWeBu7ULLXu7p-6g7Qp"; // Hardcoded API Key

// --- Text Chunking & Preloading State ---
let textChunkQueue = []; // Queue of text chunks to be processed (index 0 is potentially a small intro)
let currentlyPlayingChunkIndex = -1; // Index of the text chunk currently playing audio
let preloadedAudio = {}; // Dictionary to store { chunkIndex: base64AudioData }
let fetchControllers = {}; // Dictionary to store { chunkIndex: AbortController }
const MAX_INPUT_LENGTH = 4096; // API Limit

// Function to chunk text for the API.
// Can optionally return only a small intro chunk and the remaining text.
function chunkText(text, getIntroOnly = false, introCharTarget = 250) { // Reduced intro target
    const chunks = [];
    const paragraphs = text.split(/\n\s*\n/); // Split by paragraphs

    for (const paragraph of paragraphs) {
        const trimmedParagraph = paragraph.trim();
        if (!trimmedParagraph) continue;

        if (trimmedParagraph.length <= MAX_INPUT_LENGTH) {
            chunks.push(trimmedParagraph);
        } else {
            // Paragraph is too long, split by sentences (simple split by .)
            let currentChunk = '';
            // Improved sentence splitting regex (handles more cases)
            const sentences = trimmedParagraph.match(/[^.!?]+(?:[.!?](?!['"]?\s|$)[^.!?]*)*[.!?]?['"]?(?=\s|$)/g) || [trimmedParagraph];

            for (const sentence of sentences) {
                const trimmedSentence = sentence.trim();
                if (!trimmedSentence) continue;

                if (currentChunk.length + trimmedSentence.length + 1 <= MAX_INPUT_LENGTH) { // +1 for potential space
                    currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
                } else {
                    if (currentChunk) chunks.push(currentChunk);
                    // Handle sentence itself being too long
                    if (trimmedSentence.length <= MAX_INPUT_LENGTH) {
                        currentChunk = trimmedSentence;
                    } else {
                        // Split very long "sentence" by character limit
                        for (let i = 0; i < trimmedSentence.length; i += MAX_INPUT_LENGTH) {
                            chunks.push(trimmedSentence.substring(i, i + MAX_INPUT_LENGTH));
                        }
                        currentChunk = '';
                    }
                }
            }
            if (currentChunk) chunks.push(currentChunk);
        }
    }

    const finalChunks = chunks.filter(chunk => chunk.length > 0);

    if (getIntroOnly && finalChunks.length > 0) {
        let introChunk = '';
        let remainingFirstChunk = '';
        const firstChunk = finalChunks[0];
        let restOfChunks = finalChunks.slice(1);

        // Aim for ~3-5 sentences or the char target for the intro
        let sentenceCount = 0;
        let splitPoint = 0;
        const introSentences = firstChunk.match(/[^.!?]+(?:[.!?](?!['"]?\s|$)[^.!?]*)*[.!?]?['"]?(?=\s|$)/g) || [firstChunk];

        for (const sentence of introSentences) {
             const potentialLength = splitPoint + sentence.length + (splitPoint > 0 ? 1 : 0); // +1 for space
             if (potentialLength <= introCharTarget * 1.2 && sentenceCount < 5) { // Allow slightly over target for full sentences
                 splitPoint = potentialLength;
                 sentenceCount++;
             } else {
                 break; // Stop if next sentence exceeds target or count
             }
        }

        // If we didn't get any full sentences or it's still too short, use char target
        if (splitPoint === 0 || splitPoint < introCharTarget * 0.5) {
             splitPoint = firstChunk.lastIndexOf(' ', introCharTarget);
             if (splitPoint <= 0) splitPoint = Math.min(introCharTarget, firstChunk.length);
        }
         // Ensure splitPoint doesn't exceed length
        splitPoint = Math.min(splitPoint, firstChunk.length);

        introChunk = firstChunk.substring(0, splitPoint).trim();
        remainingFirstChunk = firstChunk.substring(splitPoint).trim();

        // Construct the final queue
        const resultQueue = [introChunk];
        if (remainingFirstChunk) {
            resultQueue.push(remainingFirstChunk);
        }
        resultQueue.push(...restOfChunks);

        console.log(`Created intro chunk (length: ${introChunk.length}). Total chunks now: ${resultQueue.length}`);
        return resultQueue;

    } else {
         console.log(`Chunked text into ${finalChunks.length} parts (no intro split).`);
         return finalChunks;
    }
}


// Helper function to convert Uint8Array to Base64 string
function uint8ArrayToBase64(uint8Array) {
    let binaryString = '';
    for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binaryString);
}

// Function to safely open options page with fallbacks
async function safelyOpenOptionsPage() {
    try {
        const manifest = chrome.runtime.getManifest();
        if (!manifest.options_page && !manifest.options_ui) {
            console.warn("No options page defined in manifest");
            return false;
        }
        await chrome.runtime.openOptionsPage();
        return true;
    } catch (e) {
        console.error("Failed to open options page:", e);
        try {
            await chrome.action.openPopup();
            return true;
        } catch (popupError) {
            console.error("Failed to open popup:", popupError);
            return false;
        }
    }
}

// --- Offscreen Document Management ---
async function hasOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL(offscreenDocumentPath);
    const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    }).catch(err => { console.error("Error getting contexts:", err); return []; });
    return contexts.length > 0;
}

async function setupOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(offscreenDocumentPath)],
    }).catch(err => { console.error("Error getting contexts:", err); return []; });

    if (existingContexts.length > 0) {
        return;
    }

    try {
        if (!(await hasOffscreenDocument())) {
            await chrome.offscreen.createDocument({
                url: offscreenDocumentPath,
                reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
                justification: 'Playing TTS audio',
            });
            console.log("Offscreen document created.");
        }
    } catch (error) {
        console.error(`Error creating offscreen document: ${error.message}`);
        if (!error.message.includes("single offscreen document")) {
           throw error;
        } else {
            console.warn("Attempted to create offscreen document when one likely already existed or was being created.");
        }
    }
}

async function closeOffscreenDocument() {
    if (await hasOffscreenDocument()) {
       try {
          await chrome.offscreen.closeDocument();
          console.log("Offscreen document closed.");
       } catch (error) {
           console.error("Error closing offscreen document:", error);
       }
    }
}

// Send message to offscreen document to control audio
async function controlAudioOffscreen(action, data = null) {
    try {
        await setupOffscreenDocument();
        const payload = { type: action };
        if (data !== null && data !== undefined) payload.data = data;
        await chrome.runtime.sendMessage(payload);
    } catch (error) {
        console.error(`Failed to send message '${action}' to offscreen document: ${error.message}`);
        await stopReading();
    }
}

// --- UI Communication ---
async function sendUiUpdate(state) {
    if (activeReadingTabId !== null) {
        try {
            const fullState = {
                status: state.status || '...',
                canPause: state.canPause !== undefined ? state.canPause : false,
                canStop: state.canStop !== undefined ? state.canStop : false,
                isPaused: state.isPaused !== undefined ? state.isPaused : false,
            };
            await chrome.tabs.sendMessage(activeReadingTabId, { type: 'updateUI', state: fullState });
        } catch (error) {
            // Log error but DO NOT clear activeReadingTabId or stop reading here
            console.warn(`Failed to send UI update to tab ${activeReadingTabId}: ${error.message}. Tab might be closed or script not injected.`);
        }
    }
}

async function sendUiHide() {
    if (activeReadingTabId !== null) {
        const tabIdToHide = activeReadingTabId;
        // Don't clear activeReadingTabId here, only when stopReading is called
        try {
            await chrome.tabs.sendMessage(tabIdToHide, { type: 'hideUI' });
        } catch (error) {
             console.warn(`Failed to send UI hide to tab ${tabIdToHide}: ${error.message}. Tab might be closed or script not injected.`);
        }
    }
}

// --- Core Reading Logic ---

// Fetches and processes audio for a specific text chunk index
async function processNextTextChunk(chunkIndex) {
    if (!isReading || chunkIndex >= textChunkQueue.length || chunkIndex < 0) {
        return;
    }
    if (preloadedAudio[chunkIndex] || fetchControllers[chunkIndex]) {
        return;
    }

    const currentText = textChunkQueue[chunkIndex];
    console.log(`Fetching audio for text chunk ${chunkIndex + 1}/${textChunkQueue.length} (length: ${currentText.length})`);

    const controller = new AbortController();
    fetchControllers[chunkIndex] = controller;

    try {
        const settings = await chrome.storage.sync.get(['voice', 'speed']);

        if (!currentText) {
             console.warn(`Skipping empty text chunk ${chunkIndex + 1}`);
             delete fetchControllers[chunkIndex];
             return;
        }

        // Update UI only if fetching the chunk we are about to play or the one right after
        if (chunkIndex === currentlyPlayingChunkIndex + 1 || (currentlyPlayingChunkIndex === -1 && chunkIndex === 0)) {
             const statusMsg = `Fetching chunk ${chunkIndex + 1}/${textChunkQueue.length}...`;
             sendUiUpdate({ status: statusMsg, canPause: true, canStop: true, isPaused: false });
        }

        const requestBody = {
            model: "tts-kokoro",
            input: currentText,
            voice: settings.voice || "af_sky",
            response_format: "mp3",
            speed: settings.speed || 1.0,
            // streaming: false // Implicitly false
        };

        const response = await fetch('https://api.venice.ai/api/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${VENICE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });

        if (!response.ok || !response.body) {
            let errorBodyText = await response.text();
            let detailedError = 'Unknown API error';
            try {
                const parsedError = JSON.parse(errorBodyText);
                detailedError = parsedError.message || parsedError.detail || parsedError.error || JSON.stringify(parsedError);
            } catch (e) { detailedError = errorBodyText || detailedError; }
            console.error(`API Error (${response.status}) for chunk ${chunkIndex + 1}:`, detailedError);
            sendUiUpdate({ status: `API Error (${response.status}): ${detailedError}`, canPause: false, canStop: false, isPaused: false });
            await stopReading();
            return;
        }

        // Process the complete audio stream
        const reader = response.body.getReader();
        const chunks = [];
        let totalLength = 0;
        while (true) {
            if (!isReading) { console.log("Reading stopped during audio download."); return; }
            if (isPaused) { console.log("Audio download paused..."); await new Promise(resolve => setTimeout(resolve, 200)); continue; }

            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            totalLength += value.length;
        }

        const completeAudioData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            completeAudioData.set(chunk, offset);
            offset += chunk.length;
        }

        console.log(`Finished downloading audio for chunk ${chunkIndex + 1}. Length: ${completeAudioData.length}`);
        const base64AudioData = uint8ArrayToBase64(completeAudioData);
        preloadedAudio[chunkIndex] = base64AudioData;
        console.log(`Stored preloaded audio for chunk ${chunkIndex + 1}`);

        // If this is the first chunk (intro), start playback immediately
        if (isReading && chunkIndex === 0 && currentlyPlayingChunkIndex === -1) {
            console.log("Intro chunk downloaded, starting playback.");
            playChunk(0);
        }
        // If this chunk finished preloading while another was playing,
        // check if it's the one we are waiting for to start next.
        else if (isReading && chunkIndex === currentlyPlayingChunkIndex + 1 && !isOffscreenPlaying) {
             console.log(`Preload finished for chunk ${chunkIndex + 1}, which is next. Starting playback.`);
             playChunk(chunkIndex);
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log(`Fetch for text chunk ${chunkIndex + 1} aborted.`);
        } else {
            console.error(`Failed to process text chunk ${chunkIndex + 1}:`, err);
            // Only stop reading entirely if the error was for the *next* required chunk
            const isFirstChunk = currentlyPlayingChunkIndex === -1 && chunkIndex === 0;
            const isImmediatelyNextChunk = chunkIndex === currentlyPlayingChunkIndex + 1;
            if (isFirstChunk || isImmediatelyNextChunk) {
                sendUiUpdate({ status: `API/Network Error: ${err.message}`, canPause: false, canStop: false, isPaused: false });
                await stopReading(); // Stop everything if the essential chunk failed
            } else {
                 // If it was just a preload error for a later chunk, log it but don't stop playback
                 console.warn(`Preload failed for chunk ${chunkIndex + 1}, playback may continue if other chunks are ready.`);
            }
        }
    } finally {
         delete fetchControllers[chunkIndex];
    }
}

// Plays a specific chunk using preloaded data
async function playChunk(chunkIndex) {
    if (!isReading || chunkIndex < 0 || chunkIndex >= textChunkQueue.length) {
        console.log(`playChunk: Invalid index (${chunkIndex + 1}) or reading stopped.`);
        if (isReading) await stopReading();
        return;
    }

    const base64AudioData = preloadedAudio[chunkIndex];

    if (base64AudioData) {
        console.log(`Playing preloaded chunk ${chunkIndex + 1}/${textChunkQueue.length}`);
        currentlyPlayingChunkIndex = chunkIndex;
        isOffscreenPlaying = true;

        const statusMsg = `Reading chunk ${chunkIndex + 1}/${textChunkQueue.length}...`;
        sendUiUpdate({ status: statusMsg, canPause: true, canStop: true, isPaused: false });

        await controlAudioOffscreen('playAudioDataBase64', base64AudioData);

        delete preloadedAudio[chunkIndex]; // Remove played chunk

        // --- Initiate preload ---
        // If chunk 0 (intro) just started playing, preload chunks 1 (remainder) and 2 (next original)
        if (chunkIndex === 0) {
            if (textChunkQueue.length > 1) {
                console.log("Initiating preload for chunk 2 (remainder/first full).");
                processNextTextChunk(1);
            }
            if (textChunkQueue.length > 2) {
                console.log("Initiating preload for chunk 3 (second full).");
                processNextTextChunk(2);
            }
        }
        // Otherwise (if chunk > 0 started playing), preload chunk N+2
        else {
             const preloadIndex = chunkIndex + 2;
             if (preloadIndex < textChunkQueue.length) {
                 console.log(`Initiating preload for chunk ${preloadIndex + 1}.`);
                 processNextTextChunk(preloadIndex);
             }
        }

    } else {
        console.warn(`playChunk: Audio for chunk ${chunkIndex + 1} was not preloaded yet. Waiting...`);
        sendUiUpdate({ status: `Loading chunk ${chunkIndex + 1}...`, canPause: true, canStop: true, isPaused: false });
        // Playback will start automatically when its processNextTextChunk completes
    }
}

async function startReading(fullText, tabId) {
    if (isReading) {
        await stopReading();
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Initiating CHUNKED reading process for tab ${tabId}...`);

    // --- Reset State ---
    isReading = true;
    isPaused = false;
    activeReadingTabId = tabId;
    isOffscreenPlaying = false;
    currentlyPlayingChunkIndex = -1;
    textChunkQueue = [];
    preloadedAudio = {};
    fetchControllers = {};
    // --- End Reset State ---

    // Get intro chunk and remaining chunks
    textChunkQueue = chunkText(fullText, true); // Get intro + rest

    if (textChunkQueue.length === 0 || !textChunkQueue[0]) { // Check if intro exists
        console.log("No text content found to read.");
        sendUiUpdate({ status: 'Error: No content found to read.', canPause: false, canStop: false, isPaused: false });
        await stopReading();
        return;
    }
    console.log(`Prepared text queue with ${textChunkQueue.length} total chunks (including intro).`);

    updateContextMenu("Pause Selection Reading");

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => !!document.getElementById('venice-tts-reader-ui'),
        });
        if (!results || !results[0] || !results[0].result) {
            console.log(`Injecting UI controller into tab ${tabId} (startReading)`);
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['ui_controller.js']
            });
        }
    } catch (err) {
        console.error(`Failed to inject UI controller in startReading: ${err}`);
        await stopReading();
        return;
    }

    // Ensure offscreen document exists before starting fetches
    await setupOffscreenDocument();

    // Initiate fetching ONLY for the intro chunk (index 0).
    // Preloading of chunks 1 and 2 happens when intro starts playing (in playChunk).
    if (textChunkQueue.length > 0) {
        processNextTextChunk(0); // Fetch intro chunk
    }
}


async function pauseReading() {
    if (!isReading || isPaused) return;
    console.log("Pausing reading...");
    isPaused = true;
    // Abort active fetches? No, let them complete for preloading.
    await controlAudioOffscreen('pause'); // Pause playback context
    updateContextMenu("Resume Selection Reading");
    sendUiUpdate({ status: 'Paused', canPause: true, canStop: true, isPaused: true });
}

async function resumeReading() {
    if (!isReading || !isPaused) return;
    console.log("Resuming reading...");
    isPaused = false;
    updateContextMenu("Pause Selection Reading");
    sendUiUpdate({ status: 'Reading...', canPause: true, canStop: true, isPaused: false });

    // If offscreen was playing (context suspended), resume it
    if (isOffscreenPlaying) {
        console.log("Resuming: Offscreen was playing, sending resume command.");
        await controlAudioOffscreen('resume');
    } else {
        // If audio finished while paused, or wasn't started yet, try to play the *next* chunk.
        const nextChunkToPlay = currentlyPlayingChunkIndex + 1;
        console.log(`Resuming: Offscreen wasn't playing. Attempting to play chunk ${nextChunkToPlay + 1}.`);
        playChunk(nextChunkToPlay); // This will play if preloaded, or wait if not
    }
}

async function stopReading(finishedNaturally = false) {
    if (!isReading && !finishedNaturally) return;

    console.log("Stopping reading...", finishedNaturally ? "(Finished)" : "(Interrupted)");

    const wasReading = isReading;
    isReading = false;
    isPaused = false;

    console.log("Aborting all active fetch controllers...");
    for (const index in fetchControllers) {
        fetchControllers[index].abort();
    }
    fetchControllers = {};

    textChunkQueue = [];
    preloadedAudio = {};
    currentlyPlayingChunkIndex = -1;
    console.log("Text queue and preloaded audio cleared.");

    isOffscreenPlaying = false;
    if (await hasOffscreenDocument()) {
        await controlAudioOffscreen('stop');
    }

    updateContextMenu("Start Reading Selection");

    if (wasReading || activeReadingTabId !== null) {
        await sendUiHide(); // This now only sends message, doesn't clear activeReadingTabId
    }
    activeReadingTabId = null; // Clear active tab ID *after* potentially sending hide message
    console.log("Reading stopped and state reset.");
}

// --- Context Menu ---
function setupContextMenu() {
    chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) console.warn("Error removing context menus:", chrome.runtime.lastError.message);
        chrome.contextMenus.create({ id: contextMenuId, title: "Start Reading Selection", contexts: ["selection"] },
            () => { if (chrome.runtime.lastError) console.warn("Error creating selection menu:", chrome.runtime.lastError.message); }
        );
        chrome.contextMenus.create({ id: readPageContextMenuId, title: "Read this page", contexts: ["page"] },
            () => { if (chrome.runtime.lastError) console.warn("Error creating page menu:", chrome.runtime.lastError.message); }
        );
    });
}

function updateContextMenu(title) {
    chrome.contextMenus.update(contextMenuId, { title: title }, () => {
        if (chrome.runtime.lastError) console.log("Failed to update context menu title:", chrome.runtime.lastError.message);
    });
}

chrome.runtime.onInstalled.addListener((details) => {
    console.log("Extension installed or updated:", details.reason);
    setupContextMenu();
    chrome.storage.sync.get(['voice', 'speed'], (settings) => {
        const defaults = {};
        if (settings.voice === undefined) defaults.voice = 'af_sky';
        if (settings.speed === undefined) defaults.speed = 1.0;
        if (Object.keys(defaults).length > 0) {
            chrome.storage.sync.set(defaults, () => console.log("Default settings applied:", defaults));
        }
    });
    stopReading();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === contextMenuId) {
        if (info.selectionText) {
            const selectedText = info.selectionText.trim();
            if (!selectedText) return;
            if (!isReading || isPaused) { // Start new reading if not reading or paused
                await startReading(selectedText, tab.id);
            } else { // Pause if currently reading
                await pauseReading();
            }
        }
    } else if (info.menuItemId === readPageContextMenuId) {
        console.log("Context Menu (Page): Action - Read this page");
        if (isReading) await stopReading();
        await new Promise(resolve => setTimeout(resolve, 100));

        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('about:'))) {
            console.warn(`Cannot read restricted URL: ${tab.url}`);
            return;
        }

        activeReadingTabId = tab.id;
        isReading = true;
        isPaused = false;

        try {
            console.log(`Injecting UI controller into tab ${tab.id}`);
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['ui_controller.js'] });
            if (activeReadingTabId === tab.id) {
                sendUiUpdate({ status: 'Extracting content...', canPause: false, canStop: true, isPaused: false });
            } else { return; } // Tab changed

            console.log(`Injecting Readability.js into MAIN world for tab ${tab.id}`);
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['node_modules/@mozilla/readability/Readability.js'], world: 'MAIN' });

            console.log(`Injecting content_script.js into MAIN world for tab ${tab.id}`);
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content_script.js'], world: 'MAIN' });
            // Wait for 'extractedContent' or 'extractionError' message
        } catch (scriptErr) {
            console.error(`Failed to inject scripts for page reading: ${scriptErr}`);
            if (activeReadingTabId === tab.id) {
                sendUiUpdate({ status: `Error: Failed to prepare page reading (${scriptErr.message})`, canPause: false, canStop: false, isPaused: false });
            }
            await stopReading();
        }
    }
});

// --- Message Listener (Combined sources) ---
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    // console.log("Background received message:", message, "from:", sender); // Reduce noise

    // --- Offscreen Audio Handling ---
    if (sender.url && sender.url === chrome.runtime.getURL(offscreenDocumentPath)) {
        if (message.type === 'audioChunkEnded') {
            console.log(`Background: Received audioChunkEnded for chunk ${currentlyPlayingChunkIndex + 1}.`);
            isOffscreenPlaying = false;
            const nextChunkIndex = currentlyPlayingChunkIndex + 1;

            if (!isReading) { return false; }

            if (nextChunkIndex < textChunkQueue.length) {
                // Only try to play the next chunk. Preloading is handled elsewhere.
                console.log(`Audio ended for chunk ${currentlyPlayingChunkIndex + 1}. Attempting to play chunk ${nextChunkIndex + 1}.`);
                playChunk(nextChunkIndex);
            } else {
                // This was the last chunk
                console.log("All text chunks have finished playing.");
                await stopReading(true);
            }
        } else if (message.type === 'audioError') {
            console.error("Background: Received audioError from offscreen:", message.error);
            isOffscreenPlaying = false; // Mark offscreen as idle even on error
            sendUiUpdate({ status: `Audio Error: ${message.error}`, canPause: false, canStop: false, isPaused: false });
            await stopReading();
        }
        return false;
    }

    // --- UI Action Handling ---
    if (message.type === 'uiAction' && sender.tab) {
        if (sender.tab.id === activeReadingTabId) {
            // console.log(`UI Action from active tab ${sender.tab.id}:`, message.action); // Reduce noise
            if (message.action === 'togglePause') {
                if (isPaused) await resumeReading(); else await pauseReading();
            } else if (message.action === 'stop') {
                await stopReading();
            }
        } else {
            console.warn("Ignoring UI action from non-active tab:", sender.tab.id);
        }
        return false;
    }

    // --- Content Extraction Handling ---
    if (message.type === 'extractedContent' && sender.tab) {
        if (sender.tab.id === activeReadingTabId) {
            console.log(`Received extracted content from active tab ${activeReadingTabId}. Starting TTS.`);
            await startReading(message.article.textContent, sender.tab.id);
        } else {
            console.warn(`Ignoring extracted content from non-active tab: ${sender.tab.id} (expected ${activeReadingTabId})`);
        }
        return false;
    }
    if (message.type === 'extractionError' && sender.tab) {
         if (sender.tab.id === activeReadingTabId) {
            console.error(`Received extraction error from active tab ${activeReadingTabId}:`, message.error);
            sendUiUpdate({ status: `Extraction Error: ${message.error}`, canPause: false, canStop: false, isPaused: false });
            await stopReading();
        } else {
             console.warn(`Ignoring extraction error from non-active tab: ${sender.tab.id} (expected ${activeReadingTabId})`);
        }
        return false;
    }

    // --- Settings Update Handling ---
    if (message.type === 'settingsUpdated' && !sender.tab) {
        console.log("Background received settings update notification from popup.");
        return false;
    }

    return false; // Default to synchronous handling
});

console.log("Background Service Worker started.");
