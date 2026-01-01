import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "PresetManager",
    async setup() {
        const addButton = () => {
            console.log("=== Adding Preset Manager button ===");

            const loraGroup = document.querySelector(
                '.lora-manager-top-menu-group'
            );

            if (!loraGroup) {
                console.error("LoRA Manager button group not found");
                return false;
            }

            if (document.getElementById("preset-manager-button")) {
                console.log("Preset Manager button already exists");
                return true;
            }

            const editorButton = document.createElement("button");
            editorButton.style.padding = "0px 10px";
            const icon = document.createElement("i");
            icon.className = "mdi mdi-alpha-m-box";
            icon.style.fontSize = "24px";
            editorButton.appendChild(icon);

            editorButton.id = "preset-manager-button";
            editorButton.className = "comfyui-button comfyui-menu-mobile-" +
                "collapse primary";
            editorButton.title = "Launch Preset Manager";
            editorButton.setAttribute(
                "aria-label",
                "Launch Preset Manager"
            );
            editorButton.onclick = () => {
                const url = (
                    '/extensions/comfyui-mudknight-utils/' +
                    'character_editor.html'
                );
                window.open(
                    url,
                    'PresetManager',
                    'width=1200,height=800,resizable=yes,scrollbars=yes'
                );
            };

            loraGroup.parentNode.insertBefore(
                editorButton,
                loraGroup.nextSibling
            );

            const buttonGroup = document.createElement("div");
            buttonGroup.className = "comfyui-button-group";
            buttonGroup.appendChild(editorButton);

            loraGroup.parentNode.insertBefore(
                buttonGroup,
                loraGroup.nextSibling
            );

            console.log("Preset Manager button added!");
            return true;
        };

        setTimeout(() => {
            if (!addButton()) {
                setTimeout(addButton, 2000);
            }
        }, 1000);
    }
});
