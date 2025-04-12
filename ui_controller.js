(() => {
    // console.log("UI Controller script loaded."); // Reduce noise

    const UI_ID = 'venice-tts-reader-ui';
    const CUSTOM_EVENT_NAME = 'veniceReaderExtractedContentEvent'; // Must match content_script.js
    let uiElement = null;
    // let statusElement = null; // Removed
    let playPauseButton = null;
    let closeButton = null;
    let spinnerElement = null;

    // --- Styling Constants ---
    const colors = {
        playBg: 'rgba(255, 193, 7, 0.6)', // Yellowish for Play/Ready
        playBorder: 'rgba(255, 193, 7, 0.8)',
        pauseBg: 'rgba(40, 167, 69, 0.6)', // Greenish for Paused
        pauseBorder: 'rgba(40, 167, 69, 0.8)',
        closeBg: 'rgba(220, 53, 69, 0.6)', // Reddish
        closeBorder: 'rgba(220, 53, 69, 0.8)',
        textColor: '#f1f1f1',
        containerBg: 'rgba(40, 40, 40, 0.9)',
    };

    // --- UI Creation ---
    function createUI() {
        if (document.getElementById(UI_ID)) return; // Already exists

        uiElement = document.createElement('div');
        uiElement.id = UI_ID;
        // Container Styling
        uiElement.style.position = 'fixed';
        uiElement.style.bottom = '20px';
        uiElement.style.right = '20px';
        uiElement.style.padding = '10px 15px';
        uiElement.style.paddingTop = '25px'; // Extra top padding for close button
        uiElement.style.backgroundColor = colors.containerBg;
        uiElement.style.color = colors.textColor;
        uiElement.style.borderRadius = '12px';
        uiElement.style.zIndex = '2147483647';
        uiElement.style.fontFamily = '"Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';
        uiElement.style.fontSize = '13px';
        uiElement.style.display = 'flex';
        uiElement.style.flexDirection = 'column'; // Vertical layout
        uiElement.style.alignItems = 'center';
        uiElement.style.gap = '10px'; // Gap between elements
        uiElement.style.boxShadow = '0 5px 15px rgba(0,0,0,0.4)';
        uiElement.style.minWidth = '50px'; // Can be smaller without text
        uiElement.style.textAlign = 'center';

        // Status Text Removed

        // Spinner (CSS based, initially hidden)
        spinnerElement = document.createElement('div');
        spinnerElement.style.border = '4px solid rgba(241, 241, 241, 0.3)';
        spinnerElement.style.borderTop = '4px solid #f1f1f1';
        spinnerElement.style.borderRadius = '50%';
        spinnerElement.style.width = '28px';
        spinnerElement.style.height = '28px';
        spinnerElement.style.animation = 'spin 1s linear infinite';
        spinnerElement.style.display = 'none';
        spinnerElement.style.margin = '4px 0'; // Match button height roughly
        uiElement.appendChild(spinnerElement);

        // Add keyframes for the spin animation if not already added
        if (!document.getElementById('venice-tts-spinner-style')) {
            const styleSheet = document.createElement("style");
            styleSheet.id = 'venice-tts-spinner-style';
            styleSheet.type = "text/css";
            styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
            document.head.appendChild(styleSheet);
        }

        // Play/Pause Button (initially hidden, shown when not loading)
        playPauseButton = document.createElement('button');
        playPauseButton.textContent = '▶'; // Start with Play icon
        playPauseButton.title = 'Play/Pause';
        playPauseButton.style.display = 'none'; // Initially hidden
        // Styling
        playPauseButton.style.background = colors.playBg; // Start yellow
        playPauseButton.style.border = `1px solid ${colors.playBorder}`;
        playPauseButton.style.color = colors.textColor;
        playPauseButton.style.fontSize = '18px';
        playPauseButton.style.cursor = 'pointer';
        playPauseButton.style.padding = '0';
        playPauseButton.style.margin = '0';
        playPauseButton.style.borderRadius = '50%';
        playPauseButton.style.width = '36px';
        playPauseButton.style.height = '36px';
        playPauseButton.style.display = 'flex';
        playPauseButton.style.alignItems = 'center';
        playPauseButton.style.justifyContent = 'center';
        playPauseButton.style.transition = 'transform 0.08s ease-out, background-color 0.2s ease, border-color 0.2s ease';
        playPauseButton.style.opacity = '0.9';
        // Interaction styles
        playPauseButton.addEventListener('mouseover', () => playPauseButton.style.opacity = '1');
        playPauseButton.addEventListener('mouseout', () => { playPauseButton.style.opacity = '0.9'; playPauseButton.style.transform = 'scale(1)'; });
        playPauseButton.addEventListener('mousedown', () => playPauseButton.style.transform = 'scale(0.92)');
        playPauseButton.addEventListener('mouseup', () => playPauseButton.style.transform = 'scale(1)');
        playPauseButton.addEventListener('mouseleave', () => playPauseButton.style.transform = 'scale(1)');
        // Click Action
        playPauseButton.addEventListener('click', handlePauseResumeClick);
        uiElement.appendChild(playPauseButton);

        // Close Button
        closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.title = 'Close Reader';
        // Styling
        closeButton.style.position = 'absolute';
        closeButton.style.top = '4px';
        closeButton.style.right = '4px';
        closeButton.style.background = colors.closeBg;
        closeButton.style.border = `1px solid ${colors.closeBorder}`;
        closeButton.style.color = colors.textColor;
        closeButton.style.fontSize = '16px'; // Adjusted size
        closeButton.style.fontWeight = 'bold';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '0';
        closeButton.style.margin = '0';
        closeButton.style.borderRadius = '50%';
        closeButton.style.width = '20px';
        closeButton.style.height = '20px';
        // Use flexbox to center '×'
        closeButton.style.display = 'flex';
        closeButton.style.alignItems = 'center';
        closeButton.style.justifyContent = 'center';
        closeButton.style.transition = 'transform 0.08s ease-out';
        closeButton.style.opacity = '0.8';
        // Interaction styles
        closeButton.addEventListener('mouseover', () => closeButton.style.opacity = '1');
        closeButton.addEventListener('mouseout', () => { closeButton.style.opacity = '0.8'; closeButton.style.transform = 'scale(1)'; });
        closeButton.addEventListener('mousedown', () => closeButton.style.transform = 'scale(0.90)');
        closeButton.addEventListener('mouseup', () => closeButton.style.transform = 'scale(1)');
        closeButton.addEventListener('mouseleave', () => closeButton.style.transform = 'scale(1)');
        // Click Action
        closeButton.addEventListener('click', handleCloseClick);
        uiElement.appendChild(closeButton);

        document.body.appendChild(uiElement);
        // console.log("Reader UI injected."); // Reduce noise
    }

    // --- UI Removal ---
    function removeUI() {
        if (uiElement && uiElement.parentNode) {
            uiElement.parentNode.removeChild(uiElement);
            uiElement = null;
            // statusElement = null; // Removed
            playPauseButton = null;
            closeButton = null;
            spinnerElement = null;
            // console.log("Reader UI removed."); // Reduce noise
        }
        // Clean up spinner animation style
        const styleSheet = document.getElementById('venice-tts-spinner-style');
        if (styleSheet) {
            styleSheet.parentNode.removeChild(styleSheet);
        }
    }

    // --- UI Update ---
    function updateUI(state) {
        if (!uiElement) {
            createUI(); // Create if doesn't exist
        }
        // console.log("Updating UI state:", state); // Reduce noise

        // Determine loading state
        const isLoadingInitial = state.status?.startsWith('Initializing') || state.status?.startsWith('Connecting') || state.status?.startsWith('Extracting') || state.status?.includes('Fetching chunk 1') || state.status?.includes('Loading chunk 1');

        // Status text element removed

        if (spinnerElement) {
            spinnerElement.style.display = isLoadingInitial ? 'inline-block' : 'none';
        }

        if (playPauseButton) {
            playPauseButton.style.display = isLoadingInitial ? 'none' : 'flex'; // Hide button when spinner shows
            if (!isLoadingInitial) {
                playPauseButton.textContent = state.isPaused ? '▶' : '❚❚'; // Play / Pause icons
                playPauseButton.title = state.isPaused ? 'Resume' : 'Play'; // Adjusted tooltip
                // Update background color based on state (Swapped colors)
                if (state.isPaused) { // Paused state = Yellow
                    playPauseButton.style.background = colors.playBg; // Use playBg (Yellow) when paused
                    playPauseButton.style.borderColor = colors.playBorder;
                } else { // Playing state = Green
                    playPauseButton.style.background = colors.pauseBg; // Use pauseBg (Green) when playing
                    playPauseButton.style.borderColor = colors.pauseBorder;
                }
                playPauseButton.disabled = !state.canPause;
                playPauseButton.style.cursor = state.canPause ? 'pointer' : 'default';
                playPauseButton.style.opacity = state.canPause ? '0.9' : '0.5';
            }
        }
    }

    // --- Event Handlers ---
    function handlePauseResumeClick() {
        if (!playPauseButton || playPauseButton.disabled) return;
        try {
            chrome.runtime.sendMessage({ type: 'uiAction', action: 'togglePause' });
        } catch (error) {
            console.warn(`UI Controller: Failed to send pause/resume message (context likely invalidated): ${error.message}`);
        }
    }

    function handleCloseClick() {
        try {
            chrome.runtime.sendMessage({ type: 'uiAction', action: 'stop' });
        } catch (error) {
             console.warn(`UI Controller: Failed to send stop message on close (context likely invalidated): ${error.message}`);
             removeUI();
        }
    }

    // --- Message Listeners ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (sender.id !== chrome.runtime.id || sender.tab) {
             return;
        }
        if (message.type === 'updateUI') {
            updateUI(message.state);
        } else if (message.type === 'showUI') {
             createUI();
             updateUI(message.state);
        } else if (message.type === 'hideUI') {
            removeUI();
        }
    });

    // Listener for Custom DOM Event from MAIN world script (for content extraction)
    document.addEventListener(CUSTOM_EVENT_NAME, (event) => {
        try {
            if (event.detail?.article) {
                chrome.runtime.sendMessage({ type: 'extractedContent', article: event.detail.article });
            } else if (event.detail?.error) {
                console.error("Extraction error reported from MAIN world:", event.detail.error);
                chrome.runtime.sendMessage({ type: 'extractionError', error: event.detail.error });
            }
        } catch (error) {
            console.warn(`UI Controller: Failed to send message to background (context likely invalidated): ${error.message}`);
        }
    });

})();