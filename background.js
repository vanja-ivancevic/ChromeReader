// background.js (Corrected Rewrite v5)

// --- Globals ---
let isReading = false;
let isPaused = false;
let contextMenuId = "veniceReadAloudSelection";
let readPageContextMenuId = "veniceReadAloudPage";
let offscreenDocumentPath = 'offscreen.html';
let activeReadingTabId = null;
// API Key is retrieved from storage

// --- State ---
let textChunkQueue = [];
let currentlyPlayingChunkIndex = -1;
let preloadedAudio = {};
let fetchControllers = {};
const MAX_INPUT_LENGTH = 4096;
let currentChunkDuration = 0;
let currentChunkTime = 0;
let isOffscreenPlaying = false;
let chunkDurations = {};
let totalDuration = null;
let chunksProcessedCount = 0;
const ESTIMATED_CHARS_PER_SECOND = 17.5;
const PLAYBACK_RATES = [1.0, 1.25, 1.5, 1.75, 2.0];
let currentPlaybackRateIndex = 0;
let estimatedTotalDuration = null;
let haltedDueToApiKeyError = false; // Flag for API key errors

// --- Text Chunking ---
function chunkText(text) {
    const finalChunks = [];
    let remainingText = text.trim();
    let currentTargetSize = 200;
    const sizeMultiplier = 2.0;

    while (remainingText.length > 0) {
        let splitPoint = -1;
        let actualChunkSize = Math.min(remainingText.length, currentTargetSize);
        const sentenceEndRegex = /[.!?]\s+/g;
        let lastMatchIndex = -1;
        let match;
        while ((match = sentenceEndRegex.exec(remainingText)) !== null) {
            if (match.index + match[0].length <= actualChunkSize) {
                lastMatchIndex = match.index + match[0].length;
            } else {
                break;
            }
        }
        if (lastMatchIndex > 0) {
            splitPoint = lastMatchIndex;
        } else {
            const paragraphBreak = remainingText.indexOf('\n\n');
            if (paragraphBreak !== -1 && paragraphBreak < actualChunkSize) {
                splitPoint = paragraphBreak + 2;
            } else {
                splitPoint = remainingText.lastIndexOf(' ', actualChunkSize);
                if (splitPoint <= 0) {
                    splitPoint = actualChunkSize;
                } else {
                    splitPoint++;
                }
            }
        }
        splitPoint = Math.min(splitPoint, MAX_INPUT_LENGTH, remainingText.length);
        const chunk = remainingText.substring(0, splitPoint).trim();
        if (chunk) finalChunks.push(chunk);
        remainingText = remainingText.substring(splitPoint).trim();
        if (remainingText.length > 0) {
            currentTargetSize = Math.min(MAX_INPUT_LENGTH, Math.floor(currentTargetSize * sizeMultiplier));
        }
    }
    estimatedTotalDuration = finalChunks.reduce((sum, chunk) => sum + (chunk.length / ESTIMATED_CHARS_PER_SECOND), 0);
    // console.log(`Chunked text into ${finalChunks.length} parts. Estimated duration: ~${estimatedTotalDuration.toFixed(1)}s`);
    return finalChunks;
}

// --- Base64 Helper ---
function uint8ArrayToBase64(uint8Array) {
    let binaryString = '';
    uint8Array.forEach(byte => binaryString += String.fromCharCode(byte));
    return btoa(binaryString);
}

// --- Offscreen Document Management ---
async function hasOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL(offscreenDocumentPath);
    try {
        // MV3 requires specifying the exact URL for getContexts
        const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [offscreenUrl] });
        return contexts.length > 0;
    } catch (err) {
        // Ignore errors during context checks, especially "Cannot access a closed context."
        if (err.message && !err.message.includes("closed context")) {
             console.error("Error getting contexts:", err);
        }
        return false;
    }
}

async function setupOffscreenDocument() {
    if (await hasOffscreenDocument()) return;
    try {
        await chrome.offscreen.createDocument({
            url: offscreenDocumentPath,
            reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
            justification: 'Playing TTS audio',
        });
        /* console.log("Offscreen document created."); */
    } catch (error) {
        console.error(`Error creating offscreen document: ${error.message}`);
        if (!error.message.includes("single offscreen document")) throw error;
        console.warn("Attempted to create offscreen document when one likely already existed.");
    }
}

