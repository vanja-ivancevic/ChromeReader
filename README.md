# Kokoro Text-to-Speech Chrome Extension

Read web pages and selected text aloud using high-quality AI voices from Venice AI's Kokoro model.

## Features

*   **Read Aloud:** Reads the main content of most web pages or selected text snippets.
*   **Voice Selection:** Choose from various high-quality voices.
*   **Speed Control:** Adjust the reading speed (1.0x to 2.0x).
*   **Voice Preview:** Sample voices directly in the settings popup.
*   **Simple UI:** An unobtrusive controller appears on the page during reading.

## Installation (Manual)

Since this extension is not yet on the Chrome Web Store, you need to install it manually:

1.  **Download:** Download the extension files, likely as a ZIP archive from GitHub. If you cloned the repository, you already have the files.
2.  **Unzip:** If you downloaded a ZIP file, unzip it to a permanent location on your computer (e.g., a folder named `kokoro-tts-extension`).
3.  **Open Chrome Extensions:** Open Google Chrome, type `chrome://extensions` in the address bar, and press Enter.
4.  **Enable Developer Mode:** In the top-right corner of the Extensions page, toggle the "Developer mode" switch ON.
5.  **Load Unpacked:** Click the "Load unpacked" button that appears.
6.  **Select Folder:** Navigate to the folder where you unzipped or cloned the extension files (e.g., the `kokoro-tts-extension` folder) and click "Select Folder".
7.  **Installed:** The Kokoro Text-to-Speech extension should now appear in your list of extensions and be ready to use.

## Getting Started

1.  **API Key:** This extension requires an API key from Venice AI to function.
    *   Visit [Venice.ai](https://venice.ai/) and sign up or log in.
    *   Navigate to your API key settings (the exact location might vary, look for "API Keys" or similar in your account settings).
    *   Generate a new API key if you don't have one.
    *   **Copy** the generated API key.
2.  **Configure Extension:**
    *   Click the Kokoro Text-to-Speech extension icon in your Chrome toolbar (it might be hidden under the puzzle piece icon).
    *   Paste your copied Venice AI API key into the "API Key" field.
    *   Select your preferred voice using the dropdown menu. You can click the small play button next to the dropdown to preview the selected voice.
    *   Changes are saved automatically.
3.  **Usage:**
    *   **Read Page:** Right-click anywhere on a web page and select "Read this page" from the context menu.
    *   **Read Selection:** Highlight text on a web page, right-click the selection, and choose "Start Reading Selection".
    *   **Control Playback:** Use the floating UI controller that appears (usually bottom-right) to play/pause and adjust reading speed.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details (You will need to create this file).

## Support & Donations

If you find this extension useful, consider supporting its development:

*   **PayPal:** [vanja.ivancevic@gmail.com](mailto:vanja.ivancevic@gmail.com)
*   **Check out my other work:** [www.vanja-ivancevic.com](https://www.vanja-ivancevic.com)

---

*Note: Ensure you comply with Venice AI's terms of service when using their API.*