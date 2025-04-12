document.addEventListener('DOMContentLoaded', () => {
    // API Key input removed
    const voiceSelect = document.getElementById('voice');
    const speedSlider = document.getElementById('speed');
    const speedValueSpan = document.getElementById('speedValue');
    const saveButton = document.getElementById('saveButton');
    const statusDiv = document.getElementById('status');

    // --- Constants ---
    const voices = [
        "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jadzia", "af_jessica",
        "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
        "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael",
        "am_onyx", "am_puck", "am_santa", "bf_alice", "bf_emma", "bf_lily",
        "bm_daniel", "bm_fable", "bm_george", "bm_lewis", "ef_dora", "em_alex",
        "em_santa", "ff_siwis", "hf_alpha", "hf_beta", "hm_omega", "hm_psi",
        "if_sara", "im_nicola", "jf_alpha", "jf_gongitsune", "jf_nezumi",
        "jf_tebukuro", "jm_kumo", "pf_dora", "pm_alex", "pm_santa", "zf_xiaobei",
        "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi", "zm_yunjian", "zm_yunxi",
        "zm_yunxia", "zm_yunyang"
    ];

    const speedMap = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5]; // Maps slider index to speed value

    // --- Populate Voices ---
    function populateVoices() {
        voiceSelect.innerHTML = ''; // Clear loading message
        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice;
            option.textContent = voice;
            voiceSelect.appendChild(option);
        });
    }

    // --- Load Settings ---
    function loadSettings() {
        // Load only voice and speed
        chrome.storage.sync.get(['voice', 'speed'], (settings) => {
            // API Key loading removed
            if (settings.voice) {
                voiceSelect.value = settings.voice;
                 // Handle case where saved voice is no longer valid (optional)
                if (!voiceSelect.value) {
                    voiceSelect.value = voices[0]; // Fallback to first voice
                }
            } else {
                 voiceSelect.value = 'af_sky'; // Default if nothing saved
            }

            if (settings.speed) {
                const speedIndex = speedMap.indexOf(settings.speed);
                if (speedIndex !== -1) {
                    speedSlider.value = speedIndex;
                    updateSpeedDisplay(settings.speed);
                } else {
                    speedSlider.value = 0; // Default to 1.0x
                    updateSpeedDisplay(1.0);
                }
            } else {
                speedSlider.value = 0; // Default to 1.0x
                updateSpeedDisplay(1.0);
            }
        });
    }

    // --- Update Speed Display ---
    function updateSpeedDisplay(speed) {
        speedValueSpan.textContent = `${speed.toFixed(2)}x`;
    }

    // --- Event Listeners ---
    speedSlider.addEventListener('input', () => {
        const selectedSpeed = speedMap[parseInt(speedSlider.value, 10)];
        updateSpeedDisplay(selectedSpeed);
    });

    saveButton.addEventListener('click', () => {
        // API Key reading removed
        const voice = voiceSelect.value;
        const speed = speedMap[parseInt(speedSlider.value, 10)];

        // Save only voice and speed
        chrome.storage.sync.set({ voice, speed }, () => {
            statusDiv.textContent = 'Settings saved!';
            // Optional: Send message to background script if needed
            chrome.runtime.sendMessage({ type: 'settingsUpdated' }).catch(err => console.log("Could not send settings update message:", err));
            setTimeout(() => {
                 statusDiv.textContent = '';
                 // window.close(); // Optionally close popup after save
            }, 1500);
        });
    });

    // --- Initialization ---
    populateVoices();
    loadSettings();
});