async function closeOffscreenDocument() {
    if (await hasOffscreenDocument()) {
       try { await chrome.offscreen.closeDocument(); /* console.log("Offscreen document closed."); */ }
       catch (error) { console.error("Error closing offscreen document:", error); }
    }
}

async function controlAudioOffscreen(action, data = null) {
    try {
        await setupOffscreenDocument(); // Ensure it exists before sending
        const payload = { type: action };
        if (data !== null && data !== undefined) payload.data = data;
        await chrome.runtime.sendMessage(payload);
    } catch (error) {
        console.error(`Failed to send message '${action}' to offscreen document: ${error.message}`);
        // Re-throw error for caller to handle, especially if critical like play command
        throw error;
    }
}

// --- Time Formatting ---
function formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) return "0:00";
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function calculateTotalElapsedTime() {
    let elapsedTime = 0;
    for (let i = 0; i < currentlyPlayingChunkIndex; i++) {
        elapsedTime += chunkDurations[i] || 0;
    }
    elapsedTime += currentChunkTime || 0;
    return elapsedTime;
}

// --- UI Communication ---
async function sendUiUpdate(state) {
    if (activeReadingTabId === null) return;
    try {
        const elapsed = calculateTotalElapsedTime();
        const currentRate = PLAYBACK_RATES[currentPlaybackRateIndex] || 1.0; // Get current speed, default to 1.0
        let remainingTimeFormatted;
        let remainingSecondsRaw = 0;

        if (totalDuration !== null) {
            remainingSecondsRaw = Math.max(0, totalDuration - elapsed);
            const adjustedRemainingSeconds = remainingSecondsRaw / currentRate;
            remainingTimeFormatted = formatTime(adjustedRemainingSeconds);
        } else if (estimatedTotalDuration !== null) {
            // Assume initial estimate was for 1.0x speed
            remainingSecondsRaw = Math.max(0, estimatedTotalDuration - elapsed);
            const adjustedRemainingSeconds = remainingSecondsRaw / currentRate;
            remainingTimeFormatted = `${formatTime(adjustedRemainingSeconds)}`;
        } else {
            remainingTimeFormatted = "-:--";
        }

        // Add a flag to indicate if we are currently trying the fast resume path
        const isAttemptingFastResume = state.isAttemptingFastResume === true;

        const fullState = {
            status: state.status || '...',
            canPause: state.canPause !== undefined ? state.canPause : false,
            canStop: state.canStop !== undefined ? state.canStop : false,
            isPaused: state.isPaused !== undefined ? state.isPaused : false,
            remainingTimeFormatted: remainingTimeFormatted,
            // Show spinner only if loading initial chunk OR if attempting resume via re-fetch (fallback)
            isLoadingInitialChunk: currentlyPlayingChunkIndex === -1 && fetchControllers[0] !== undefined,
            isLoadingResumedChunk: state.isLoadingResumedChunk === true, // Only true during re-fetch fallback
            isAttemptingFastResume: isAttemptingFastResume, // Pass through fast resume attempt flag
            currentPlaybackRate: PLAYBACK_RATES[currentPlaybackRateIndex]
        };
        await chrome.tabs.sendMessage(activeReadingTabId, { type: 'updateUI', state: fullState });
    } catch (error) {
        console.warn(`Failed to send UI update to tab ${activeReadingTabId}: ${error.message}.`);
    }
}

async function sendUiHide() {
    if (activeReadingTabId === null) return;
    const tabIdToHide = activeReadingTabId; // Store locally in case it changes
    try {
        await chrome.tabs.sendMessage(tabIdToHide, { type: 'hideUI' });
    } catch (error) {
         console.warn(`Failed to send UI hide to tab ${tabIdToHide}: ${error.message}.`);
    }
}

