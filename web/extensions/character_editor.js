import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "CharacterEditor",
    async setup() {
        const addButton = () => {
            console.log("=== Adding Character Editor button ===");
            
            const loraGroup = document.querySelector(
                '.lora-manager-top-menu-group'
            );
            
            if (!loraGroup) {
                console.error("LoRA Manager button group not found");
                return false;
            }
            
            if (document.getElementById("character-editor-button")) {
                console.log("Character Editor button already exists");
                return true;
            }
            
            const editorButton = document.createElement("button");
            // editorButton.innerHTML = '<i class="mdi mdi-account"></i>';
            const icon = document.createElement("i");
            icon.className = "mdi mdi-account";
            editorButton.appendChild(icon);

            editorButton.id = "character-editor-button";
            editorButton.className = "comfyui-button comfyui-menu-mobile-" +
                                     "collapse primary";
            editorButton.title = "Launch Character Editor";
            editorButton.setAttribute(
                "aria-label",
                "Launch Character Editor"
            );
            editorButton.onclick = () => {
                const url = (
                    '/extensions/comfyui-mudknight-utils/' +
                    'character_editor.html'
                );
                window.open(
                    url,
                    'Character Editor',
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
            
            console.log("Character Editor button added!");
            return true;
        };
        
        setTimeout(() => {
            if (!addButton()) {
                setTimeout(addButton, 2000);
            }
        }, 1000);
    }
});
