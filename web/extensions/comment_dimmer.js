import { app } from "/scripts/app.js";

const styles = `
.comfy-comment-dimmer-backdrop {
    position: absolute !important;
    pointer-events: none !important;
    user-select: none !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    z-index: 1 !important;
    margin: 0 !important;
    display: none !important;
    white-space: pre-wrap !important;
    word-wrap: break-word !important;
    /* Ensure no impact on flow */
    width: 0;
    height: 0;
    flex: none !important;
}

.comfy-comment-dimmer-backdrop.dimmer-synced {
    display: block !important;
}

.comfy-comment-dimmer-textarea {
    position: relative !important;
    z-index: 5 !important; /* Textarea on top for cursor/caret visibility */
}

textarea.comfy-comment-dimmer-textarea.dimmer-active {
    background: transparent !important;
    background-color: transparent !important;
    color: transparent !important;
    text-shadow: none !important;
    -webkit-text-fill-color: transparent !important;
    caret-color: var(--input-text, white) !important; /* Ensure cursor is visible */
}

.comfy-comment-dimmer-line-comment {
    opacity: 0.45;
    color: #888 !important;
}

.comfy-comment-dimmer-line-normal {
    opacity: 1;
    color: var(--input-text, #ccc) !important;
}

.comfy-comment-dimmer-line-placeholder {
    opacity: 0.5;
    font-style: italic;
    color: var(--input-text, #ccc) !important;
}

.comfy-comment-dimmer-wrapper {
    position: relative !important;
}
`;

const styleSheet = document.createElement("style");
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

class CommentDimmer {
    constructor() {
        this.backdrops = new WeakMap();
        this.originalStyles = new WeakMap();
        this.enabled = true;
    }

    getOrCreateBackdrop(textarea) {
        if (this.backdrops.has(textarea)) {
            return this.backdrops.get(textarea);
        }

        // Capture original styles before transparency
        const style = window.getComputedStyle(textarea);
        this.originalStyles.set(textarea, {
            background: style.backgroundColor
        });

        const backdrop = document.createElement("div");
        backdrop.className = "comfy-comment-dimmer-backdrop";

        const parent = textarea.parentElement;
        if (parent) {
            const parentStyle = window.getComputedStyle(parent);
            if (parentStyle.position === "static") {
                parent.style.position = "relative";
            }
        }

        textarea.classList.add("comfy-comment-dimmer-textarea");
        // Insert backdrop behind textarea
        textarea.parentElement.insertBefore(backdrop, textarea);

        this.backdrops.set(textarea, backdrop);

        if (window.ResizeObserver) {
            const observer = new ResizeObserver(() => {
                this.syncStyles(textarea, backdrop);
                this.updateBackdrop(textarea);
            });
            observer.observe(textarea);
        }

        return backdrop;
    }

    updateBackdrop(textarea) {
        const backdrop = this.backdrops.get(textarea);
        if (!backdrop) return;

        if (!this.enabled) {
            backdrop.innerHTML = "";
            backdrop.classList.remove("dimmer-synced");
            return;
        }

        const value = textarea.value || "";

        if (!value && textarea.placeholder) {
            // Show placeholder if empty
            backdrop.innerHTML = `<div class="comfy-comment-dimmer-line-placeholder" style="margin: 0; padding: 0;">${textarea.placeholder}</div>`;
            this.syncScroll(textarea, backdrop);
            return;
        }

        const lines = value.split("\n");
        const html = lines.map(line => {
            const stripped = line.trimStart();
            const isEscaped = stripped.startsWith("\\#");
            const isComment = stripped.startsWith("#") && !isEscaped;
            const className = isComment ? "comfy-comment-dimmer-line-comment" : "comfy-comment-dimmer-line-normal";

            let displayLine = line;
            if (isEscaped) displayLine = line.replace("\\#", "#");

            const escaped = displayLine
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

            return `<div class="${className}" style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word; margin: 0; padding: 0;">${escaped || "&nbsp;"}</div>`;
        }).join("");

        backdrop.innerHTML = html;
        this.syncScroll(textarea, backdrop);
    }

    syncScroll(textarea, backdrop) {
        if (!backdrop) return;
        backdrop.scrollTop = textarea.scrollTop;
        backdrop.scrollLeft = textarea.scrollLeft;
    }