// --- Core Reading Logic ---
async function processNextTextChunk(chunkIndex) {
    if (!isReading || chunkIndex >= textChunkQueue.length || chunkIndex < 0 || fetchControllers[chunkIndex] || preloadedAudio[chunkIndex]) {
        return; // Invalid state or already processed/fetching
    }

    const currentText = textChunkQueue[chunkIndex];
    if (!currentText) { console.warn(`Skipping empty text chunk ${chunkIndex + 1}`); return; }
    /* console.log(`Fetching audio for text chunk ${chunkIndex + 1}/${textChunkQueue.length} (length: ${currentText.length})`); */

    const controller = new AbortController();
    fetchControllers[chunkIndex] = controller;

    try {
        if (chunkIndex === 0 && currentlyPlayingChunkIndex === -1) {
             sendUiUpdate({ status: 'Loading...', canPause: false, canStop: true, isPaused: false });
        }
        // Retrieve API key and voice from storage
        const settings = await chrome.storage.sync.get(['apiKey', 'voice']);
        const apiKey = settings.apiKey;
        const voice = settings.voice || "af_sky"; // Default voice if not set

        if (!apiKey) {
            console.error("API Key not found in storage. Please set it in the extension settings.");
            haltedDueToApiKeyError = true; // Set flag
            // Send error status, explicitly set canPause to false, keep canStop true
            sendUiUpdate({ status: 'Error: API Key Missing', canPause: false, canStop: true, isPaused: false });
            // await stopReading(); // REMOVED - Let fetch fail or user stop
            return; // Exit processing
        }

        const requestBody = { model: "tts-kokoro", input: currentText, voice: voice, response_format: "mp3" };
        const response = await fetch('https://api.venice.ai/api/v1/audio/speech', {
            method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, // Use apiKey from storage
            body: JSON.stringify(requestBody), signal: controller.signal
        });

        if (!response.ok || !response.body) {
            let errorBodyText = await response.text(); let detailedError = 'Unknown API error';
            try { detailedError = JSON.parse(errorBodyText).message || JSON.stringify(JSON.parse(errorBodyText)); } catch (e) { detailedError = errorBodyText || detailedError; }
            console.error(`API Error (${response.status}) for chunk ${chunkIndex + 1}:`, detailedError);
            // Send specific error message for auth failure, keep canStop true
            const errorStatus = response.status === 401 ? 'Error: Invalid API Key' : `Error: API (${response.status})`;
            // Send error status, set flag if auth error, explicitly set canPause to false
            if (response.status === 401) haltedDueToApiKeyError = true; // Set flag only for auth error
            // Send error status, explicitly set canPause to false
            sendUiUpdate({ status: errorStatus, canPause: false, canStop: true, isPaused: false });
            // await stopReading(); // REMOVED - Let fetch fail or user stop
            return; // Exit processing this chunk on API error
        }

        const reader = response.body.getReader(); const chunksArray = []; let totalLength = 0;
        while (true) {
            if (!isReading) { console.log("Reading stopped during audio download."); return; }
            if (isPaused) { console.log("Audio download paused..."); await new Promise(resolve => setTimeout(resolve, 200)); continue; }
            const { done, value } = await reader.read(); if (done) break;
            chunksArray.push(value); totalLength += value.length;
        }
        const completeAudioData = new Uint8Array(totalLength); let offset = 0;
        chunksArray.forEach(chunk => { completeAudioData.set(chunk, offset); offset += chunk.length; });
        /* console.log(`Finished downloading audio for chunk ${chunkIndex + 1}. Length: ${completeAudioData.length}`); */

        const base64AudioData = uint8ArrayToBase64(completeAudioData);
        preloadedAudio[chunkIndex] = base64AudioData;
        /* console.log(`Stored preloaded audio for chunk ${chunkIndex + 1}`); */

        // Auto-play logic
        const shouldAutoPlayFirst = (chunkIndex === 0 && currentlyPlayingChunkIndex === -1);
        const shouldAutoPlayNext = (chunkIndex === currentlyPlayingChunkIndex + 1 && !isOffscreenPlaying && !isPaused);
        // Add condition: Also play if this is the chunk we were trying to resume (chunkIndex matches currentlyPlayingChunkIndex) and we are not paused.
        const shouldAutoPlayResumed = (chunkIndex === currentlyPlayingChunkIndex && !isPaused);
        if (isReading && (shouldAutoPlayFirst || shouldAutoPlayNext || shouldAutoPlayResumed)) {
             /* console.log(`Process complete for chunk ${chunkIndex + 1}, auto-starting playback.`); */
             playChunk(chunkIndex);
        } else {
             /* console.log(`Process complete for chunk ${chunkIndex + 1}, playback will start when needed.`); */
        }
    } catch (err) {
        if (err.name === 'AbortError') { /* console.log(`Fetch for text chunk ${chunkIndex + 1} aborted.`); */ } // Expected, no need to log normally
        else {
            console.error(`Failed to process text chunk ${chunkIndex + 1}:`, err);
            const isFirstChunk = currentlyPlayingChunkIndex === -1 && chunkIndex === 0;
            const isImmediatelyNextChunk = chunkIndex === currentlyPlayingChunkIndex + 1;
            if (isFirstChunk || isImmediatelyNextChunk) {
                sendUiUpdate({ status: `Network/API Error`, canPause: false, canStop: false, isPaused: false });
                await stopReading();
            } else { console.warn(`Preload failed for chunk ${chunkIndex + 1}, playback may continue.`); }
        }
    } finally { /* Controller deleted elsewhere */ }
}

