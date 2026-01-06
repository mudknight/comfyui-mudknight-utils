import { app } from "../../../scripts/app.js";

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function getImageFileSize(filename, subfolder, type) {
    try {
        const params = new URLSearchParams({
            filename: filename,
            type: type || 'output',
            subfolder: subfolder || ''
        });

        const response = await fetch(`/view?${params.toString()}`, {
            method: 'HEAD'
        });

        const contentLength = response.headers.get('content-length');
        return contentLength ? parseInt(contentLength) : null;
    } catch (error) {
        return null;
    }
}

app.registerExtension({
    name: "Mudknight Utils.Filesize",

    settings: [
        {
            id: "Mudknight Utils.Filesize.display",
            name: "Show Image File Size",
            type: "boolean",
            defaultValue: true,
            tooltip: "Display file size on image preview nodes.",
        },
    ],

    async nodeCreated(node) {
        const originalOnExecuted = node.onExecuted;

        node.onExecuted = async function(message) {
            if (originalOnExecuted) {
                originalOnExecuted.call(this, message);
            }

            if (message && message.images) {
                for (const img of message.images) {
                    if (img.filename) {
                        const fileSize = await getImageFileSize(
                            img.filename,
                            img.subfolder,
                            img.type
                        );
                        if (fileSize !== null) {
                            img.fileSize = fileSize;
                        }
                    }
                }

                if (this.images) {
                    for (let i = 0; i < this.images.length && i < message.images.length; i++) {
                        if (message.images[i].fileSize) {
                            this.images[i].fileSize = message.images[i].fileSize;
                        }
                    }
                }

                app.graph.setDirtyCanvas(true);
            }
        };

        const originalDrawForeground = node.onDrawForeground;

        node.onDrawForeground = function(ctx) {
            if (originalDrawForeground) {
                originalDrawForeground.apply(this, arguments);
            }

            const enabled = app.ui.settings.getSettingValue(
                "Mudknight Utils.Filesize.display",
            );

            if (!enabled) {
                return;
            }

            if (this.images && this.images.length > 0 && this.images[0].fileSize) {
                const text = formatBytes(this.images[0].fileSize);

                ctx.save();
                ctx.globalCompositeOperation = 'source-over';

                const padding_x = 5;
                const padding_y = 0;
                const fontSize = 10;
                const offsetX = 0;
                const offsetY = 3;
                const borderRadius = 5;

                ctx.font = `${fontSize}px sans-serif`;
                ctx.textBaseline = 'bottom';

                const textWidth = ctx.measureText(text).width;
                const x = this.size[0] - textWidth - padding_x * 2 - offsetX;
                const y = this.size[1] - padding_y - offsetY;

                const rectX = x - padding_x;
                const rectY = y - fontSize - padding_y;
                const rectWidth = textWidth + padding_x * 2;
                const rectHeight = fontSize + padding_y * 2;

                ctx.fillStyle = this.color || LiteGraph.NODE_DEFAULT_COLOR; // Use node titlebar color
                ctx.beginPath();
                ctx.roundRect(rectX, rectY, rectWidth, rectHeight, borderRadius);
                ctx.fill();

                ctx.fillStyle = LiteGraph.NODE_TITLE_COLOR;
                ctx.fillText(text, x, y);

                ctx.restore();
            }
        };
    }
});

console.log("[ImageFileSize] Extension registered successfully");