    syncStyles(textarea, backdrop) {
        if (!backdrop || !textarea.isConnected) return;
        const style = window.getComputedStyle(textarea);

        // Restore background from original or fallback
        const orig = this.originalStyles.get(textarea);
        let bgColor = orig ? orig.background : "";
        if (!bgColor || bgColor === "rgba(0, 0, 0, 0)" || bgColor === "transparent") {
            bgColor = "var(--comfy-input-bg, #1a1a1a)";
        }
        backdrop.style.setProperty("background-color", bgColor, "important");

        // Match typography exactly
        const props = [
            'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
            'borderStyle', 'letterSpacing', 'textAlign', 'textIndent', 'textTransform', 
            'wordSpacing', 'borderRadius'
        ];

        props.forEach(prop => {
            const cssProp = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
            backdrop.style.setProperty(cssProp, style[prop], "important");
        });

        // Set border color to transparent so it takes space but doesn't show
        backdrop.style.setProperty("border-color", "transparent", "important");

        // Geometry sync - using offsetWidth/Height to match total box size
        backdrop.style.setProperty("width", textarea.offsetWidth + "px", "important");
        backdrop.style.setProperty("height", textarea.offsetHeight + "px", "important");
        backdrop.style.setProperty("top", textarea.offsetTop + "px", "important");
        backdrop.style.setProperty("left", textarea.offsetLeft + "px", "important");

        backdrop.classList.add("dimmer-synced");
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        document.querySelectorAll(".comfy-comment-dimmer-textarea").forEach(textarea => {
            if (enabled) {
                textarea.classList.add("dimmer-active");
            } else {
                textarea.classList.remove("dimmer-active");
            }
            this.updateBackdrop(textarea);
        });
    }
}

const dimmer = new CommentDimmer();

function setupTextarea(textarea) {
    if (textarea._commentDimmerSetup) return;

    const node = textarea.closest(".comfy-node");
    const isTargetNode = node && (
        node.textContent.includes("Prompt (full-pipe)") || 
        node.textContent.includes("Multi-String Conditioning")
    );

    if (!textarea._isPromptTextarea && !isTargetNode) return;

    dimmer.getOrCreateBackdrop(textarea);

    const isEnabled = app.ui.settings.getSettingValue("Mudknight Utils.CommentDimmer.Enabled");
    if (isEnabled !== false) {
        textarea.classList.add("dimmer-active");
    }

    textarea.addEventListener("input", () => {
        dimmer.updateBackdrop(textarea);
        dimmer.syncStyles(textarea, dimmer.backdrops.get(textarea));
    });

    // Add change listener for autocomplete or other programmatic changes
    textarea.addEventListener("change", () => {
        dimmer.updateBackdrop(textarea);
        dimmer.syncStyles(textarea, dimmer.backdrops.get(textarea));
    });

    // Handle programmatic value changes (like autocomplete)
    let lastValue = textarea.value;
    const checkValue = () => {
        if (textarea.value !== lastValue) {
            lastValue = textarea.value;
            dimmer.updateBackdrop(textarea);
        }
    };

    textarea.addEventListener("focus", () => {
        if (textarea._dimmerInterval) clearInterval(textarea._dimmerInterval);
        textarea._dimmerInterval = setInterval(checkValue, 100);

        const backdrop = dimmer.backdrops.get(textarea);
        if (backdrop) dimmer.syncStyles(textarea, backdrop);
        dimmer.updateBackdrop(textarea);
    });

    textarea.addEventListener("blur", () => {
        clearInterval(textarea._dimmerInterval);
        checkValue();
    });

    textarea.addEventListener("scroll", () => dimmer.syncScroll(textarea, dimmer.backdrops.get(textarea)));

    const backdrop = dimmer.backdrops.get(textarea);
    if (backdrop) {
        const sync = () => {
            if (!textarea.isConnected) return;
            dimmer.syncStyles(textarea, backdrop);
            dimmer.updateBackdrop(textarea);
        };
        sync();
        setTimeout(sync, 100);
        setTimeout(sync, 500);
    }
    textarea._commentDimmerSetup = true;
}

app.registerExtension({
    name: "Mudknight Utils.Comment Dimmer",
    settings: [
        {
            id: "Mudknight Utils.CommentDimmer.Enabled",
            name: "Dim Comments in Prompts (#)",
            type: "boolean",
            defaultValue: true,
            onChange: (value) => {
                dimmer.setEnabled(value);
            }
        }
    ],
    async setup() {
        setTimeout(() => {
            document.querySelectorAll("textarea").forEach(setupTextarea);
        }, 500);

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    if (node.tagName === "TEXTAREA") setupTextarea(node);
                    if (node.querySelectorAll) {
                        node.querySelectorAll("textarea").forEach(setupTextarea);
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "PromptConditioningNode" || nodeData.name === "MultiStringConditioning") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                setTimeout(() => {
                    this.widgets?.forEach(w => {
                        if (w.element && w.element.tagName === "TEXTAREA") {
                            w.element._isPromptTextarea = true;
                            setupTextarea(w.element);
                        }
                    });
                }, 100);

                return r;
            };
        }
    }
});