// Modify playChunk to potentially accept a startTime, especially relevant after a resume/re-fetch
async function playChunk(chunkIndex, startTime = 0) {
    if (!isReading || chunkIndex < 0 || chunkIndex >= textChunkQueue.length) {
        /* console.log(`playChunk: Invalid index (${chunkIndex + 1}) or reading stopped.`); */
        if (isReading) await stopReading(); return;
    }
    // If we are resuming this specific chunk after a re-fetch, use the stored resumeTime
    if (startTime === 0 && chunkIndex === currentlyPlayingChunkIndex && currentChunkTime > 0) {
        startTime = currentChunkTime;
        /* console.log(`playChunk: Applying resume time ${startTime.toFixed(2)}s for re-fetched chunk ${chunkIndex + 1}`); */
    }

    const base64AudioData = preloadedAudio[chunkIndex];
    if (!base64AudioData) {
        console.warn(`playChunk: Audio for chunk ${chunkIndex + 1} was not preloaded. Waiting/Fetching...`);
        if (!fetchControllers[chunkIndex]) { /* console.log(`playChunk: Initiating fetch for missing chunk ${chunkIndex + 1}.`); */ processNextTextChunk(chunkIndex); }
        sendUiUpdate({ status: `Loading chunk ${chunkIndex + 1}...`, canPause: true, canStop: true, isPaused: false }); return;
    }

    /* console.log(`Playing preloaded chunk ${chunkIndex + 1}/${textChunkQueue.length}`); */
    currentlyPlayingChunkIndex = chunkIndex; isOffscreenPlaying = true;
    currentChunkDuration = chunkDurations[chunkIndex] || 0;
    // Set currentChunkTime based on startTime ONLY if startTime is provided (i.e., resuming)
    // Otherwise, it's a fresh play of the chunk, so time starts at 0.
    currentChunkTime = startTime > 0 ? startTime : 0;
    // Ensure loading flags are false when playback starts/resumes successfully
    sendUiUpdate({
        status: `Reading chunk ${chunkIndex + 1}/${textChunkQueue.length}...`,
        canPause: true,
        canStop: true,
        isPaused: false,
        isLoadingResumedChunk: false // Explicitly set to false
    });

    // --- Cache current chunk data in session storage ---
    try {
        // Remove previous chunk first (if any)
        const prevChunkIndex = chunkIndex - 1;
        if (prevChunkIndex >= 0) {
            await chrome.storage.session.remove(`cachedAudioChunkData_${prevChunkIndex}`);
            // console.log(`Removed session cache for chunk ${prevChunkIndex + 1}`); // Debug only
        }
        // Store current chunk
        await chrome.storage.session.set({
            [`cachedAudioChunkData_${chunkIndex}`]: base64AudioData,
            'cachedAudioChunkIndex': chunkIndex // Store index being played
        });
        // console.log(`Cached chunk ${chunkIndex + 1} in session storage.`); // Debug only
    } catch (cacheError) {
        console.warn(`Failed to cache chunk ${chunkIndex + 1} in session storage:`, cacheError);
    }
    // --- End Caching ---

    try {
        await controlAudioOffscreen('playAudioDataBase64', {
             base64: base64AudioData,
             index: chunkIndex,
             rate: PLAYBACK_RATES[currentPlaybackRateIndex],
             startTime: startTime // Pass startTime to offscreen
         });
    } catch (error) { console.error(`Failed to send play command for chunk ${chunkIndex + 1}:`, error); await stopReading(); return; }

    delete preloadedAudio[chunkIndex]; delete fetchControllers[chunkIndex];
    const preloadIndex1 = chunkIndex + 1; const preloadIndex2 = chunkIndex + 2;
    if (preloadIndex1 < textChunkQueue.length) processNextTextChunk(preloadIndex1);
    if (preloadIndex2 < textChunkQueue.length) processNextTextChunk(preloadIndex2);
}

