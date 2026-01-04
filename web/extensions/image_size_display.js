import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";

app.registerExtension({
    name: "ImageFileSize.Display",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "ImageFileSize") {
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                onExecuted?.apply(this, arguments);

                if (message?.text) {
                    const sizeText = message.text.join('');
                    
                    // Remove existing widget if present
                    if (this.widgets) {
                        for (let i = 0; i < this.widgets.length; i++) {
                            this.widgets[i].onRemove?.();
                        }
                        this.widgets.length = 0;
                    }

                    // Create widget with multiline
                    const w = ComfyWidgets["STRING"](
                        this, 
                        "", 
                        ["STRING", { multiline: true }], 
                        app
                    ).widget;
                    
                    w.inputEl.readOnly = true;
                    w.inputEl.style.opacity = 0.6;
                    w.inputEl.rows = 1;
                    w.inputEl.style.height = "20px";
                    w.inputEl.style.maxHeight = "20px";
                    w.inputEl.style.overflow = "hidden";
                    w.inputEl.style.resize = "none";
                    w.value = sizeText;
                    
                    // Set widget height
                    w.computeSize = function(width) {
                        return [width, 25];
                    };

                    requestAnimationFrame(() => {
                        const sz = this.computeSize();
                        if (sz[0] < this.size[0]) {
                            sz[0] = this.size[0];
                        }
                        if (sz[1] < this.size[1]) {
                            sz[1] = this.size[1];
                        }
                        this.onResize?.(sz);
                        app.graph.setDirtyCanvas(true, false);
                    });
                }
            };
        }
    }
});
