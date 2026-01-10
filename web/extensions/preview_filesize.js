import { app } from "../../../scripts/app.js";

function formatBytes(bytes, decimals = 2) {
    if (!bytes) {
        return null;
    }

    const k = 1024;
    const dm = Math.max(decimals, 0);
    const sizes = ["B", "KB", "MB", "GB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(dm)} ${sizes[i]}`;
}

async function getImageFileSize(filename, subfolder, type) {
    try {
        const params = new URLSearchParams({
            filename,
            type: type || "output",
            subfolder: subfolder || ""
        });

        const res = await fetch(`/view?${params.toString()}`, {
            method: "HEAD"
        });

        const len = res.headers.get("content-length");
        return len ? parseInt(len, 10) : null;
    } catch {
        return null;
    }
}

app.registerExtension({
    name: "Mudknight Utils.Filesize",

    settings: [
        {
            id: "Mudknight Utils.Filesize.display",
            name: "Show image file size",
            type: "boolean",
            defaultValue: true
        }
    ],

    async nodeCreated(node) {
        const origExecuted = node.onExecuted;

        node.onExecuted = async function (message) {
            if (origExecuted) {
                origExecuted.call(this, message);
            }

            if (!message?.images) {
                return;
            }

            for (const img of message.images) {
                if (!img.filename) {
                    continue;
                }

                const size = await getImageFileSize(
                    img.filename,
                    img.subfolder,
                    img.type
                );

                if (size != null) {
                    img.fileSize = size;
                }
            }

            if (this.images) {
                for (let i = 0; i < this.images.length; i += 1) {
                    this.images[i].fileSize = message.images[i]?.fileSize;
                }
            }

            app.graph.setDirtyCanvas(true);
        };

        const origDraw = node.onDrawForeground;

        node.onDrawForeground = function (ctx) {
            if (origDraw) {
                origDraw.apply(this, arguments);
            }

            if (
                !app.ui.settings.getSettingValue(
                    "Mudknight Utils.Filesize.display"
                )
            ) {
                return;
            }

            const bytes = this.images?.[0]?.fileSize;
            if (!bytes) {
                return;
            }

            draw_filesize(ctx, this, bytes);
        };
    }
});

function draw_filesize(ctx, node, bytes) {
    const text = formatBytes(bytes);
    if (!text) {
        return;
    }

    ctx.save();
    ctx.font = "10px sans-serif";

    const padding = 4;
    const margin = 2;
    const textWidth = ctx.measureText(text).width;

    const w = textWidth + padding * 2;
    const h = 14;
    const r = 4;

    const x = (node.size[0] - w) / 2;
    const y = node.size[1] + margin;

    ctx.fillStyle =
        node.color || LiteGraph.NODE_DEFAULT_COLOR;

    rounded_rect(ctx, x, y, w, h, r);
    ctx.fill();

    ctx.fillStyle = LiteGraph.NODE_TITLE_COLOR;
    ctx.fillText(text, x + padding, y + h - 4);

    ctx.restore();
}

function rounded_rect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

