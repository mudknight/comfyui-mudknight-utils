import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Mudknight Utils.PrefixLabelStyling",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

            // Use a small delay or the 'onAdded' lifecycle to ensure LiteGraph finished setup
            const setupLabels = () => {
                if (!this.widgets) return;

                for (let i = this.widgets.length - 1; i >= 0; i--) {
                    const widget = this.widgets[i];

                    if (widget.name && widget.name.startsWith("label_")) {
                        // 1. Change type to something ComfyUI won't try to 'fix'
                        widget.type = "info";

                        // 2. Kill all interaction
                        widget.disabled = true;
                        widget.mouse = () => false;
                        widget.inputEl = null;

                        // 3. Force remove the input socket if it exists
                        if (this.inputs) {
                            const inputIndex = this.inputs.findIndex(input => input.name === widget.name);
                            if (inputIndex !== -1) {
                                this.removeInput(inputIndex);
                            }
                        }

                        // 4. Custom Draw Logic
                        widget.draw = function (ctx, node, widget_width, y, widget_height) {
                            // Hide the background and border by doing nothing but drawing text
                            const margin = 10;
                            ctx.save();
                            ctx.font = "12px sans-serif";
                            ctx.fillStyle = "#888";
                            ctx.fillText(String(this.value), margin, y + (widget_height / 1.5));
                            ctx.restore();
                        };

                        widget.computeSize = (width) => [width, 20];
                    }
                }
                this.setDirtyCanvas(true, true);
            };

            // Execute immediately and also on a tiny timeout to catch race conditions
            setupLabels();
            setTimeout(setupLabels, 1);

            return r;
        };
    },
});
