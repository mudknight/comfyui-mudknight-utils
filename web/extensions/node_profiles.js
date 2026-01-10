import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Mudknight Utils.NodeProfiles",

    async setup() {
        app.ui.settings.addSetting({
            id: "Mudknight Utils.NodeProfiles.ShowButton",
            name: "Show Node Profiles Button",
            type: "boolean",
            defaultValue: true,
            tooltip: "Show/hide the Node Profiles button in the toolbar"
        });

        const style = document.createElement('style');
        style.textContent = `
            .profile-modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                z-index: 10000;
                align-items: center;
                justify-content: center;
            }
            .profile-modal.show { display: flex; }
            .profile-modal-content {
                background: var(--comfy-menu-bg);
                border: 2px solid var(--border-color);
                border-radius: 10px;
                padding: 20px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            }
            #profileList {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .profile-node-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                margin-top: 6px;
            }
            .node-tag-container {
                display: flex;
                flex-direction: column;
                background: var(--comfy-menu-bg);
                border: 1px solid var(--border-color);
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
            }
            .node-tag-type {
                font-weight: bold;
                color: var(--fg-color);
            }
            .node-tag-model {
                color: var(--descrip-text);
                font-size: 10px;
                border-top: 1px solid var(--border-color);
                margin-top: 2px;
                padding-top: 2px;
            }
            .profile-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 10px;
                border-bottom: 1px solid var(--border-color);
            }
            .profile-close-btn {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: var(--fg-color);
            }
            .profile-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px;
                background: var(--comfy-input-bg);
                border: 1px solid var(--border-color);
                border-radius: 4px;
            }
            .profile-name {
                flex: 1;
                font-weight: 500;
                color: var(--fg-color);
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
            }
            .profile-input-field {
                border-radius: 5px;
            }
            .profile-btn {
                padding: 6px 12px;
                border: 1px solid var(--border-color);
                border-radius: 4px;
                background: var(--comfy-menu-bg);
                cursor: pointer;
                font-size: 12px;
                color: var(--fg-color);
            }
            .profile-btn.delete {
                color: var(--error-text);
            }
        `;
        document.head.appendChild(style);

        const modal = document.createElement('div');
        modal.className = 'profile-modal';
        modal.id = 'profileModal';
        modal.innerHTML = `
            <div class="profile-modal-content">
                <div class="profile-modal-header">
                    <h2>Node Profiles</h2>
                    <button class="profile-close-btn">&times;</button>
                </div>
                <div class="profile-new-section" style="margin-bottom: 20px;">
                    <label style="display:block; margin-bottom:8px;">Save Current Parameters</label>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="newProfileName" class="profile-input-field" placeholder="Enter profile name..." style="flex:1; padding:8px; background:var(--comfy-input-bg); border:1px solid var(--border-color); color:var(--input-text);">
                        <button id="saveProfileBtn" class="profile-save-btn" style="padding:8px 16px; background:var(--primary-bg); color:white; border:none; border-radius:4px; cursor:pointer;">Save</button>
                    </div>
                </div>
                <div id="profileList"></div>
            </div>
        `;
        document.body.appendChild(modal);

        const WHITELIST = ["BaseNode", "UpscaleNode", "DetailerNode", "DetailerPipeNode"];

        const formatModelName = (path) => {
            if (!path) return "";
            const filename = path.split('/').pop();
            return filename.split('.')[0];
        };

        window.saveNodeParams = async (name) => {
            const profileData = {};
            for (const node of app.graph._nodes) {
                if (!node.widgets || !WHITELIST.includes(node.type)) continue;

                let identifier = node.type;
                let modelName = null;

                if (node.type.includes("Detailer")) {
                    const bbox = node.widgets.find(w => w.name === "bbox_model");
                    if (bbox?.value) {
                        modelName = bbox.value;
                        identifier = `${node.type}:${modelName}`;
                    }
                }

                profileData[identifier] = {
                    type: node.type,
                    model: modelName,
                    widgets: node.widgets.map(w => ({ name: w.name, value: w.value }))
                };
            }
            await fetch(`/node_profiles/${encodeURIComponent(name)}`, {
                method: 'POST',
                body: JSON.stringify(profileData)
            });
        };

        window.restoreNodeParams = async (name) => {
            const response = await fetch(`/node_profiles/${encodeURIComponent(name)}`);
            if (!response.ok) return;
            const profile = await response.json();

            for (const [id, data] of Object.entries(profile)) {
                let target = null;
                if (data.model) {
                    target = app.graph._nodes.find(n => 
                        n.type === data.type && 
                        n.widgets?.find(w => w.name === "bbox_model")?.value === data.model
                    );
                } else {
                    target = app.graph._nodes.find(n => n.type === data.type);
                }

                if (target) {
                    data.widgets.forEach(sw => {
                        const w = target.widgets.find(nodeW => nodeW.name === sw.name);
                        if (w) {
                            w.value = sw.value;
                            if (w.callback) w.callback(w.value, app.canvas, target);
                        }
                    });
                }
            }
            app.graph.setDirtyCanvas(true, true);
        };

        const renderProfiles = async () => {
            const list = document.getElementById('profileList');
            const response = await fetch('/node_profiles');
            const profiles = await response.json();
            list.innerHTML = '';

            Object.keys(profiles).sort().forEach(name => {
                const item = document.createElement('div');
                item.className = 'profile-item';

                const tags = Object.entries(profiles[name]).map(([id, data]) => {
                    // Strip "Node" from the display name
                    const typeLabel = data.type.replace("Node", "");
                    const modelLabel = data.model ? formatModelName(data.model) : null;

                    return `
                        <div class="node-tag-container">
                            <span class="node-tag-type">${typeLabel}</span>
                            ${modelLabel ? `<span class="node-tag-model">${modelLabel}</span>` : ''}
                        </div>
                    `;
                }).join('');

                item.innerHTML = `
                    <div style="flex: 1; min-width: 0;">
                        <div class="profile-name">${name}</div>
                        <div class="profile-node-tags">${tags}</div>
                    </div>
                    <button class="profile-btn delete">Delete</button>
                `;

                item.querySelector('.profile-name').onclick = async () => {
                    await window.restoreNodeParams(name);
                    modal.classList.remove('show');
                };

                item.querySelector('.delete').onclick = async () => {
                    if (confirm(`Delete profile "${name}"?`)) {
                        await fetch(`/node_profiles/${encodeURIComponent(name)}`, { method: 'DELETE' });
                        renderProfiles();
                    }
                };
                list.appendChild(item);
            });
        };

        modal.querySelector('.profile-close-btn').onclick = () => modal.classList.remove('show');
        document.getElementById('saveProfileBtn').onclick = async () => {
            const input = document.getElementById('newProfileName');
            if (input.value.trim()) {
                await window.saveNodeParams(input.value.trim());
                input.value = '';
                renderProfiles();
            }
        };

        const addButton = () => {
            // Check if button should be visible
            const showButton = app.ui.settings.getSettingValue(
                "Mudknight Utils.NodeProfiles.ShowButton"
            );

            if (!showButton) {
                const existingButton = document.getElementById(
                    "node-profiles-button"
                );
                if (existingButton) {
                    existingButton.parentElement.remove();
                }
                return true;
            }

            const container = document.querySelector(
                ".actionbar-container .flex.gap-2.mx-2"
            );
            if (!container || document.getElementById("node-profiles-button")) return !!container;

            const profileButton = document.createElement("button");
            profileButton.id = "node-profiles-button";
            profileButton.className = "comfyui-button primary";
            profileButton.style.padding = "0px 10px";
            profileButton.innerHTML = '<i class="mdi mdi-notebook" style="font-size: 24px;"></i>';

            profileButton.onclick = async () => {
                await renderProfiles();
                modal.classList.add('show');
            };

            const buttonGroup = document.createElement("div");
            buttonGroup.className = "comfyui-button-group";
            buttonGroup.appendChild(profileButton);

            const presetBtn = container.querySelector("#preset-manager-button")?.parentElement;
            if (presetBtn) presetBtn.after(buttonGroup);
            else container.prepend(buttonGroup);

            return true;
        };

        const attemptAdd = () => { if (!addButton()) setTimeout(attemptAdd, 1000); };
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
