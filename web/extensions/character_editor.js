import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "PresetManager",
    async setup() {
        // Add setting for button visibility
        app.ui.settings.addSetting({
            id: "Mudknight Utils.PresetManager.ShowButton",
            name: "Show Preset Manager Button",
            type: "boolean",
            defaultValue: true,
            tooltip: "Show/hide the Preset Manager button in the toolbar"
        });

        const addButton = () => {
            // Check if button should be visible
            const showButton = app.ui.settings.getSettingValue(
                "Mudknight Utils.PresetManager.ShowButton"
            );
            
            if (!showButton) {
                // Remove button if it exists and setting is disabled
                const existingButton = document.getElementById(
                    "preset-manager-button"
                );
                if (existingButton) {
                    existingButton.parentElement.remove();
                }
                return true;
            }

            // Target the specific flex container inside the actionbar
            const container = document.querySelector(
                ".actionbar-container .flex.gap-2.mx-2"
            );

            if (!container) return false;
            if (document.getElementById("preset-manager-button")) return true;

            const editorButton = document.createElement("button");
            editorButton.id = "preset-manager-button";
            editorButton.className = "comfyui-button " +
                "comfyui-menu-mobile-collapse primary";
            editorButton.title = "Launch Preset Manager";
            editorButton.style.padding = "0px 10px";

            const icon = document.createElement("i");
            icon.className = "mdi mdi-alpha-m-box";
            icon.style.fontSize = "24px";
            editorButton.appendChild(icon);

            editorButton.onclick = () => {
                const url = "/extensions/comfyui-mudknight-utils/" +
                    "character_editor.html";
                window.open(
                    url,
                    "PresetManager",
                    "width=1200,height=800,resizable=yes"
                );
            };

            const buttonGroup = document.createElement("div");
            buttonGroup.className = "comfyui-button-group";
            buttonGroup.appendChild(editorButton);

            // Insert after existing buttons, before any mudknight buttons
            const existingMudknightButton = container.querySelector(
                "#node-profiles-button"
            )?.parentElement;

            if (existingMudknightButton) {
                container.insertBefore(buttonGroup, existingMudknightButton);
            } else {
                container.prepend(buttonGroup);
            }

            return true;
        };

        const attemptAdd = () => {
            if (!addButton()) {
                setTimeout(attemptAdd, 1000);
            }
        };

        setTimeout(attemptAdd, 1000);

        // Watch for setting changes
        const observer = new MutationObserver(() => {
            addButton();
        });
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
    }
});