async function startReading(fullText, tabId) {
    if (isReading) { await stopReading(); await new Promise(resolve => setTimeout(resolve, 100)); }
    /* console.log(`Initiating CHUNKED reading process for tab ${tabId}...`); */
    isReading = true; isPaused = false; activeReadingTabId = tabId; isOffscreenPlaying = false;
    currentlyPlayingChunkIndex = -1; textChunkQueue = []; preloadedAudio = {}; fetchControllers = {};
    currentChunkDuration = 0; currentChunkTime = 0; chunkDurations = {}; totalDuration = null;
    chunksProcessedCount = 0; estimatedTotalDuration = null;
    haltedDueToApiKeyError = false; // Reset flag

    textChunkQueue = chunkText(fullText);
    if (textChunkQueue.length === 0 || !textChunkQueue[0]) {
        console.log("No text content found to read.");
        sendUiUpdate({ status: 'Error: No content', canPause: false, canStop: false, isPaused: false });
        await stopReading(); return;
    }
    /* console.log(`Prepared text queue with ${textChunkQueue.length} total chunks.`); */
    updateContextMenu("Pause Selection Reading");

    try {
        const results = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: () => !!document.getElementById(UI_ID) });
        if (!results || !results[0] || !results[0].result) {
            // console.log(`Injecting UI controller into tab ${tabId} (startReading)`);
            await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['ui_controller.js'] });
        }
    } catch (err) { console.error(`Failed to inject UI controller in startReading: ${err}`); await stopReading(); return; }

    await setupOffscreenDocument();
    if (textChunkQueue.length > 0) processNextTextChunk(0);
}

async function pauseReading() {
    if (!isReading || isPaused) return;
    /* console.log("Pausing reading..."); */
    isPaused = true; isOffscreenPlaying = false; // Mark as not playing
    updateContextMenu("Resume Selection Reading");
    try { await controlAudioOffscreen('pause'); }
    catch (error) { console.warn("Failed to send pause command to offscreen:", error.message); }
    sendUiUpdate({ status: 'Paused', canPause: true, canStop: true, isPaused: true });
}

