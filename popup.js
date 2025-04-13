document.addEventListener('DOMContentLoaded', () => {
    const apiKeyField = document.getElementById('apiKey'); // Standard input
    const voiceSelect = document.getElementById('voiceSelect'); // Standard select
    // Mode buttons and container removed
    const previewButton = document.getElementById('previewVoiceButton');
    const previewAudioPlayer = document.getElementById('previewAudioPlayer');
    let saveTimeout = null; // For debouncing API key saves
    // isPreviewPlaying state managed by button classes and audio player state
    let currentPreviewObjectUrl = null;
    let previewAbortController = null; // To cancel fetch if needed

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

    // Quotes from quotes.txt (cleaned up)
    const quotes = [
        "Organisms don't think of CO2 as a poison. Plants and organisms that make shells, coral, think of it as a building block.",
        "Under the White Cliff's battlemented crown, Hushed to a depth of more than Sabbath peace.",
        "Never again can I gaze upon the beauty spots of the Earth and enjoy them as being the finest thing I have ever seen. Crater Lake is above them all.",
        "Like to the apples on the Dead Sea's shore, all ashes to the taste.",
        "It is not the mountain we conquer but ourselves.",
        "The natural history of this archipelago is very remarkable: it seems to be a little world within itself.",
        "As it turns out, Mount Kilimanjaro is not wi-fi enabled, so I had to spend two weeks in Tanzania talking to the people on my trip.",
        "The Pantanal is the most complex intertropical alluvional plain of the planet and perhaps the least known area of the world.",
        "But as I headed into the heart of New Zealand's fiordland that same child-like feeling, long lost, of pure unadulterated awe came rushing back.",
        "Several closely situated granite peaks resembling tiger's teeth dramatically soar about a kilometer into the sky",
        "Tsingy is a 250-square-mile tiger trap made up on massive obelisks riddled with jagged spears. And yes, they will cut your pretty face.",
        "Yosemite Valley, to me, is always a sunrise, a glitter of green and golden wonder in a vast edifice of stone and space.",
        "No man ever wetted clay and then left it, as if there would be bricks by chance and fortune.",
        "I thought clay must feel happy in the good potter's hand.",
        "If there are no dogs in Heaven, then when I die I want to go where they went.",
        "I am fond of pigs. Dogs look up to us. Cats look down on us. Pigs treat us as equals.",
        "Who deserves more credit than the wife of a coal miner?",
        "When you find yourself in a hole, quit digging.",
        "Vessels large may venture more, but little boats should keep near shore.",
        "It is not that life ashore is distasteful to me. But life at sea is better.",
        "I don't believe in astrology; I'm a Sagittarius and we're skeptical.",
        "A physician without a knowledge of astrology has no right to call himself a physician.",
        "Thousands have lived without love, not one without water.",
        "The man who has grit enough to bring about the afforestation or the irrigation of a country is not less worthy of honor than its conqueror.",
        "I shot an arrow into the air. It fell to earth, I knew not where.",
        "May the forces of evil become confused while your arrow is on its way to the target.",
        "Writing means sharing. It's part of the human condition to want to share things – thoughts, ideas, opinions.",
        "Writing is easy. All you have to do is cross out the wrong words.",
        "Each of us is carving a stone, erecting a column, or cutting a piece of stained glass in the construction of something much bigger than ourselves.",
        "When wasteful war shall statues overturn, and broils root out the work of masonry.",
        "Bronze is the mirror of the form, wine of the mind.",
        "I'm also interested in creating a lasting legacy… because civ 6 will last for thousands of years.",
        "Sometimes the wheel turns slowly, but it turns.",
        "Don't reinvent the wheel, just realign it.",
        "And all I ask is a tall ship and a star to steer her by.",
        "Set your course by the stars, not by the lights of every passing ship.",
        "Wealth consists not in having great possessions, but in having few wants.",
        "Money, if it does not bring you happiness, will at least help you be miserable in comfort.",
        "No hour of life is wasted that is spent in the saddle.",
        "A man on a horse is spiritually as well as physically bigger than a man on foot.",
        "The Lord made us all out of iron. Then he turns up the heat to forge some of us into steel.",
        "Everything has its limit – iron ore cannot be educated into gold.",
        "I cannot imagine any condition which would cause a ship to founder … Modern shipbuilding has gone beyond that.",
        "There is nothing but a plank between a sailor and eternity.",
        "Without mathematics, there's nothing you can do. Everything around you is mathematics. Everything around you is numbers.",
        "If I were again beginning my studies, I would follow the advice of Plato and start with mathematics.",
        "Create with the heart; build with the mind.",
        "The four building blocks of the universe are fire, water, gravel and vinyl.",
        "One man's 'magic' is another man's engineering.",
        "Normal people … believe that if it ain't broke, don't fix it. Engineers believe that if it ain't broke, it doesn't have enough features yet.",
        "Tactics mean doing what you can with what you have.",
        "Strategy requires thought; tactics require observation.",
        "We are all apprentices in a craft where no one ever becomes a master.",
        "There is no easy way to train an apprentice. My two tools are example and nagging.",
        "Few inventions have been so simple as the stirrup, but few have had so catalytic an influence on history."
    ].map(q => q.trim().replace(/^"|"$/g, ''));

    // Speed map removed

    // --- Populate Voices ---
    function populateVoices() {
        // Clear existing options (including the "Loading..." placeholder)
        voiceSelect.innerHTML = '';

        voices.forEach(voice => {
            const option = document.createElement('option'); // Use standard option
            option.value = voice;
            option.textContent = voice; // Set text content directly
            voiceSelect.appendChild(option);
        });
    }

    // updateModeSelection function removed
    // --- Save Settings ---
    function saveSettings() {
        // No validation needed here if saving on every change,
        // but could add checks if desired (e.g., don't save empty API key if API mode is active)
        const apiKey = apiKeyField.value.trim();
        const voice = voiceSelect.value;
        // useLocalLLM removed from save data
        chrome.storage.sync.set({ apiKey, voice }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving settings:", chrome.runtime.lastError);
            } else {
                /* console.log("Settings auto-saved."); */
                // Send message to background if needed (e.g., if API key changes)
                // useLocalLLM removed from message payload
                chrome.runtime.sendMessage({ type: 'settingsUpdated', newSettings: { apiKey, voice } })
                      .catch(err => console.warn("Could not send settings update message:", err)); // Use warn for potential issues
            }
        });
    }

    // --- Load Settings ---
    function loadSettings() {
        // Load only API Key and Voice
        chrome.storage.sync.get(['apiKey', 'voice'], (settings) => {
            // API Key
            if (settings.apiKey) {
                apiKeyField.value = settings.apiKey;
            } else {
                // Keep the default value (empty string) from HTML if nothing is saved
            }

            // Voice
            // Voice - Standard select value setting
            const savedVoice = settings.voice || 'af_sky'; // Default if nothing saved
            voiceSelect.value = savedVoice;
            // Check if the value was actually set (i.e., the option exists)
            if (voiceSelect.value !== savedVoice && voices.length > 0) {
                 // If the saved voice isn't in the list, fallback to the first available voice
                 const firstAvailableVoice = voices.includes('af_sky') ? 'af_sky' : voices[0];
                 voiceSelect.value = firstAvailableVoice;
            }

            // Mode selection logic removed
        });
    }

    // Speed display function removed

    // --- Event Listeners ---
    // --- Event Listeners for Auto-Save ---
    apiKeyField.addEventListener('input', () => {
        // Debounce API key saving slightly to avoid saving on every keystroke
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveSettings, 500); // Save after 500ms pause
    });

    voiceSelect.addEventListener('change', saveSettings); // Save immediately on voice change

    // --- Voice Preview Logic ---

    function handlePreviewClick() {
        // Check current state based on classes or audio player state
        const isLoading = previewButton.classList.contains('loading');
        const isPlaying = previewButton.classList.contains('playing'); // Reflects audio playing state

        if (isLoading) {
            /* console.log("Preview request already in progress."); */
            // Optional: Implement fetch cancellation here using previewAbortController.abort()
            // if (previewAbortController) {
            //     previewAbortController.abort();
            //     previewAbortController.abort(); // Uncomment to enable cancellation
            //     console.log("Preview fetch cancelled."); // Uncomment to enable cancellation
            //     resetPreviewState(); // Uncomment to enable cancellation
            // }
            return;
        }

        if (isPlaying) {
            // If playing, pause it
            previewAudioPlayer.pause();
            // State update (removing 'playing' class) handled by 'onpause' listener
        } else {
            // If paused or idle
            if (previewAudioPlayer.readyState > 0 && !previewAudioPlayer.ended) {
                // If audio is loaded and paused, resume play
                previewAudioPlayer.play();
                // State update (adding 'playing' class) handled by 'onplay' listener
            } else {
                // If idle (no audio loaded or playback finished), start fetch
                fetchAndPlayPreview();
            }
        }
    }

    function fetchAndPlayPreview() {
        const apiKey = apiKeyField.value.trim();
        const selectedVoice = voiceSelect.value;
        // Add check specifically for empty API key first
        if (!apiKey) {
            console.warn("API Key is missing. Please enter your API key to preview voices.");
            resetPreviewState(); // Reset button state
            return; // Stop if no API key
        }
        // Then check for voice/quotes
        if (!selectedVoice || quotes.length === 0) {
            console.warn("Voice or Quotes missing for preview.");
            resetPreviewState(); // Reset button state here too
            return;
        }

        // Select a random quote
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        /* console.log(`Previewing voice ${selectedVoice} with quote: "${randomQuote}"`); */

        // Set loading state
        previewButton.classList.add('loading');
        previewButton.classList.remove('playing');
        previewButton.disabled = true; // Disable while loading
        previewAbortController = new AbortController(); // Create new controller for this fetch

        const apiUrl = 'https://api.venice.ai/api/v1/audio/speech';
        const options = {
            method: 'POST',
            signal: previewAbortController.signal, // Add signal for cancellation
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "tts-kokoro",
                voice: selectedVoice,
                response_format: "mp3",
                streaming: false,
                input: randomQuote
            })
        };

        fetch(apiUrl, options)
            .then(response => {
                if (!response.ok) {
                    return response.text().then(text => {
                         let detail = text;
                         try { detail = JSON.parse(text).message || text; } catch (e) {}
                         throw new Error(`API Error (${response.status}): ${detail}`);
                    });
                }
                return response.blob();
            })
            .then(audioBlob => {
                if (currentPreviewObjectUrl) { URL.revokeObjectURL(currentPreviewObjectUrl); }
                currentPreviewObjectUrl = URL.createObjectURL(audioBlob);
                previewAudioPlayer.src = currentPreviewObjectUrl;
                // Don't set playing class here, wait for 'play' event
                previewAudioPlayer.play();
                // Note: 'play' event listener will remove 'loading' and add 'playing'
            })
            .catch(err => {
                 if (err.name === 'AbortError') {
                     /* console.log("Preview fetch aborted."); */ // Expected behaviour
                 } else {
                     console.error("Voice preview fetch failed:", err);
                     // TODO: Optionally show error status to user in the UI
                 }
                 resetPreviewState(); // Reset on error or abort
            });
    }

    function resetPreviewState() {
        previewButton.disabled = false;
        previewButton.classList.remove('loading');
        previewButton.classList.remove('playing');
        previewAbortController = null; // Clear controller
        // URL is revoked before next play or on player 'ended'/'error' events
    }

    previewButton.addEventListener('click', handlePreviewClick);

    // Reset state when audio finishes or errors
    // Update button state based on audio player events
    previewAudioPlayer.addEventListener('play', () => {
        /* console.log("Preview playing."); */
        previewButton.classList.remove('loading');
        previewButton.classList.add('playing');
        previewButton.disabled = false; // Ensure enabled for pausing
    });
    previewAudioPlayer.addEventListener('pause', () => {
        /* console.log("Preview paused."); */
        // If pause was triggered by user click while playing, resetPreviewState handles UI.
        // If pause happens for other reasons (e.g. end of stream before 'ended'), reset.
        if (!previewAudioPlayer.ended) { // Avoid resetting if paused because it ended
             resetPreviewState(); // Show play icon again
        }
    });
    previewAudioPlayer.addEventListener('ended', () => {
        /* console.log("Preview ended."); */
        resetPreviewState();
        if (currentPreviewObjectUrl) { URL.revokeObjectURL(currentPreviewObjectUrl); currentPreviewObjectUrl = null; }
    });
    previewAudioPlayer.addEventListener('error', (e) => {
        console.error("Preview audio player error:", e);
        resetPreviewState();
        if (currentPreviewObjectUrl) { URL.revokeObjectURL(currentPreviewObjectUrl); currentPreviewObjectUrl = null; }
    });

    // Mode button listeners removed

    // Save button listener removed

    // --- Initialization ---
    populateVoices();
    loadSettings();
});