import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

app.registerExtension({
    name: "mudknight.Preview",

    async nodeCreated(node) {
        const nodeTypes = [
            "BaseNode", "UpscaleNode", "DetailerNode",
            "DetailerPipeNode", "MaskDetailerNode", "MaskDetailerPipeNode",
            "NestedDetailerNode", "NestedDetailerPipeNode"
        ];

        if (!nodeTypes.includes(node.comfyClass)) return;

        node._customImgs = null;
        node._isExecutionFinished = false;

        const origOnExecuted = node.onExecuted;
        node.onExecuted = function (message) {
            if (origOnExecuted) origOnExecuted.apply(this, arguments);

            if (!message?.images?.length) return;

            const promises = message.images.map(imgData => {
                return new Promise((resolve) => {
                    const url = api.apiURL(
                        `/view?filename=${encodeURIComponent(imgData.filename)}` +
                        `&type=${imgData.type}` +
                        `&subfolder=${encodeURIComponent(imgData.subfolder || "")}`
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
                if (validImages.length > 0) {
                    // Mark execution as finished to lock the images
                    this._isExecutionFinished = true;
                    this._customImgs = validImages;

                    // Directly set the property
                    this.imgs = validImages;
                    this.imageIndex = validImages.length === 1 ? 0 : null;

                    // Manually trigger the widget update
                    const pw = this.widgets?.find(w => w.name === "image_preview");
                    if (pw && pw.onHasImages) {
                        pw.onHasImages(validImages);
                    }

                    this.setDirtyCanvas(true, true);
                }
            });
        };

        const origOnExecutionStart = node.onExecutionStart;
        node.onExecutionStart = function() {
            if (origOnExecutionStart) origOnExecutionStart.apply(this, arguments);
            this._isExecutionFinished = false;
            this._customImgs = null;
        };

        // The "Sentinel": This ensures that the imgs property 
        // always returns our high-res images if they exist, 
        // even if ComfyUI tries to null them out in the background.
        const originalImgsDescriptor = Object.getOwnPropertyDescriptor(node, "imgs");

        Object.defineProperty(node, "imgs", {
            get: function() {
                return this._customImgs || this._internalImgs;
            },
            set: function(val) {
                // If we are finished and have high-res images, 
                // ignore incoming live-preview blobs.
                if (this._isExecutionFinished && this._customImgs) {
                    if (val && val.length > 0 && val[0].src?.startsWith("blob:")) {
                        return; 
                    }
                }
                this._internalImgs = val;
            },
            configurable: true
        });
    }
});
