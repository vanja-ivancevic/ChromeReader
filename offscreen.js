// offscreen.js (Corrected Rewrite v3)

const CUSTOM_EVENT_NAME = 'veniceReaderExtractedContentEvent'; // Must match content_script.js/ui_controller.js

// --- Audio Setup ---
const audio = document.getElementById('tts-audio'); // HTML Audio element for playback
let currentObjectUrl = null; // To manage Blob URLs
let currentPlaybackRate = 1.0; // Store the desired rate locally
let audioContext = null; // AudioContext for duration calculation

// Function to safely revoke a Blob URL
function revokeCurrentUrl() {
    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
    }
}

// Initialize AudioContext lazily
function getAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            /* console.log("Offscreen: AudioContext initialized for duration calculation."); */
        } catch (e) {
            console.error("Offscreen: Error initializing AudioContext:", e);
        }
    }
    return audioContext;
}

// --- Audio Element Event Listeners ---
// Store startTime globally in offscreen context when received
let pendingStartTime = 0;

audio.addEventListener('loadedmetadata', () => {
    /* console.log(`Offscreen: Audio metadata loaded. Duration: ${audio.duration}`); */
    if (!isNaN(audio.duration) && audio.duration > 0) {
        chrome.runtime.sendMessage({ type: 'audioDurationUpdate', duration: audio.duration });

        // If there's a pending start time, apply it now that metadata is loaded
        if (pendingStartTime > 0 && pendingStartTime < audio.duration) {
            /* console.log(`Offscreen: Applying pending start time: ${pendingStartTime.toFixed(2)}s`); */
            audio.currentTime = pendingStartTime;
            pendingStartTime = 0; // Reset pending time
        }
    }
});

audio.addEventListener('timeupdate', () => {
    // Ensure playback rate is correct on every update (belt-and-suspenders)
    if (audio.playbackRate !== currentPlaybackRate) {
        audio.playbackRate = currentPlaybackRate;
    }
    if (!isNaN(audio.currentTime) && !isNaN(audio.duration) && audio.duration > 0) {
        chrome.runtime.sendMessage({ type: 'audioTimeUpdate', currentTime: audio.currentTime, duration: audio.duration });
    }
});

audio.addEventListener('ended', () => {
    /* console.log("Offscreen: Audio element 'ended' event fired."); */
    chrome.runtime.sendMessage({ type: 'audioChunkEnded' });
    revokeCurrentUrl(); // Clean up URL when finished
});

audio.addEventListener('error', (e) => {
    console.error("Offscreen: Audio element error:", audio.error);
    chrome.runtime.sendMessage({ type: 'audioError', error: audio.error?.message || 'Unknown audio element error' });
    revokeCurrentUrl(); // Clean up URL on error
});

audio.addEventListener('pause', () => {
    /* console.log("Offscreen: Audio element 'pause' event fired."); */
});

audio.addEventListener('play', () => {
    /* console.log("Offscreen: Audio element 'play' event fired."); */
});


