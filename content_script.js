// This script now runs in the MAIN world

(function() {
    console.log("Content script (MAIN world) running.");

    const CUSTOM_EVENT_NAME = 'veniceReaderExtractedContentEvent';

    // Check if Readability is available (should have been injected just before this script)
    if (typeof window.Readability !== 'function') {
        console.error("Readability class not found on window object in MAIN world.");
        // Dispatch an error event that the isolated world script can catch
        document.dispatchEvent(new CustomEvent(CUSTOM_EVENT_NAME, {
            detail: { error: 'Readability library not found.' }
        }));
        return;
    }

    try {
        // Clone the document using cloneNode to avoid modifying the live page
        const docClone = document.cloneNode(true);

        // Ensure base URI is set for relative path resolution if needed by Readability
        // Note: Readability might handle this automatically, but setting it explicitly can be safer.
        // Check if a base element already exists
        let baseEl = docClone.querySelector('base');
        if (!baseEl) {
            baseEl = docClone.createElement('base');
            baseEl.setAttribute('href', document.location.href);
            // Prepend to head to ensure it's effective for subsequent elements
            docClone.head.insertBefore(baseEl, docClone.head.firstChild);
        }

        // Create a Readability instance and parse the cloned document
        const reader = new window.Readability(docClone);
        const article = reader.parse();

        if (article && article.textContent) {
            console.log("Article extracted in MAIN world:", article.title);
            // Dispatch a custom DOM event with the article data for ui_controller to catch
            document.dispatchEvent(new CustomEvent(CUSTOM_EVENT_NAME, {
                detail: {
                    article: {
                        title: article.title,
                        textContent: article.textContent,
                        // content: article.content // Optionally include HTML
                    }
                }
            }));
        } else {
            console.warn("Readability could not parse the article content in MAIN world.");
             // Dispatch an error event for ui_controller to catch
            document.dispatchEvent(new CustomEvent(CUSTOM_EVENT_NAME, {
                detail: { error: 'Could not extract article content from this page.' }
            }));
        }
    } catch (error) {
        console.error("Error during Readability parsing in MAIN world:", error);
         // Dispatch a parsing error event for ui_controller to catch
         document.dispatchEvent(new CustomEvent(CUSTOM_EVENT_NAME, {
            detail: { error: `Readability parsing failed: ${error.message}` }
        }));
    }

})();