// Corrected Resume Logic: Restart current chunk robustly
async function resumeReading() {
    if (!isReading || !isPaused) return;
    /* console.log("Resuming reading..."); */
    isPaused = false; // Set state immediately
    updateContextMenu("Pause Selection Reading");

    const chunkToResume = currentlyPlayingChunkIndex;
    const resumeTime = currentChunkTime || 0;

    // Optimistic UI update - show playing, no spinner yet
    sendUiUpdate({
        status: `Resuming chunk ${chunkToResume + 1}...`,
        canPause: true, canStop: true, isPaused: false,
        isLoadingResumedChunk: false, // Assume fast path or cache will work
        isAttemptingFastResume: true // Indicate we're trying the fast path
    });

    try {
        // --- Try Fast Path: Send simple 'resume' command ---
        /* console.log(`Resume (Fast Path): Sending 'resume' command for chunk ${chunkToResume + 1} at ${resumeTime.toFixed(2)}s.`); */
        await controlAudioOffscreen('resume', { rate: PLAYBACK_RATES[currentPlaybackRateIndex] });
        isOffscreenPlaying = true;
        /* console.log("Resume (Fast Path): Success."); */
        // Update UI to remove 'isAttemptingFastResume' flag
        sendUiUpdate({ status: `Reading chunk ${chunkToResume + 1}/${textChunkQueue.length}...`, canPause: true, canStop: true, isPaused: false, isAttemptingFastResume: false });

    } catch (fastResumeError) {
        // --- Fast Path Failed: Try session cache fallback ---
        console.warn(`Resume (Fast Path) failed: ${fastResumeError.message}. Attempting fallback using session cache.`);
        isOffscreenPlaying = false; // Ensure this is false

        try {
            const cacheKey = `cachedAudioChunkData_${chunkToResume}`;
            const cachedResult = await chrome.storage.session.get([cacheKey, 'cachedAudioChunkIndex']);

            // Check if cache has the correct index AND the data for that index
            if (cachedResult && cachedResult.cachedAudioChunkIndex === chunkToResume && cachedResult[cacheKey]) {
                /* console.log(`Resume (Cache Fallback): Found cached data for chunk ${chunkToResume + 1}. Sending to offscreen.`); */
                const base64AudioData = cachedResult[cacheKey];

                // Ensure offscreen exists before sending potentially large data
                await setupOffscreenDocument();

                await controlAudioOffscreen('playAudioDataBase64', {
                    base64: base64AudioData,
                    index: chunkToResume,
                    rate: PLAYBACK_RATES[currentPlaybackRateIndex],
                    startTime: resumeTime
                });
                isOffscreenPlaying = true;
                // Update UI to remove 'isAttemptingFastResume' flag
                sendUiUpdate({ status: `Reading chunk ${chunkToResume + 1}/${textChunkQueue.length}...`, canPause: true, canStop: true, isPaused: false, isAttemptingFastResume: false });
                /* console.log("Resume (Cache Fallback): Success."); */

            } else {
                // --- Cache Fallback Failed: Re-fetch (show spinner) ---
                console.warn(`Resume (Cache Fallback): Cache miss or index mismatch for chunk ${chunkToResume + 1} (Index needed: ${chunkToResume}, Index found: ${cachedResult?.cachedAudioChunkIndex}). Re-fetching.`);
                // Update UI to show loading spinner ONLY for re-fetch
                 sendUiUpdate({
                     status: `Loading chunk ${chunkToResume + 1}...`,
                     canPause: true, canStop: true, isPaused: false,
                     isLoadingResumedChunk: true, // Show spinner NOW
                     isAttemptingFastResume: false
                 });

                // Clear any existing fetch controller for this chunk
                if (fetchControllers[chunkToResume]) {
                     try { fetchControllers[chunkToResume].abort(); } catch(e){}
                     delete fetchControllers[chunkToResume];
                }
                // Re-fetch. Playback triggered by processNextTextChunk completion.
                await processNextTextChunk(chunkToResume);
            }
        } catch (fallbackError) {
            console.error(`Resume (Fallback Attempt) failed:`, fallbackError);
            // Send error UI state
            sendUiUpdate({ status: 'Error: Resume Failed', canPause: false, canStop: true, isPaused: false, isAttemptingFastResume: false });
            // Don't necessarily stop reading, allow user to try again or stop.
            // await stopReading();
        }
    }
}


async function stopReading(finishedNaturally = false) {
    if (!isReading && !finishedNaturally) return;
    /* console.log("Stopping reading...", finishedNaturally ? "(Finished)" : "(Interrupted)"); */
    const wasReading = isReading;
    isReading = false; isPaused = false; isOffscreenPlaying = false;

    // console.log("Aborting all active fetch controllers...");
    Object.values(fetchControllers).forEach(controller => { try { controller.abort(); } catch(e){} });
    fetchControllers = {};

    textChunkQueue = []; preloadedAudio = {}; currentlyPlayingChunkIndex = -1;
    currentChunkDuration = 0; currentChunkTime = 0; chunkDurations = {};
    totalDuration = null; chunksProcessedCount = 0; estimatedTotalDuration = null;
    // Clear session cache on stop
    chrome.storage.session.clear(() => { /* console.log("Session cache cleared on stop."); */ });
    // console.log("Text queue and preloaded audio cleared.");

    if (await hasOffscreenDocument()) {
        try { await controlAudioOffscreen('stop'); }
        catch (error) { console.warn("Failed to send stop command to offscreen:", error.message); }
    }
    updateContextMenu("Start Reading Selection");
    if (wasReading || activeReadingTabId !== null) await sendUiHide();
    activeReadingTabId = null;
    haltedDueToApiKeyError = false; // Reset flag
    /* console.log("Reading stopped and state reset."); */
}

// --- Context Menu ---
function setupContextMenu() {
    chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) console.warn("Error removing context menus:", chrome.runtime.lastError.message);
        chrome.contextMenus.create({ id: contextMenuId, title: "Start Reading Selection", contexts: ["selection"] });
        chrome.contextMenus.create({ id: readPageContextMenuId, title: "Read this page", contexts: ["page"] });
    });
}
function updateContextMenu(title) {
    chrome.contextMenus.update(contextMenuId, { title: title }, () => {
        if (chrome.runtime.lastError) console.log("Failed to update context menu title:", chrome.runtime.lastError.message);
    });
}

