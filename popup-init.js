// popup-init.js

// Import specific components
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/switch/switch.js';
import '@material/web/button/filled-button.js';
import '@material/web/typography/md-typescale-styles.js';

// Import styles
import { styles as typescaleStyles } from '@material/web/typography/md-typescale-styles.js';
import { styles as themeStyles } from './theme.js'; // Load custom theme

// Apply styles to the document's adoptedStyleSheets
// Ensure this runs after the DOM is ready or styles might not apply correctly initially,
// although adoptedStyleSheets usually work well early.
if (document.adoptedStyleSheets) {
    document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        typescaleStyles.styleSheet,
        themeStyles.styleSheet
    ];
} else {
    console.warn("adoptedStyleSheets not supported or available yet.");
    // Fallback or alternative styling method might be needed for older environments
    // or if timing issues occur. For modern extensions, this should generally work.
}

console.log("Material Web components and styles initialized.");