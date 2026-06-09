import { app } from "../../../scripts/app.js";
import {
    setVueBadge,
    startBadgeObserver
} from "../modules/node_badges.js";

const SETTING_ID = "Mudknight Utils.Filesize.display";
const SETTING_COLOR = "Mudknight Utils.Filesize.color";
const BADGE_CLASS = "mk-filesize";
const BADGE_EXTRA = ["absolute", "left-1/2", "-translate-x-1/2"];

// Semantic theme colors available as badge background presets.
// Values are CSS custom property names defined by the ComfyUI theme.
const COLOR_PRESETS = [
    ["None",   null],
    ["Grey",   "--muted-background"],
    ["Blue",   "--primary-background"],
    ["Yellow", "--warning-background"],
    ["Green",  "--success-background"],
    ["Red",    "--color-error"],
];

function formatBytes(bytes, decimals = 2) {
    if (!bytes) return null;

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

    setup() {
        startBadgeObserver();
    },

    settings: [
        {
            id: SETTING_ID,
            name: "Show image file size",
            type: "boolean",
            defaultValue: true
        },
        {
            id: SETTING_COLOR,
            name: "Filesize badge color",
            type: "combo",
            defaultValue: "None",
            options: COLOR_PRESETS.map(([label]) => label),
        }
    ],

    async nodeCreated(node) {
        const origExecuted = node.onExecuted;

        node.onExecuted = async function(message) {
            if (origExecuted) origExecuted.call(this, message);
            if (!message?.images) return;

            if (!app.ui.settings.getSettingValue(SETTING_ID)) return;

            // Use fileSize from the message if already provided by the
            // backend, otherwise fall back to a HEAD request.
            for (const img of message.images) {
                if (!img.filename) continue;
                if (img.fileSize == null) {
                    img.fileSize = await getImageFileSize(
                        img.filename, img.subfolder, img.type
                    );
                }
            }

            const bytes = message.images[0]?.fileSize;
            const text = formatBytes(bytes);

            // Vue node: inject into footer DOM.
            if (text) {
                const label = app.ui.settings
                    .getSettingValue(SETTING_COLOR) ?? "None";
                const color = COLOR_PRESETS.find(
                    ([l]) => l === label)?.[1] ?? null;
                setVueBadge(
                    BADGE_CLASS, BADGE_EXTRA, String(this.id),
                    text, color, "file"
                );
            }

            // LiteGraph node: store on images array for onDrawForeground.
            if (this.images) {
                for (let i = 0; i < this.images.length; i += 1) {
                    this.images[i].fileSize = message.images[i]?.fileSize;
                }
            }

            app.graph.setDirtyCanvas(true);
        };

        const origDraw = node.onDrawForeground;

        // LiteGraph canvas rendering path.
        node.onDrawForeground = function(ctx) {
            if (origDraw) origDraw.apply(this, arguments);

            if (!app.ui.settings.getSettingValue(SETTING_ID)) return;

            const bytes = this.images?.[0]?.fileSize;
            if (!bytes) return;

            drawFilesize(ctx, this, bytes);
        };
    }
});

function drawFilesize(ctx, node, bytes) {
    const text = formatBytes(bytes);
    if (!text) return;

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

    ctx.fillStyle = node.color || LiteGraph.NODE_DEFAULT_COLOR;
    roundedRect(ctx, x, y, w, h, r);
    ctx.fill();

    ctx.fillStyle = LiteGraph.NODE_TITLE_COLOR;
    ctx.fillText(text, x + padding, y + h - 4);

    ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
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