// --- Event Listeners ---
chrome.runtime.onInstalled.addListener((details) => {
    // console.log("Extension installed or updated:", details.reason);
    setupContextMenu();
    chrome.storage.sync.get(['voice'], (settings) => {
        const defaults = {};
        if (settings.voice === undefined) defaults.voice = 'af_sky';
        if (Object.keys(defaults).length > 0) chrome.storage.sync.set(defaults);
    });
    stopReading();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === contextMenuId) {
        if (info.selectionText) {
            const selectedText = info.selectionText.trim();
            if (!selectedText) return;
            if (!isReading || isPaused) await startReading(selectedText, tab.id);
            else await pauseReading();
        }
    } else if (info.menuItemId === readPageContextMenuId) {
        // console.log("Context Menu (Page): Action - Read this page");
        if (isReading) await stopReading();
        await new Promise(resolve => setTimeout(resolve, 100));
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('about:'))) {
            console.warn(`Cannot read restricted URL: ${tab.url}`); return;
        }
        activeReadingTabId = tab.id; isReading = true; isPaused = false;
        try {
            // console.log(`Injecting UI controller into tab ${tab.id}`);
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['ui_controller.js'] });
            if (activeReadingTabId === tab.id) sendUiUpdate({ status: 'Extracting content...', canPause: false, canStop: true, isPaused: false });
            else return;
            // console.log(`Injecting Readability.js into MAIN world for tab ${tab.id}`);
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['node_modules/@mozilla/readability/Readability.js'], world: 'MAIN' });
            // console.log(`Injecting content_script.js into MAIN world for tab ${tab.id}`);
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content_script.js'], world: 'MAIN' });
        } catch (scriptErr) {
            console.error(`Failed to inject scripts for page reading: ${scriptErr}`);
            if (activeReadingTabId === tab.id) sendUiUpdate({ status: `Error injecting scripts`, canPause: false, canStop: false, isPaused: false });
            await stopReading();
        }
    }
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    // --- Offscreen Audio Handling ---
    if (sender.url && sender.url === chrome.runtime.getURL(offscreenDocumentPath)) {
        switch (message.type) {
            case 'audioChunkEnded':
                /* console.log(`Background: Received audioChunkEnded for chunk ${currentlyPlayingChunkIndex + 1}.`); */
                isOffscreenPlaying = false; currentChunkTime = currentChunkDuration;
                const nextChunkIndex = currentlyPlayingChunkIndex + 1;
                if (!isReading) return false;
                if (nextChunkIndex < textChunkQueue.length) {
                    /* console.log(`Audio ended for chunk ${currentlyPlayingChunkIndex + 1}. Attempting to play chunk ${nextChunkIndex + 1}.`); */
                    playChunk(nextChunkIndex);
                } else { /* console.log("All text chunks have finished playing."); */ await stopReading(true); }
                break;
            case 'audioError':
                console.error("Background: Received audioError from offscreen:", message.error);
                isOffscreenPlaying = false; currentChunkDuration = 0; currentChunkTime = 0;
                sendUiUpdate({ status: `Audio Error`, canPause: false, canStop: false, isPaused: false });
                await stopReading(); break;
            case 'audioDurationUpdate':
                 // console.log(`Background: Received duration update from offscreen <audio> element: ${message.duration}`);
                 if (!isNaN(message.duration) && message.duration > 0) currentChunkDuration = message.duration;
                break;
            case 'chunkDurationCalculated':
                const { index, duration } = message;
                if (index !== undefined && index >= 0 && index < textChunkQueue.length && !isNaN(duration) && duration > 0 && chunkDurations[index] === undefined) {
                    // console.log(`Background: Received calculated duration for chunk ${index + 1}: ${duration.toFixed(2)}s`);
                    chunkDurations[index] = duration; chunksProcessedCount++;
                    if (chunksProcessedCount === textChunkQueue.length) {
                        totalDuration = Object.values(chunkDurations).reduce((sum, dur) => sum + dur, 0);
                        // console.log(`All chunks processed. Total calculated duration: ${totalDuration.toFixed(2)}s`);
                        if (isReading) sendUiUpdate({ status: `Reading chunk ${currentlyPlayingChunkIndex + 1}/${textChunkQueue.length}...`, canPause: true, canStop: true, isPaused: isPaused });
                    }
                } else { console.warn(`Background: Received invalid or duplicate chunk duration data:`, message); }
                break;
            case 'audioTimeUpdate':
                if (!isNaN(message.currentTime)) {
                    currentChunkTime = message.currentTime;
                    sendUiUpdate({ status: `Reading chunk ${currentlyPlayingChunkIndex + 1}/${textChunkQueue.length}...`, canPause: true, canStop: true, isPaused: isPaused });
                } break;
        } return false;
    }
    // --- UI Action Handling ---
    else if (message.type === 'uiAction' && sender.tab) {
        if (sender.tab.id === activeReadingTabId) {
            if (message.action === 'togglePause') { if (isPaused) await resumeReading(); else await pauseReading(); }
            else if (message.action === 'stop') { await stopReading(); }
            else if (message.action === 'cycleSpeed') {
                if (!isReading) return false;
                currentPlaybackRateIndex = (currentPlaybackRateIndex + 1) % PLAYBACK_RATES.length;
                const newRate = PLAYBACK_RATES[currentPlaybackRateIndex];
                // console.log(`BACKGROUND: Cycling speed to ${newRate}x.`);
                if (isOffscreenPlaying) { // Only send if actively playing
                     try {
                          // console.log(`BACKGROUND: Sending setPlaybackRate(${newRate}) to offscreen.`);
                          await controlAudioOffscreen('setPlaybackRate', newRate);
                     }
                     catch (error) { console.warn("Failed to send setPlaybackRate command:", error.message); }
                } else { /* console.log(`BACKGROUND: Audio not playing, rate ${newRate}x will be applied on next play/resume.`); */ }
                sendUiUpdate({ status: `Reading chunk ${currentlyPlayingChunkIndex + 1}/${textChunkQueue.length}...`, canPause: true, canStop: true, isPaused: isPaused });
            }
        } else { console.warn("Ignoring UI action from non-active tab:", sender.tab.id); }
        return false;
    }
    // --- Content Extraction Handling ---
    else if (message.type === 'extractedContent' && sender.tab) {
        if (sender.tab.id === activeReadingTabId) {
            // console.log(`Received extracted content from active tab ${activeReadingTabId}. Starting TTS.`);
            await startReading(message.article.textContent, sender.tab.id);
        } else { console.warn(`Ignoring extracted content from non-active tab: ${sender.tab.id} (expected ${activeReadingTabId})`); }
        return false;
    } else if (message.type === 'extractionError' && sender.tab) {
         if (sender.tab.id === activeReadingTabId) {
            console.error(`Received extraction error from active tab ${activeReadingTabId}:`, message.error);
            sendUiUpdate({ status: `Extraction Error`, canPause: false, canStop: false, isPaused: false });
            await stopReading();
        } else if (message.type === 'settingsUpdated') {
             // console.log("Background received settingsUpdated message.");
             // Check if we were reading and halted due to an API key error
             if (isReading && haltedDueToApiKeyError) {
                 // console.log("Retrying reading process after API key update...");
                 haltedDueToApiKeyError = false; // Reset flag
                 const chunkToRetry = currentlyPlayingChunkIndex >= 0 ? currentlyPlayingChunkIndex : 0;
                 // Send a loading state immediately before retrying the fetch
                 // Send a loading state, ensuring no error status is present
                 sendUiUpdate({
                     status: `Retrying chunk ${chunkToRetry + 1}...`, // Normal status message
                     canPause: false,
                     canStop: true,
                     isPaused: false,
                     isLoadingResumedChunk: true, // Show spinner
                     isAttemptingFastResume: false // Clear this flag too
                 });
                 // Attempt to process the chunk that failed (or the first one if error was on initial load)
                 processNextTextChunk(chunkToRetry);
             }
        } else { console.warn(`Ignoring extraction error from non-active tab: ${sender.tab.id} (expected ${activeReadingTabId})`); }
        return false;
    }
    return false; // Ignore other messages
});

/* console.log("Background Service Worker started."); */
