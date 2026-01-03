import { app } from "/scripts/app.js";
import { autocompleteState } from 
    "/extensions/comfyui-mudknight-utils/modules/state.js";
import * as api from 
    "/extensions/comfyui-mudknight-utils/modules/api.js";
import { 
    setupAutocomplete, 
    initAutocomplete 
} from "/extensions/comfyui-mudknight-utils/modules/autocomplete.js";

const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "/extensions/comfyui-mudknight-utils/autocomplete.css";
document.head.appendChild(link);

app.registerExtension({
    name: "Mudknight Utils.Autocomplete",
    settings: [
        {
            id: "Mudknight Utils.Autocomplete.Enabled",
            name: "Enable Autocomplete in ComfyUI",
            type: "boolean",
            defaultValue: true,
            tooltip: "Enable autocomplete for multiline strings.",
        },
        {
            id: "Mudknight Utils.Autocomplete.HideAliasesWithMain",
            name: "Hide tag aliases when main tag is present",
            type: "boolean",
            defaultValue: true,
            tooltip: "When enabled, aliases won't show if main tag " +
                "is in results, unless you specifically type the alias",
            onChange: (value) => {
                localStorage.setItem(
                    "Mudknight Utils.Autocomplete.HideAliasesWithMain",
                    value
                );
            }
        },
    ],
    async setup() {
        let dropdown = document.getElementById("autocompleteDropdown");
        if (!dropdown) {
            dropdown = document.createElement("div");
            dropdown.id = "autocompleteDropdown";
            dropdown.style.cssText = `
                display: none; 
                position: fixed; 
                z-index: 999999; 
                background: #222;
                border: 1px solid #444;
                pointer-events: auto;
            `;
            document.body.appendChild(dropdown);
        }

        initAutocomplete();

        const hideAliases = app.ui.settings.getSettingValue(
            "Mudknight Utils.Autocomplete.HideAliasesWithMain",
        );
        autocompleteState.hideAliasesWithMain = hideAliases;
        localStorage.setItem(
            "Mudknight Utils.Autocomplete.HideAliasesWithMain",
            hideAliases
        );

        const tags = await api.loadAutocompleteTags();
        autocompleteState.tags = tags;

        const [characterPresets, tagPresets, loras, embeds] = 
            await Promise.all([
                api.loadCharacterPresets(tags),
                api.loadTagPresets(tags),
                api.loadLoras(),
                api.loadEmbeddings()
            ]);

        autocompleteState.characterPresets = characterPresets;
        autocompleteState.tagPresets = tagPresets;
        autocompleteState.loras = loras;
        autocompleteState.embeddings = embeds;

        // Setup MutationObserver for Vue nodes (Nodes 2.0)
        this.setupVueNodeObserver();
    },

    setupVueNodeObserver() {
        const processedTextareas = new WeakSet();

        const processTextarea = (textarea) => {
            if (processedTextareas.has(textarea)) return;
            if (textarea._autocompleteSetup) return;

            const isEnabled = app.ui.settings.getSettingValue(
                "Mudknight Utils.Autocomplete.Enabled",
            );

            if (!isEnabled) return;

            textarea._checkEnabled = () => {
                const enabled = app.ui.settings.getSettingValue(
                    "Mudknight Utils.Autocomplete.Enabled"
                );
                if (enabled) {
                    const hideAliases = 
                        app.ui.settings.getSettingValue(
                            "Mudknight Utils.Autocomplete" +
                            ".HideAliasesWithMain",
                        );
                    autocompleteState.hideAliasesWithMain = 
                        hideAliases;
                    localStorage.setItem(
                        "Mudknight Utils.Autocomplete" +
                        ".HideAliasesWithMain",
                        hideAliases
                    );
                }
                return enabled;
            };

            setupAutocomplete(textarea, true);
            processedTextareas.add(textarea);
        };

        // Process existing textareas
        const processExistingTextareas = () => {
            document.querySelectorAll('textarea').forEach(textarea => {
                processTextarea(textarea);
            });
        };

        // Initial scan
        setTimeout(processExistingTextareas, 100);

        // Watch for new textareas being added (for Vue nodes)
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                // Check added nodes
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;

                    // Check if the node itself is a textarea
                    if (node.tagName === 'TEXTAREA') {
                        processTextarea(node);
                    }

                    // Check for textareas within the node
                    if (node.querySelectorAll) {
                        node.querySelectorAll('textarea')
                            .forEach(processTextarea);
                    }
                }
            }
        });

        // Observe the entire document for new textareas
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    },

    async beforeRegisterNodeDef(nodeType) {
        // Keep existing widget-based node support
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            const isEnabled = app.ui.settings.getSettingValue(
                "Mudknight Utils.Autocomplete.Enabled",
            );

            if (isEnabled) {
                setTimeout(() => {
                    this.widgets?.forEach(w => {
                        if (w.element && 
                            w.element.tagName === "TEXTAREA") {
                            w.element._checkEnabled = () => {
                                const enabled = 
                                    app.ui.settings.getSettingValue(
                                        "Mudknight Utils.Autocomplete" +
                                        ".Enabled"
                                    );
                                if (enabled) {
                                    const hideAliases = 
                                        app.ui.settings.getSettingValue(
                                            "Mudknight Utils.Autocomplete" +
                                            ".HideAliasesWithMain",
                                        );
                                    autocompleteState
                                        .hideAliasesWithMain = 
                                        hideAliases;
                                    localStorage.setItem(
                                        "Mudknight Utils.Autocomplete" +
                                        ".HideAliasesWithMain",
                                        hideAliases
                                    );
                                }
                                return enabled;
                            };
                            setupAutocomplete(w.element, true);
                        }
                    });
                }, 100);
            }
        };
    }
});
