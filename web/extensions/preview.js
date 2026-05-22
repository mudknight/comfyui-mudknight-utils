import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const NODE_TYPES = [
    "BaseNode", "UpscaleNode", "DetailerNode",
    "DetailerPipeNode", "MaskDetailerNode", "MaskDetailerPipeNode",
    "NestedDetailerNode", "NestedDetailerPipeNode"
];

// LiteGraph.vueNodesMode is the canonical runtime flag for Vue nodes,
// set reactively from the Comfy.VueNodes.Enabled setting.
function isVueWorkflow() {
    return !!window.LiteGraph?.vueNodesMode;
}

// Lazily resolved pinia nodeOutput store. Cached after first access
// since the store instance is stable for the lifetime of the page.
let _nodeOutputStore = null;
function getNodeOutputStore() {
    if (_nodeOutputStore) return _nodeOutputStore;
    const pinia = document.getElementById("vue-app")
        ?.__vue_app__?.config?.globalProperties?.$pinia;
    _nodeOutputStore = pinia?._s?.get("nodeOutput") ?? null;
    return _nodeOutputStore;
}

app.registerExtension({
    name: "mudknight.Preview",

    async nodeCreated(node) {
        if (!NODE_TYPES.includes(node.comfyClass)) return;

        node._customImgs = null;
        node._isExecutionFinished = false;

        const origOnExecuted = node.onExecuted;
        node.onExecuted = function(message) {
            if (origOnExecuted) origOnExecuted.apply(this, arguments);
            if (!message?.images?.length) return;

            if (isVueWorkflow()) {
                // Revoke the live preview blob so the Vue component
                // re-renders using nodeOutputs (full-res) instead.
                getNodeOutputStore()?.revokePreviewsByLocatorId(
                    String(this.id));
                return;
            }

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

            if (isVueWorkflow()) {
                // Remove stale full-res output so only the incoming
                // live preview blob is shown during generation.
                getNodeOutputStore()?.removeNodeOutputs(String(this.id));
            }
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


