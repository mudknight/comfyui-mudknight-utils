import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Mudknight Utils.NodeProfiles",

    async setup() {
        // Create and inject modal CSS
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

            .profile-modal.show {
                display: flex;
            }

            .profile-modal-content {
                background: var(--bg-color);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 20px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            }

            .profile-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 10px;
                border-bottom: 1px solid var(--border-color);
            }

            .profile-modal-header h2 {
                margin: 0;
                font-size: 18px;
            }

            .profile-close-btn {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: var(--fg-color);
                padding: 0;
                width: 30px;
                height: 30px;
                line-height: 1;
            }

            .profile-close-btn:hover {
                color: var(--error-text);
            }

            .profile-new-section {
                margin-bottom: 20px;
                padding-bottom: 20px;
                border-bottom: 1px solid var(--border-color);
            }

            .profile-new-section label {
                display: block;
                margin-bottom: 8px;
                font-size: 14px;
                font-weight: 500;
                color: var(--fg-color);
            }

            .profile-input-row {
                display: flex;
                gap: 10px;
            }

            .profile-input-field {
                flex: 1;
                padding: 10px;
                background: var(--comfy-input-bg);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                color: var(--input-text);
                font-size: 14px;
            }

            .profile-input-field:focus {
                outline: none;
                border-color: var(--primary-bg);
            }

            .profile-save-btn {
                padding: 10px 20px;
                background: var(--primary-bg);
                border: 1px solid var(--primary-bg);
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                color: white;
                white-space: nowrap;
            }

            .profile-save-btn:hover {
                opacity: 0.8;
            }

            .profile-save-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .profile-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
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

            .profile-item.editing {
                background: var(--comfy-menu-bg);
                border-color: var(--primary-bg);
            }

            .profile-name {
                flex: 1;
                font-weight: 500;
                color: var(--fg-color);
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
                transition: background 0.2s;
            }

            .profile-name:hover {
                background: var(--comfy-menu-bg);
            }

            .profile-name-input {
                flex: 1;
                padding: 6px 8px;
                background: var(--bg-color);
                border: 1px solid var(--primary-bg);
                border-radius: 4px;
                color: var(--input-text);
                font-size: 14px;
                font-weight: 500;
            }

            .profile-name-input:focus {
                outline: none;
            }

            .profile-info {
                font-size: 12px;
                color: var(--descrip-text);
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

            .profile-btn:hover {
                background: var(--comfy-input-bg);
            }

            .profile-btn.delete {
                color: var(--error-text);
            }

            .profile-btn.small {
                padding: 4px 8px;
                font-size: 11px;
            }

            .profile-empty {
                text-align: center;
                padding: 40px 20px;
                color: var(--descrip-text);
            }
        `;
        document.head.appendChild(style);

        // Create modal HTML
        const modal = document.createElement('div');
        modal.className = 'profile-modal';
        modal.id = 'profileModal';
        modal.innerHTML = `
            <div class="profile-modal-content">
                <div class="profile-modal-header">
                    <h2>Node Profiles</h2>
                    <button class="profile-close-btn">&times;</button>
                </div>
                <div class="profile-new-section">
                    <label>Save Current Parameters</label>
                    <div class="profile-input-row">
                        <input type="text" class="profile-input-field" id="newProfileName" placeholder="Enter profile name...">
                        <button class="profile-save-btn" id="saveProfileBtn">Save</button>
                    </div>
                </div>
                <div class="profile-list" id="profileList"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // Close modal when clicking outside or on close button
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });

        modal.querySelector('.profile-close-btn').addEventListener('click', () => {
            modal.classList.remove('show');
        });

        // Save button
        const newProfileInput = document.getElementById('newProfileName');
        const saveProfileBtn = document.getElementById('saveProfileBtn');

        saveProfileBtn.addEventListener('click', async () => {
            const name = newProfileInput.value.trim();
            if (name) {
                await window.saveNodeParams(name);
                newProfileInput.value = '';
                await renderProfiles();
            }
        });

        newProfileInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveProfileBtn.click();
            }
        });

        // Render profile list
        async function renderProfiles() {
            const profileList = document.getElementById('profileList');
            profileList.innerHTML = '';

            try {
                const response = await fetch('/node_profiles');
                if (!response.ok) {
                    profileList.innerHTML = '<div class="profile-empty">Failed to load profiles</div>';
                    return;
                }

                const profiles = await response.json();
                const profileNames = Object.keys(profiles);

                if (profileNames.length === 0) {
                    profileList.innerHTML = '<div class="profile-empty">No saved profiles<br>Enter a name above to create one</div>';
                    return;
                }

                // Sort profiles alphabetically
                profileNames.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

                for (const name of profileNames) {
                    const nodeCount = Object.keys(profiles[name]).length;
                    const item = document.createElement('div');
                    item.className = 'profile-item';
                    item.dataset.profileName = name;

                    item.innerHTML = `
                        <div style="flex: 1; min-width: 0;">
                            <div class="profile-name" title="Click to restore">${name}</div>
                            <div class="profile-info">${nodeCount} node(s)</div>
                        </div>
                        <button class="profile-btn rename" data-name="${name}">Rename</button>
                        <button class="profile-btn delete" data-name="${name}">Delete</button>
                    `;

                    // Click name to restore
                    item.querySelector('.profile-name').addEventListener('click', async () => {
                        await window.restoreNodeParams(name);
                        modal.classList.remove('show');
                    });

                    // Rename button - inline editing
                    item.querySelector('.rename').addEventListener('click', () => {
                        const nameDiv = item.querySelector('.profile-name');
                        const currentName = name;

                        // Replace name with input
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'profile-name-input';
                        input.value = currentName;

                        nameDiv.replaceWith(input);
                        item.classList.add('editing');

                        // Replace buttons with save/cancel
                        const renameBtn = item.querySelector('.rename');
                        const deleteBtn = item.querySelector('.delete');

                        const saveBtn = document.createElement('button');
                        saveBtn.className = 'profile-btn small';
                        saveBtn.textContent = 'Save';

                        const cancelBtn = document.createElement('button');
                        cancelBtn.className = 'profile-btn small';
                        cancelBtn.textContent = 'Cancel';

                        renameBtn.replaceWith(saveBtn);
                        deleteBtn.replaceWith(cancelBtn);

                        input.focus();
                        input.select();

                        const finishEdit = async (save) => {
                            if (save) {
                                const newName = input.value.trim();
                                if (newName && newName !== currentName) {
                                    await window.renameProfile(currentName, newName);
                                }
                            }
                            await renderProfiles();
                        };

                        saveBtn.addEventListener('click', () => finishEdit(true));
                        cancelBtn.addEventListener('click', () => finishEdit(false));

                        input.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                finishEdit(true);
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                finishEdit(false);
                            }
                        });
                    });

                    // Delete button
                    item.querySelector('.delete').addEventListener('click', async () => {
                        if (confirm(`Delete profile "${name}"?`)) {
                            const success = await window.deleteProfile(name);
                            if (success) {
                                await renderProfiles();
                            }
                        }
                    });

                    profileList.appendChild(item);
                }
            } catch (error) {
                console.error('Error rendering profiles:', error);
                profileList.innerHTML = '<div class="profile-empty">Error loading profiles</div>';
            }
        }

        // Add button to ComfyUI interface
        const addButton = () => {
            const container = document.querySelector(
                ".actionbar-container .flex.gap-2.mx-2"
            );

            if (!container) return false;
            if (document.getElementById("node-profiles-button")) return true;

            const profileButton = document.createElement("button");
            profileButton.id = "node-profiles-button";
            profileButton.className = "comfyui-button " +
                "comfyui-menu-mobile-collapse primary";
            profileButton.title = "Manage Node Profiles";
            profileButton.style.padding = "0px 10px";

            const icon = document.createElement("i");
            icon.className = "mdi mdi-notebook";
            icon.style.fontSize = "24px";
            profileButton.appendChild(icon);

            profileButton.onclick = async () => {
                await renderProfiles();
                modal.classList.add('show');
                // Focus the input field when modal opens
                setTimeout(() => {
                    document.getElementById('newProfileName').focus();
                }, 100);
            };

            const buttonGroup = document.createElement("div");
            buttonGroup.className = "comfyui-button-group";
            buttonGroup.appendChild(profileButton);

            // Insert as the first element in the horizontal list
            container.prepend(buttonGroup);

            return true;
        };

        const attemptAdd = () => {
            if (!addButton()) {
                setTimeout(attemptAdd, 1000);
            }
        };

        setTimeout(attemptAdd, 1000);
    }
});
