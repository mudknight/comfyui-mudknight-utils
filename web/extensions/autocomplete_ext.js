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
            id: "Mudknight Utils.Autocomplete.PresetManagerEnabled",
            name: "Enable Autocomplete in Preset Manager",
            type: "boolean",
            defaultValue: true,
            tooltip: "Enable autocomplete in the Preset Manager interface"
        },
        {
            id: "Mudknight Utils.Autocomplete.UsageOnlyExisting",
            name: "Only Apply Usage to Pre-existing Tags",
            type: "boolean",
            defaultValue: false,
            tooltip: "Only boost tags that already exist in your tag " +
            "sources. Prevents creating new tags from usage data.",
        },
        {
            id: "Mudknight Utils.Autocomplete.ApplyUsage",
            name: "Apply Tag Usage to Autocomplete",
            type: "boolean",
            defaultValue: true,
            tooltip: "Boost autocomplete priority for tags you've used " +
            "before. Requires reload to take effect.",
        },
        {
            id: "Mudknight Utils.Autocomplete.CollectUsage",
            name: "Collect Tag Usage Data",
            type: "boolean",
            defaultValue: true,
            tooltip: "Track which tags you use in prompts to boost " +
            "their autocomplete priority. Requires restart to take effect.",
            onChange: async (value) => {
                try {
                    const settings = await api.loadAutocompleteSettings();
                    settings.collect_tag_usage = value;
                    await api.saveAutocompleteSettings(settings);
                    console.log(
                        `Tag usage collection ${value ? 'enabled' : 'disabled'}`
                    );
                } catch (error) {
                    console.error('Error updating collection setting:', error);
                }
            }
        },
        {
            id: "Mudknight Utils.Autocomplete.Blacklist",
            name: "Tag Blacklist (comma-separated)",
            type: "text",
            defaultValue: "",
            tooltip: "Tags to exclude from autocomplete. " +
            "Separate multiple tags with commas. " +
            "Also excludes aliases of blacklisted tags.",
            onChange: (value) => {
                // Parse and normalize blacklist
                const blacklist = new Set(
                    value.split(',')
                    .map(t => t.trim().toLowerCase().replace(/ /g, '_'))
                    .filter(t => t.length > 0)
                );
                autocompleteState.blacklist = blacklist;
                console.log(
                    `Blacklist updated: ${blacklist.size} tag(s) blocked`
                );
            }
        },
        {
            id: "Mudknight Utils.Autocomplete.CustomSources",
            name: "Custom Tag Sources (comma-separated URLs)",
            type: "text",
            defaultValue: "",
            tooltip: "Enter URLs to custom tag files (CSV or TXT format). " +
            "Separate multiple URLs with commas. " +
            "Files are cached for 24 hours.",
            onChange: async (value) => {
                console.log("Reloading autocomplete tags with custom sources...");
                try {
                    const tags = await api.loadAutocompleteTags(value);
                    autocompleteState.tags = tags;

                    const [characterPresets, tagPresets] = await Promise.all([
                        api.loadCharacterPresets(tags),
                        api.loadTagPresets(tags)
                    ]);

                    autocompleteState.characterPresets = characterPresets;
                    autocompleteState.tagPresets = tagPresets;

                    console.log("Autocomplete tags reloaded successfully");
                } catch (error) {
                    console.error("Error reloading autocomplete tags:", error);
                }
            }
        },
        {
            id: "Mudknight Utils.Autocomplete.CustomTags",
            name: "Custom Tags (comma-separated)",
            type: "text",
            defaultValue: "",
            tooltip: "Add custom tags separated by commas. " +
            "Example: my_tag, another_tag, custom_character",
            onChange: async (value) => {
                console.log("Reloading autocomplete with custom tags...");
                try {
                    const customSources = app.ui.settings.getSettingValue(
                        "Mudknight Utils.Autocomplete.CustomSources",
                    ) || "";

                    const tags = await api.loadAutocompleteTags(
                        customSources,
                        value
                    );
                    autocompleteState.tags = tags;

                    const [characterPresets, tagPresets] = await Promise.all([
                        api.loadCharacterPresets(tags),
                        api.loadTagPresets(tags)
                    ]);

                    autocompleteState.characterPresets = characterPresets;
                    autocompleteState.tagPresets = tagPresets;

                    console.log("Autocomplete reloaded with custom tags");
                } catch (error) {
                    console.error("Error reloading autocomplete:", error);
                }
            }
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
        {
            id: "Mudknight Utils.Autocomplete.LowerAliasPriority",
            name: "Lower priority of aliased tags",
            type: "boolean",
            defaultValue: true,
            tooltip: "When enabled, aliased tags appear at the bottom of " +
            "autocomplete results (count set to 0) instead of inheriting " +
            "the parent tag's priority. Requires reload to take effect.",
        },
        {
            id: "Mudknight Utils.Autocomplete.Enabled",
            name: "Enable Autocomplete in ComfyUI",
            type: "boolean",
            defaultValue: true,
            tooltip: "Enable autocomplete for multiline strings.",
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

        // Initialize blacklist
        const blacklistStr = app.ui.settings.getSettingValue(
            "Mudknight Utils.Autocomplete.Blacklist",
        ) || "";
        const blacklist = new Set(
            blacklistStr.split(',')
            .map(t => t.trim().toLowerCase().replace(/ /g, '_'))
            .filter(t => t.length > 0)
        );
        autocompleteState.blacklist = blacklist;
        if (blacklist.size > 0) {
            console.log(`Blacklist loaded: ${blacklist.size} tag(s)`);
        }

        // Get custom sources from settings
        const customSources = app.ui.settings.getSettingValue(
            "Mudknight Utils.Autocomplete.CustomSources",
        ) || "";

        const customTags = app.ui.settings.getSettingValue(
            "Mudknight Utils.Autocomplete.CustomTags",
        ) || "";

        console.log("Loading autocomplete with custom sources:", customSources);

        // Use cached data loader
        const data = await api.loadAllAutocompleteData(
            customSources,
            customTags
        );

        Object.assign(autocompleteState, data);

        // Listen for prompt execution to update tag usage
        const originalExecute = app.queuePrompt;
        app.queuePrompt = async function(...args) {
            const result = await originalExecute.apply(this, args);

            // Check if collection is enabled
            const collectUsage = app.ui.settings.getSettingValue(
                "Mudknight Utils.Autocomplete.CollectUsage"
            );

            if (collectUsage === false) return result;

            // Update usage counts after execution
            setTimeout(async () => {
                try {
                    console.log("Updating tag usage counts...");
                    // updateTagUsageCounts updates the array in-place
                    await api.updateTagUsageCounts(
                        autocompleteState.tags
                    );
                } catch (error) {
                    console.error("Error updating tag usage:", error);
                }
            }, 1000);

            return result;
        };

        // Load and sync collection setting
        const settings = await api.loadAutocompleteSettings();
        const collectUsage = settings.collect_tag_usage !== false;
        app.ui.settings.setSettingValue(
            "Mudknight Utils.Autocomplete.CollectUsage",
            collectUsage
        );

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
                            w.element._comfyWidget = w;
                            setupAutocomplete(w.element, true);
                        }
                    });
                }, 100);
            }
        };
    }
});
