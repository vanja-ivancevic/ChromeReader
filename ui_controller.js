// ui_controller.js (Complete Rewrite with Final Styles v2)
(() => {
    /* console.log("UI Controller script loaded."); */

    const UI_ID = 'venice-tts-reader-ui';
    const UI_STYLE_ID = 'venice-tts-reader-style';
    const CUSTOM_EVENT_NAME = 'veniceReaderExtractedContentEvent'; // Must match content_script.js

    let uiContainer = null; // Main container div
    let playPauseButton = null;
    let timeDisplayElement = null;
    let speedButton = null;
    let styleElement = null;
    let errorMessageElement = null; // Added for error display

    // --- CSS Styles ---
    const newUIStyles = `
        #${UI_ID} {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: royalblue; /* Blue background */
            color: white;
            border-radius: 50px; /* Capsule shape */
            padding: 5px; /* Padding inside capsule */
            display: flex;
            align-items: center;
            gap: 6px; /* Gap between elements */
            font-family: sans-serif;
            font-size: 14px;
            z-index: 2147483647;
            box-shadow: 0 3px 10px rgba(0,0,0,0.3);
            height: 40px; /* Fixed height */
            box-sizing: border-box;
            /* No hover effect on the capsule itself */
        }

        /* Common Button Styles */
        #${UI_ID} button {
            background-color: transparent; /* No background by default */
            color: white; /* White icon/text */
            border: none; /* No border */
            border-radius: 50%; /* Circular */
            width: 30px; /* Button size */
            height: 30px;
            padding: 0;
            margin: 0;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.15s ease-in-out, transform 0.1s ease-out; /* Transition for background and transform */
            flex-shrink: 0;
            position: relative; /* For pseudo-elements */
            overflow: hidden; /* Clip effects */
        }

        /* Hover effect: Faint filled circle */
        #${UI_ID} button:not(:disabled):hover {
            background-color: rgba(255, 255, 255, 0.15); /* Faint white overlay */
        }

        /* Click effect: slightly stronger overlay + scale */
        #${UI_ID} button:not(:disabled):active {
            background-color: rgba(255, 255, 255, 0.25); /* Stronger overlay */
            transform: scale(0.92); /* Shrink slightly */
        }


        #${UI_ID} button:disabled {
             opacity: 0.5; /* Simple disabled state */
             cursor: default;
             background-color: transparent !important; /* Ensure no background effects when disabled */
             transform: scale(1); /* Ensure no scale effect when disabled */
        }

        /* Play/Pause Icon */
        #${UI_ID} #playPauseButton::before,
        #${UI_ID} #playPauseButton.playing::before {
             content: '';
             display: inline-block;
             border: 0;
             background: transparent;
             box-sizing: border-box;
             width: 0;
             height: 10px;
             margin-left: 1px; /* Adjust icon position */
             border-color: transparent transparent transparent white; /* White icon */
             transition: 100ms all ease;
             /* Play state */
             border-style: solid;
             border-width: 5px 0 5px 7px;
        }

        #${UI_ID} #playPauseButton.playing::before {
             /* Pause state */
             border-style: double;
             border-width: 0px 0 0px 7px;
             height: 10px;
             margin-left: 0; /* Adjust icon position */
        }
        /* Disabled icon color handled by parent opacity */

        /* Timer Display */
        #${UI_ID} #timeDisplay {
            padding: 0 6px; /* Adjust padding */
            min-width: 40px; /* Adjust width */
            text-align: center;
            flex-shrink: 0;
            font-variant-numeric: tabular-nums;
            color: white; /* White text */
            cursor: default;
            font-size: 14px;
            line-height: 30px; /* Align with button height */
            position: relative; /* Needed for loader positioning */
            display: inline-flex; /* Align items vertically */
            align-items: center;
            justify-content: center;
        }

        #${UI_ID} #timeDisplay .time-text {
            display: inline-block; /* Default state */
        }

        #${UI_ID} #timeDisplay .loader {
            display: none; /* Hidden by default */
            border: 2px solid rgba(255, 255, 255, 0.2); /* Faint white track */
            border-top: 2px solid white; /* White spinner */
            border-radius: 50%;
            width: 16px; /* Smaller size */
            height: 16px;
            animation: spin 1s linear infinite;
            box-sizing: border-box;
        }

        /* Show loader and hide text when loading */
        #${UI_ID} #timeDisplay.loading .time-text {
            display: none;
        }
        #${UI_ID} #timeDisplay.loading .loader {
            display: block;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Error Message Display */
        #${UI_ID} #errorMessage {
            padding: 0 8px;
            color: #FFCDD2; /* Light red for error text */
            font-weight: 500;
            text-align: center;
            flex-grow: 1; /* Allow error to take space */
            display: none; /* Hidden by default */
            line-height: 30px; /* Align with button height */
            cursor: default;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }

        /* Speed Button */
         #${UI_ID} #speedButton {
             font-size: 11px;
             font-weight: bold;
             color: white; /* White text */
             /* Inherits size, border-radius, etc. from common button style */
         }
    `;

    // --- UI Creation ---
    function createUI() {
        // Prevent duplicate UI creation
        if (document.getElementById(UI_ID)) {
            /* console.log("UI Controller: UI already exists."); */
            if (!uiContainer) uiContainer = document.getElementById(UI_ID);
            // Re-query elements in case they were lost
            if (!playPauseButton) playPauseButton = uiContainer?.querySelector('#playPauseButton');
            if (!timeDisplayElement) timeDisplayElement = uiContainer?.querySelector('#timeDisplay');
            if (!speedButton) speedButton = uiContainer?.querySelector('#speedButton');
            if (!errorMessageElement) errorMessageElement = uiContainer?.querySelector('#errorMessage'); // Query error element
            return;
        }
        /* console.log("UI Controller: Creating UI..."); */

        if (!document.getElementById(UI_STYLE_ID)) {
            styleElement = document.createElement('style');
            styleElement.id = UI_STYLE_ID;
            styleElement.textContent = newUIStyles;
            document.head.appendChild(styleElement);
        } else {
            styleElement = document.getElementById(UI_STYLE_ID);
        }

        uiContainer = document.createElement('div');
        uiContainer.id = UI_ID;

        playPauseButton = document.createElement('button');
        playPauseButton.id = 'playPauseButton';
        playPauseButton.title = 'Play/Pause';
        uiContainer.appendChild(playPauseButton);

        // Container for time/spinner OR error message
        const displayContainer = document.createElement('div');
        displayContainer.style.display = 'flex';
        displayContainer.style.alignItems = 'center';
        displayContainer.style.justifyContent = 'center';
        displayContainer.style.flexGrow = '1'; // Allow this container to take space
        displayContainer.style.minWidth = '50px'; // Ensure some minimum space

        timeDisplayElement = document.createElement('span');
        timeDisplayElement.id = 'timeDisplay';
        timeDisplayElement.innerHTML = '<span class="time-text">-:--</span><div class="loader"></div>';
        displayContainer.appendChild(timeDisplayElement);

        errorMessageElement = document.createElement('span'); // Create error element
        errorMessageElement.id = 'errorMessage';
        errorMessageElement.style.display = 'none'; // Initially hidden
        displayContainer.appendChild(errorMessageElement);

        uiContainer.appendChild(displayContainer); // Add container to main UI

        speedButton = document.createElement('button');
        speedButton.id = 'speedButton';
        speedButton.title = 'Cycle Speed';
        speedButton.textContent = '1x';
        uiContainer.appendChild(speedButton);

        playPauseButton.addEventListener('click', handlePauseResumeClick);
        speedButton.addEventListener('click', handleSpeedCycleClick);

        document.body.appendChild(uiContainer);
        /* console.log("UI Controller: UI injected."); */
    }

    // --- UI Removal ---
    function removeUI() {
        if (uiContainer && uiContainer.parentNode) {
            /* console.log("UI Controller: Removing UI."); */
            uiContainer.parentNode.removeChild(uiContainer);
        }
        if (styleElement && styleElement.parentNode) {
            styleElement.parentNode.removeChild(styleElement);
        }
        uiContainer = null; playPauseButton = null; timeDisplayElement = null; speedButton = null; styleElement = null; errorMessageElement = null; // Clear error element ref
    }

    // --- UI Update ---
    function updateUI(state) {
        if (!uiContainer) {
             /* console.log("UI Controller: UI not found during update, attempting creation."); */
             createUI();
             if (!uiContainer) { console.error("UI Controller: Failed to create or find UI during update."); return; }
        }

        // Ensure elements are selected
        if (!playPauseButton) playPauseButton = uiContainer.querySelector('#playPauseButton');
        if (!timeDisplayElement) timeDisplayElement = uiContainer.querySelector('#timeDisplay');
        if (!speedButton) speedButton = uiContainer.querySelector('#speedButton');
        if (!errorMessageElement) errorMessageElement = uiContainer.querySelector('#errorMessage'); // Get error element

        if (!playPauseButton || !timeDisplayElement || !speedButton || !errorMessageElement) {
             console.error("UI Controller: One or more UI elements missing during update."); return;
        }

        // Check for error state first
        const isError = state.status && state.status.startsWith("Error:");

        if (isError) {
            // Show error message, hide time/spinner
            errorMessageElement.textContent = state.status;
            errorMessageElement.textContent = state.status;
            errorMessageElement.style.display = 'inline';
            timeDisplayElement.style.display = 'none';

            // Disable buttons during API key errors
            playPauseButton.disabled = true;
            speedButton.disabled = true;
            // Force play icon state as nothing can play/pause
            playPauseButton.classList.remove('playing');
            playPauseButton.title = 'Error'; // Update title to reflect state

        } else {
            // Normal operation: Hide error message, show time/spinner
            errorMessageElement.style.display = 'none';
            timeDisplayElement.style.display = 'inline-flex'; // Restore display

            // Check both loading flags from the state
            const isLoadingInitial = state.isLoadingInitialChunk === true;
            const isLoadingResumed = state.isLoadingResumedChunk === true;
            const isLoading = isLoadingInitial || isLoadingResumed;

            // Disable buttons if loading
            playPauseButton.disabled = isLoading || !state.canPause;
            speedButton.disabled = isLoading;

            // Update play/pause icon
            if (state.isPaused) {
                playPauseButton.classList.remove('playing'); playPauseButton.title = 'Play';
            } else {
                playPauseButton.classList.add('playing'); playPauseButton.title = 'Pause';
            }

            // Show spinner or time based on loading state
            const timeTextSpan = timeDisplayElement.querySelector('.time-text');
            if (isLoading) {
                errorMessageElement.style.display = 'none'; // Explicitly hide error when loading
                timeDisplayElement.style.display = 'inline-flex'; // Ensure time display container is visible
                timeDisplayElement.classList.add('loading'); // Show spinner inside
            } else {
                timeDisplayElement.classList.remove('loading'); // Hide spinner
                if (timeTextSpan) {
                    // Only update text content if not loading
                    timeTextSpan.textContent = state.remainingTimeFormatted || "-:--";
                }
            }

            // Update speed button text (only if not error)
            const speedText = (state.currentPlaybackRate || 1.0).toFixed(1);
            speedButton.textContent = `${speedText.endsWith('.0') ? speedText.slice(0, -2) : speedText}x`;
        }
    }

    // --- Event Handlers ---
    function handlePauseResumeClick() {
        if (!playPauseButton || playPauseButton.disabled) return; // Check disabled state again
        /* console.log("UI Controller: Play/Pause clicked."); */
        try { chrome.runtime.sendMessage({ type: 'uiAction', action: 'togglePause' }); }
        catch (error) { console.warn(`UI Controller: Failed to send pause/resume message: ${error.message}`); }
    }

    function handleSpeedCycleClick() {
        if (!speedButton || speedButton.disabled) return;
        /* console.log("UI Controller: Speed Cycle clicked."); */
        try { chrome.runtime.sendMessage({ type: 'uiAction', action: 'cycleSpeed' }); }
        catch (error) { console.warn(`UI Controller: Failed to send cycleSpeed message: ${error.message}`); }
    }

    // --- Message Listeners ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (sender.id !== chrome.runtime.id || sender.tab) { return false; }
        /* console.log("UI Controller received message:", message.type, message.state); */ // Keep for debugging if needed
        if (message.type === 'updateUI') { updateUI(message.state); }
        else if (message.type === 'showUI') { createUI(); if (uiContainer) { updateUI(message.state); } }
        else if (message.type === 'hideUI') { removeUI(); }
        return false; // Synchronous handling
    });

    // Listener for Custom DOM Event (remains unchanged)
    document.addEventListener(CUSTOM_EVENT_NAME, (event) => {
        try {
            if (event.detail?.article) { chrome.runtime.sendMessage({ type: 'extractedContent', article: event.detail.article }); }
            else if (event.detail?.error) { console.error("Extraction error reported from MAIN world:", event.detail.error); chrome.runtime.sendMessage({ type: 'extractionError', error: event.detail.error }); }
        } catch (error) { console.warn(`UI Controller: Failed to send message to background (context likely invalidated): ${error.message}`); removeUI(); }
    });

})();