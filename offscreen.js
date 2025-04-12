const CUSTOM_EVENT_NAME = 'veniceReaderExtractedContentEvent'; // Must match content_script.js/ui_controller.js

// --- Web Audio API Setup ---
let audioContext;
let currentSourceNode = null; // To keep track of the currently playing source

// Function to initialize AudioContext (must be done after user interaction or message)
function initializeAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log("Offscreen: AudioContext initialized.");
        } catch (e) {
            console.error("Offscreen: Error initializing AudioContext:", e);
            chrome.runtime.sendMessage({ type: 'audioError', error: 'Could not create AudioContext' });
        }
    }
    return audioContext;
}

// Keep reference to the <audio> element, though primarily using Web Audio API now
const audio = document.getElementById('tts-audio');

// Function to stop the current Web Audio source, if playing
function stopCurrentSource() {
    if (currentSourceNode) {
        try {
            currentSourceNode.onended = null; // Remove listener to prevent sending 'ended' on manual stop
            currentSourceNode.stop();
            console.log("Offscreen: Stopped current Web Audio source.");
        } catch (e) {
            console.warn("Offscreen: Error stopping source node (might be already stopped):", e.message);
        }
        currentSourceNode = null;
    }
} // Fixed syntax error: removed stray });


// --- Message Listener (from Background) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Offscreen received message:", message);
    // Basic check: Ignore messages not from the background script (if possible/needed)
    // Note: Checking sender.id is usually sufficient for messages within the same extension
    if (sender.id !== chrome.runtime.id) {
         console.warn("Offscreen: Ignoring message from unexpected sender:", sender);
         return;
    }

    switch (message.type) {
        case 'playAudioDataBase64':
            stopCurrentSource(); // Stop previous playback
            const context = initializeAudioContext();
            if (!context) break;

            const base64Data = message.data;
            if (base64Data && typeof base64Data === 'string') {
                console.log(`Offscreen: Received playAudioDataBase64 command (Base64 length: ${base64Data.length})`);
                try {
                    // Decode Base64 string back to binary string
                    const binaryString = atob(base64Data);
                    // Convert binary string to ArrayBuffer
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const arrayBuffer = bytes.buffer;
                    console.log(`Offscreen: Decoded Base64 to ArrayBuffer (length: ${arrayBuffer.byteLength})`);

                    console.log("Offscreen: Decoding audio data...");
                    context.decodeAudioData(arrayBuffer)
                        .then(decodedBuffer => {
                            console.log("Offscreen: Audio data decoded successfully.");
                            if (!audioContext) {
                               console.warn("Offscreen: AudioContext lost before playback could start.");
                               return;
                            }
                            currentSourceNode = context.createBufferSource();
                            currentSourceNode.buffer = decodedBuffer;
                            currentSourceNode.connect(context.destination);

                            currentSourceNode.onended = () => {
                                console.log("Offscreen: Web Audio source node 'onended' event fired.");
                                if (currentSourceNode) {
                                    chrome.runtime.sendMessage({ type: 'audioChunkEnded' });
                                    currentSourceNode = null;
                                }
                            };

                            console.log("Offscreen: Starting Web Audio playback...");
                            currentSourceNode.start(0);
                        })
                        .catch(err => {
                            console.error("Offscreen: decodeAudioData failed:", err);
                            chrome.runtime.sendMessage({ type: 'audioError', error: `Audio decode failed: ${err.message}` });
                            currentSourceNode = null;
                        });

                } catch (e) {
                    console.error("Offscreen: Error decoding Base64 or processing audio:", e);
                    chrome.runtime.sendMessage({ type: 'audioError', error: `Base64 decode/processing failed: ${e.message}` });
                }
            } else {
                console.error("Offscreen: playAudioDataBase64 command received without valid Base64 string data.");
                chrome.runtime.sendMessage({ type: 'audioError', error: 'No valid Base64 data provided' });
            }
            break;
        // --- Web Audio API Pause/Resume ---
        case 'pause':
             // Pause using Web Audio API by suspending the context.
             if (audioContext && audioContext.state === 'running') {
                 audioContext.suspend().then(() => console.log("Offscreen: AudioContext suspended."));
             } else {
                 console.log("Offscreen: Pause command received but context not running or not initialized.");
             }
             // Note: This pauses EVERYTHING using the context. Playback position isn't saved easily.
            break;
        case 'resume':
             // Resume the context
             if (audioContext && audioContext.state === 'suspended') {
                 audioContext.resume().then(() => console.log("Offscreen: AudioContext resumed."));
             } else {
                  console.log("Offscreen: Resume command received but context not suspended or not initialized.");
             }
            break;
        // --- End Web Audio API Pause/Resume ---
        case 'stop':
            console.log('Offscreen: Received stop command.');
            stopCurrentSource();
            // Also ensure context is running if it was suspended
             if (audioContext && audioContext.state === 'suspended') {
                 audioContext.resume().then(() => console.log("Offscreen: AudioContext resumed after stop."));
             }
            break;

        case 'settingsUpdated':
            // Simply log this message without warning - it's an expected message type
            console.log("Offscreen: Received settingsUpdated message (ignoring).");
            break;

        default:
            // Silently ignore message types not relevant to the offscreen document
            // console.log("Offscreen: Ignoring message type:", message.type); // Optional: uncomment for debugging
            break;
    }
     // Indicate that the message was handled synchronously (no need for 'return true;')
});

console.log("Offscreen script loaded and ready.");
// Initial state sanity check
audio.removeAttribute('src');
audio.currentTime = 0;

function handlePauseResumeClick() {
    console.log("Pause/Resume button clicked.");
    try {
        chrome.runtime.sendMessage({ type: 'uiAction', action: 'togglePause' });
    } catch (error) {
        console.error("Failed to send pause/resume message:", error);
    }
}

function handleStopClick() {
    console.log("Stop button clicked.");
    try {
        chrome.runtime.sendMessage({ type: 'uiAction', action: 'stop' });
    } catch (error) {
        console.error("Failed to send stop message:", error);
    }
}

// Listener for Custom DOM Event from MAIN world script
document.addEventListener(CUSTOM_EVENT_NAME, (event) => {
    console.log("UI Controller received custom DOM event:", event.detail);
    if (event.detail?.article) {
        try {
            chrome.runtime.sendMessage({ type: 'extractedContent', article: event.detail.article });
        } catch (error) {
            console.error("Failed to send extracted content message:", error);
        }
    } else if (event.detail?.error) {
        console.error("Extraction error reported from MAIN world:", event.detail.error);
        try {
            chrome.runtime.sendMessage({ type: 'extractionError', error: event.detail.error });
        } catch (error) {
            console.error("Failed to send extraction error message:", error);
        }
    }
});