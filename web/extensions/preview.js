import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const NODE_TYPES = [
    "BaseNode", "UpscaleNode", "DetailerNode",
    "DetailerPipeNode", "MaskDetailerNode", "MaskDetailerPipeNode",
    "NestedDetailerNode", "NestedDetailerPipeNode"
];

// Check if Vue nodes mode is active. LiteGraph.vueNodesMode is the
// canonical runtime flag set from the Comfy.VueNodes.Enabled setting.
function isVueWorkflow() {
    return !!window.LiteGraph?.vueNodesMode;
}

app.registerExtension({
    name: "mudknight.Preview",

    async init() {
        // Intercept the 'executed' event before the app's handler
        // (registered in addApiUpdateHandlers, which runs after init).
        // getNodeImageUrls prioritises nodePreviewImages (blobs) over
        // nodeOutputs, so the Vue watcher would load the low-res blob
        // instead of the full-res output. Deleting the blob here first
        // ensures the watcher only sees nodeOutputs.
        api.addEventListener("executed", (event) => {
            if (!isVueWorkflow()) return;
            const nodeId = String(
                event.detail?.display_node || event.detail?.node
            );
            if (!nodeId) return;

            const graph = app.rootGraph ?? app.graph;
            const node = graph?.getNodeById(Number(nodeId));
            if (!node || !NODE_TYPES.includes(node.comfyClass)) return;

            delete app.nodePreviewImages[nodeId];
        });
    },

    async nodeCreated(node) {
        if (!NODE_TYPES.includes(node.comfyClass)) return;

        node._customImgs = null;
        node._isExecutionFinished = false;

        const origOnExecuted = node.onExecuted;
        node.onExecuted = function(message) {
            if (origOnExecuted) origOnExecuted.apply(this, arguments);
            if (!message?.images?.length) return;

            // Vue mode is handled entirely by the init-phase
            // 'executed' listener; nothing to do here.
            if (isVueWorkflow()) return;

            // LiteGraph path: load full-res images and lock them in
            // via the imgs sentinel defined below.
            const promises = message.images.map(imgData => {
                return new Promise(resolve => {
                    const url = api.apiURL(
                        `/view?filename=${encodeURIComponent(imgData.filename)}`
                        + `&type=${imgData.type}`
                        + `&subfolder=${encodeURIComponent(
                            imgData.subfolder || "")}`
                    );
                    const img = new Image();
                    img.onload = () => {
                        img.format = imgData.format;
                        resolve(img);
                    };
                    img.onerror = () => resolve(null);
                    img.src = url;
                });
            });

            Promise.all(promises).then(images => {
                const validImages = images.filter(i => i !== null);
                if (!validImages.length) return;

                this._isExecutionFinished = true;
                this._customImgs = validImages;
                this.imgs = validImages;
                this.imageIndex = validImages.length === 1 ? 0 : null;

                const pw = this.widgets?.find(
                    w => w.name === "image_preview"
                );
                if (pw?.onHasImages) pw.onHasImages(validImages);

                this.setDirtyCanvas(true, true);
            });
        };

        const origOnExecutionStart = node.onExecutionStart;
        node.onExecutionStart = function() {
            if (origOnExecutionStart) {
                origOnExecutionStart.apply(this, arguments);
            }
            this._isExecutionFinished = false;
            this._customImgs = null;
        };

        // LiteGraph only: sentinel to prevent ComfyUI from overwriting
        // high-res images with incoming live-preview blobs after
        // execution finishes. Skipped for Vue nodes since their display
        // is driven by the reactive store, not node.imgs.
        Object.defineProperty(node, "imgs", {
            get: function() {
                return this._customImgs || this._internalImgs;
            },
            set: function(val) {
                if (isVueWorkflow()) {
                    // Let the store manage display; don't fight it.
                    this._internalImgs = val;
                    return;
                }
                // Block incoming blob previews once we have high-res.
                if (this._isExecutionFinished && this._customImgs) {
                    if (val?.length > 0
                            && val[0].src?.startsWith("blob:")) {
                        return;
                    }
                }
                this._internalImgs = val;
            },
            configurable: true
        });
    }
});