// --- Message Listener (from Background) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    /* console.log("Offscreen received message:", message.type); */ // Keep for debugging
    if (sender.id !== chrome.runtime.id) {
         console.warn("Offscreen: Ignoring message from unexpected sender:", sender);
         return false; // Indicate synchronous handling
    }

    switch (message.type) {
        case 'playAudioDataBase64':
            revokeCurrentUrl();
            audio.pause();
            audio.removeAttribute('src'); // Ensure clean state
            pendingStartTime = 0; // Reset pending start time for new chunk

            // Destructure data, including optional startTime
            const { base64: base64Data, index: chunkIndex, rate: requestedRate, startTime = 0 } = message.data || {};
            // Store the requested start time if it's greater than 0
            if (startTime > 0) {
                 pendingStartTime = startTime;
                 /* console.log(`Offscreen: Received play command for chunk ${chunkIndex + 1} with start time: ${startTime.toFixed(2)}s`); */
            } else {
                 /* console.log(`Offscreen: Received play command for chunk ${chunkIndex + 1} (start from beginning)`); */
            }

            if (base64Data && typeof base64Data === 'string' && chunkIndex !== undefined) {
                /* console.log(`Offscreen: Received playAudioDataBase64 for chunk ${chunkIndex + 1} (Rate: ${requestedRate || 'default'})`); */
                try {
                    // Decode Base64 to ArrayBuffer
                    const binaryString = atob(base64Data);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
                    const arrayBuffer = bytes.buffer;

                    // --- Calculate Duration ---
                    const context = getAudioContext();
                    if (context) {
                        context.decodeAudioData(arrayBuffer.slice(0)) // Use slice() for safety
                            .then(decodedBuffer => {
                                const duration = decodedBuffer.duration;
                                /* console.log(`Offscreen: Calculated duration for chunk ${chunkIndex + 1}: ${duration.toFixed(2)}s`); */
                                chrome.runtime.sendMessage({ type: 'chunkDurationCalculated', index: chunkIndex, duration: duration });
                            })
                            .catch(err => { console.error(`Offscreen: decodeAudioData failed for chunk ${chunkIndex + 1}:`, err); });
                    } else { console.warn(`Offscreen: Cannot calculate duration for chunk ${chunkIndex + 1} - AudioContext unavailable.`); }
                    // --- End Duration Calculation ---

                    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
                    currentObjectUrl = URL.createObjectURL(blob);

                    // Store and apply the rate received with the play command
                    currentPlaybackRate = typeof requestedRate === 'number' && requestedRate > 0 ? requestedRate : 1.0;
                    audio.playbackRate = currentPlaybackRate;
                    /* console.log(`OFFSCREEN: Applied playbackRate ${audio.playbackRate}x before loading chunk ${chunkIndex + 1}.`); */

                    audio.src = currentObjectUrl;
                    audio.load(); // Load the new source

                    // Play is initiated here, currentTime will be applied in 'loadedmetadata' listener if needed
                    audio.play()
                         .then(() => {
                              // Log includes the actual start time after potential seeking
                              /* console.log(`Offscreen: Play promise resolved for chunk ${chunkIndex + 1}. Current time: ${audio.currentTime.toFixed(2)}s. Applying rate: ${currentPlaybackRate}x`); */
                              if (audio.playbackRate !== currentPlaybackRate) { audio.playbackRate = currentPlaybackRate; } // Ensure rate
                         })
                         .catch(e => {
                              // Check if the error is the specific interruption error
                              if (e.name === 'AbortError' || (e.message && e.message.includes('interrupted by a call to pause'))) {
                                   console.warn(`Offscreen: Audio play() interrupted (likely by pause): ${e.message}`);
                                   // Don't send an error message back for this specific case, as pause was likely intended.
                              } else {
                                   console.error("Offscreen: Audio play() failed:", e);
                                   chrome.runtime.sendMessage({ type: 'audioError', error: `Audio play failed: ${e.message || e.name}` });
                                   revokeCurrentUrl(); // Clean up only on actual errors
                              }
                         });
                } catch (e) {
                    console.error("Offscreen: Error decoding Base64 or processing audio:", e);
                    chrome.runtime.sendMessage({ type: 'audioError', error: `Audio processing failed: ${e.message}` });
                    revokeCurrentUrl();
                }
            } else {
                console.error("Offscreen: playAudioDataBase64 received without valid data.");
                chrome.runtime.sendMessage({ type: 'audioError', error: 'No valid data for playback' });
            }
            break;

        case 'setPlaybackRate':
             const newRate = message.data;
             if (typeof newRate === 'number' && newRate > 0) {
                 /* console.log(`OFFSCREEN: Received setPlaybackRate command. New rate: ${newRate}`); */
                 currentPlaybackRate = newRate; // Store the new rate
                 if (audio.src && !audio.paused) { // Apply immediately only if playing
                      audio.playbackRate = currentPlaybackRate;
                      /* console.log(`OFFSCREEN: Applied playback rate ${currentPlaybackRate}x`); */
                 } else {
                      /* console.log(`OFFSCREEN: Stored playback rate ${currentPlaybackRate}x (will apply on play/resume)`); */
                 }
             } else { console.warn(`Offscreen: Invalid playback rate received: ${newRate}`); }
             break;

        case 'pause':
            if (!audio.paused) { audio.pause(); /* console.log("Offscreen: Paused audio element."); */ }
            else { /* console.log("Offscreen: Pause command received but audio already paused."); */ }
            break;
case 'resume': // Restore simple resume handler for the fast path
    const resumeData = message.data || {};
    const resumeRate = typeof resumeData.rate === 'number' && resumeData.rate > 0 ? resumeData.rate : currentPlaybackRate;

    if (audio.paused && audio.src) {
         currentPlaybackRate = resumeRate; // Update stored rate
         audio.playbackRate = currentPlaybackRate; // Apply rate *before* playing
         /* console.log(`Offscreen: Resuming play (fast path). Applying rate: ${currentPlaybackRate}x. Current time: ${audio.currentTime.toFixed(2)}s`); */
         audio.play()
              .catch(e => { // Keep error handling for interruptions
                   if (e.name === 'AbortError' || (e.message && e.message.includes('interrupted by a call to pause'))) {
                        console.warn(`Offscreen: Audio resume (play) interrupted (likely by pause): ${e.message}`);
                   } else {
                        console.error("Offscreen: Audio resume (play) failed:", e);
                        // Send error back so background knows fast path failed
                        chrome.runtime.sendMessage({ type: 'audioError', error: `Audio resume failed: ${e.message || e.name}` });
                   }
              });
    } else {
         /* console.log(`Offscreen: Resume command received but audio not paused or no source. Paused: ${audio.paused}, Src: ${!!audio.src}`); */
         // If resume command received but no src, send error back so background can trigger fallback
         if (!audio.src) {
              chrome.runtime.sendMessage({ type: 'audioError', error: 'Resume failed: No audio source in offscreen document.' });
         }
    }
    break;
        case 'stop':
            /* console.log('Offscreen: Received stop command.'); */
            revokeCurrentUrl(); audio.pause(); audio.removeAttribute('src'); audio.load();
            /* console.log("Offscreen: Stopped audio element and revoked URL."); */
            break;

        default: break; // Ignore unknown messages
    }
     return false; // Indicate synchronous handling
});

/* console.log("Offscreen script loaded and ready."); */
audio.removeAttribute('src');
audio.currentTime = 0;