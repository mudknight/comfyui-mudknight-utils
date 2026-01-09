import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Mudknight Utils.SetNodeParam",
    
    async setup() {
        // Whitelist of node classes to save/restore
        const WHITELISTED_NODES = [
            'BaseNode',
            'UpscaleNode',
            'DetailerNode',
            'DetailerPipeNode',
            'MaskDetailerNode',
            'MaskDetailerPipeNode'
        ];
        
        // Collect current parameters from whitelisted nodes
        function collectParams() {
            if (!app.graph) {
                console.error("No graph available");
                return null;
            }
            
            const savedParams = {};
            let nodeCount = 0;
            let paramCount = 0;
            
            for (const node of app.graph._nodes) {
                if (!WHITELISTED_NODES.includes(node.comfyClass)) {
                    continue;
                }
                
                const nodeData = {
                    class: node.comfyClass,
                    title: node.title,
                    params: {}
                };
                
                if (node.widgets) {
                    for (const widget of node.widgets) {
                        nodeData.params[widget.name] = widget.value;
                        paramCount++;
                    }
                }
                
                savedParams[node.id] = nodeData;
                nodeCount++;
            }
            
            return { data: savedParams, nodeCount, paramCount };
        }
        
        // Save current parameters to a named profile
        window.saveNodeParams = async function(profileName = 'default') {
            const result = collectParams();
            if (!result) return;
            
            try {
                const response = await fetch(
                    `/node_profiles/${encodeURIComponent(profileName)}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(result.data)
                    }
                );
                
                if (!response.ok) {
                    const error = await response.json();
                    console.error(
                        `Failed to save profile: ${error.error}`
                    );
                    return;
                }
                
                console.log(
                    `Saved ${result.paramCount} parameter(s) from ` +
                    `${result.nodeCount} node(s) to profile ` +
                    `"${profileName}"`
                );
            } catch (error) {
                console.error("Error saving profile:", error);
            }
        };
        
        // Restore parameters from a named profile
        window.restoreNodeParams = async function(
            profileName = 'default'
        ) {
            if (!app.graph) {
                console.error("No graph available");
                return;
            }
            
            try {
                const response = await fetch(
                    `/node_profiles/${encodeURIComponent(profileName)}`
                );
                
                if (!response.ok) {
                    if (response.status === 404) {
                        console.error(`Profile "${profileName}" not found`);
                        await listProfiles();
                    } else {
                        const error = await response.json();
                        console.error(
                            `Failed to load profile: ${error.error}`
                        );
                    }
                    return;
                }
                
                const savedParams = await response.json();
                let nodeCount = 0;
                let paramCount = 0;
                
                for (const node of app.graph._nodes) {
                    const saved = savedParams[node.id];
                    if (!saved) continue;
                    
                    // Verify it's still the same node class
                    if (saved.class !== node.comfyClass) {
                        console.warn(
                            `Node #${node.id} class mismatch: ` +
                            `expected ${saved.class}, ` +
                            `got ${node.comfyClass}`
                        );
                        continue;
                    }
                    
                    if (node.widgets) {
                        for (const widget of node.widgets) {
                            if (widget.name in saved.params) {
                                widget.value = saved.params[widget.name];
                                if (widget.callback) {
                                    widget.callback(widget.value);
                                }
                                paramCount++;
                            }
                        }
                    }
                    
                    nodeCount++;
                }
                
                app.graph.setDirtyCanvas(true, true);
                console.log(
                    `Restored ${paramCount} parameter(s) to ` +
                    `${nodeCount} node(s) from profile ` +
                    `"${profileName}"`
                );
            } catch (error) {
                console.error("Error restoring profile:", error);
            }
        };
        
        // List all saved profiles
        window.listProfiles = async function() {
            try {
                const response = await fetch('/node_profiles');
                if (!response.ok) {
                    console.error("Failed to load profiles");
                    return [];
                }
                
                const profiles = await response.json();
                const profileNames = Object.keys(profiles);
                
                if (profileNames.length === 0) {
                    console.log("No saved profiles");
                    return [];
                }
                
                console.log(`${profileNames.length} saved profile(s):`);
                for (const name of profileNames) {
                    const nodeCount = Object.keys(profiles[name]).length;
                    console.log(`  - "${name}" (${nodeCount} node(s))`);
                }
                
                return profileNames;
            } catch (error) {
                console.error("Error listing profiles:", error);
                return [];
            }
        };
        
        // Get a specific profile's data
        window.getProfile = async function(profileName = 'default') {
            try {
                const response = await fetch(
                    `/node_profiles/${encodeURIComponent(profileName)}`
                );
                
                if (!response.ok) {
                    if (response.status === 404) {
                        console.error(`Profile "${profileName}" not found`);
                    } else {
                        const error = await response.json();
                        console.error(
                            `Failed to load profile: ${error.error}`
                        );
                    }
                    return null;
                }
                
                return await response.json();
            } catch (error) {
                console.error("Error getting profile:", error);
                return null;
            }
        };
        
        // Delete a profile
        window.deleteProfile = async function(profileName) {
            try {
                const response = await fetch(
                    `/node_profiles/${encodeURIComponent(profileName)}`,
                    { method: 'DELETE' }
                );
                
                if (!response.ok) {
                    if (response.status === 404) {
                        console.error(`Profile "${profileName}" not found`);
                    } else {
                        const error = await response.json();
                        console.error(
                            `Failed to delete profile: ${error.error}`
                        );
                    }
                    return false;
                }
                
                console.log(`Deleted profile "${profileName}"`);
                return true;
            } catch (error) {
                console.error("Error deleting profile:", error);
                return false;
            }
        };
        
        // Rename a profile
        window.renameProfile = async function(oldName, newName) {
            try {
                const response = await fetch('/node_profiles/rename', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        oldName: oldName,
                        newName: newName
                    })
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    console.error(
                        `Failed to rename profile: ${error.error}`
                    );
                    return false;
                }
                
                console.log(
                    `Renamed profile "${oldName}" to "${newName}"`
                );
                return true;
            } catch (error) {
                console.error("Error renaming profile:", error);
                return false;
            }
        };
        
        // Original setNodeParam function (still useful for manual edits)
        window.setNodeParam = function(nodeClass, paramName, value) {
            if (!app.graph) {
                console.error("No graph available");
                return;
            }
            
            let count = 0;
            for (const node of app.graph._nodes) {
                if (node.comfyClass === nodeClass) {
                    const widget = node.widgets?.find(
                        w => w.name === paramName
                    );
                    
                    if (widget) {
                        widget.value = value;
                        if (widget.callback) {
                            widget.callback(value);
                        }
                        count++;
                        console.log(
                            `Set ${paramName} to ${value} on node ` +
                            `#${node.id} (${node.title || nodeClass})`
                        );
                    }
                }
            }
            
            if (count === 0) {
                console.log(
                    `No nodes found with class "${nodeClass}" ` +
                    `and parameter "${paramName}"`
                );
            } else {
                app.graph.setDirtyCanvas(true, true);
                console.log(`Updated ${count} node(s)`);
            }
        };
        
        console.log("SetNodeParam loaded. Available functions:");
        console.log("  saveNodeParams(name) - Save to named profile");
        console.log(
            "  restoreNodeParams(name) - Restore from named profile"
        );
        console.log("  listProfiles() - List all saved profiles");
        console.log("  getProfile(name) - View specific profile");
        console.log("  deleteProfile(name) - Delete a profile");
        console.log("  renameProfile(old, new) - Rename a profile");
        console.log(
            "  setNodeParam(class, param, value) - Set specific param"
        );
    }
});
