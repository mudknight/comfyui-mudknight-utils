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
        
        // Storage for named profiles
        let profiles = {};
        
        // Save current parameters to a named profile
        window.saveNodeParams = function(profileName = 'default') {
            if (!app.graph) {
                console.error("No graph available");
                return;
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
            
            profiles[profileName] = savedParams;
            
            console.log(
                `Saved ${paramCount} parameter(s) from ` +
                `${nodeCount} node(s) to profile "${profileName}"`
            );
            
            return savedParams;
        };
        
        // Restore parameters from a named profile
        window.restoreNodeParams = function(profileName = 'default') {
            if (!app.graph) {
                console.error("No graph available");
                return;
            }
            
            const savedParams = profiles[profileName];
            
            if (!savedParams) {
                console.error(`Profile "${profileName}" not found`);
                console.log(
                    "Available profiles:",
                    Object.keys(profiles)
                );
                return;
            }
            
            let nodeCount = 0;
            let paramCount = 0;
            
            for (const node of app.graph._nodes) {
                const saved = savedParams[node.id];
                if (!saved) continue;
                
                // Verify it's still the same node class
                if (saved.class !== node.comfyClass) {
                    console.warn(
                        `Node #${node.id} class mismatch: ` +
                        `expected ${saved.class}, got ${node.comfyClass}`
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
                `${nodeCount} node(s) from profile "${profileName}"`
            );
        };
        
        // List all saved profiles
        window.listProfiles = function() {
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
        };
        
        // Get a specific profile's data
        window.getProfile = function(profileName = 'default') {
            if (!profiles[profileName]) {
                console.error(`Profile "${profileName}" not found`);
                return null;
            }
            return profiles[profileName];
        };
        
        // Delete a profile
        window.deleteProfile = function(profileName) {
            if (!profiles[profileName]) {
                console.error(`Profile "${profileName}" not found`);
                return false;
            }
            
            delete profiles[profileName];
            console.log(`Deleted profile "${profileName}"`);
            return true;
        };
        
        // Clear all profiles
        window.clearAllProfiles = function() {
            profiles = {};
            console.log("Cleared all profiles");
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
        console.log("  clearAllProfiles() - Delete all profiles");
        console.log(
            "  setNodeParam(class, param, value) - Set specific param"
        );
    }
});
