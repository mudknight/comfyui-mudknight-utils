// custom_nodes/comfyui-mudknight-utils/web/extensions/previews.js

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

app.registerExtension({
    name: "mudknight.BaseNodePreview",
    
    async nodeCreated(node) {
        const nodeTypesWithPreview = [
            "BaseNode",
            "UpscaleNode",
            "DetailerNode",
            "DetailerPipeNode",
            "MaskDetailerNode",
            "MaskDetailerPipeNode"
        ];
        
        if (nodeTypesWithPreview.includes(node.comfyClass)) {
            const origOnExecuted = node.onExecuted;
            
            node.onExecuted = function(message) {
                console.log("onExecuted called with:", message);
                
                // Aggressively clear everything
                this.imgs = null;
                this.imageIndex = null;
                
                // Remove all widgets to prevent conflicts
                if (this.widgets) {
                    const widgetsToRemove = this.widgets.filter(
                        w => w.type === "image_preview" || 
                             w.name?.includes("image")
                    );
                    widgetsToRemove.forEach(w => {
                        const idx = this.widgets.indexOf(w);
                        if (idx !== -1) {
                            this.widgets.splice(idx, 1);
                        }
                    });
                }
                
                // Call original
                if (origOnExecuted) {
                    origOnExecuted.call(this, message);
                }
                
                // Handle images after a delay
                if (message?.images && message.images.length > 0) {
                    // Wait a bit to let everything clear
                    setTimeout(() => {
                        const imageData = message.images[0];
                        const imageUrl = api.apiURL(
                            `/view?filename=${encodeURIComponent(
                                imageData.filename
                            )}&type=${imageData.type}&subfolder=${
                                encodeURIComponent(
                                    imageData.subfolder || ""
                                )
                            }`
                        );
                        
                        console.log("Loading image from:", imageUrl);
                        
                        const img = new Image();
                        img.onload = () => {
                            console.log(
                                "Image loaded, setting imgs"
                            );
                            this.imgs = [img];
                            this.imageIndex = 0;
                            app.graph.setDirtyCanvas(true, true);
                        };
                        img.onerror = (e) => {
                            console.error("Failed to load:", e);
                        };
                        img.src = imageUrl;
                    }, 100);
                }
            };
        }
    }
});
