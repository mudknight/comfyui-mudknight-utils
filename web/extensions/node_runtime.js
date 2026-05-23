import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
    setVueBadge,
    clearVueBadges,
    startBadgeObserver
} from "../modules/node_badges.js";

const SETTING_ID = "Mudknight Utils.Execution Time.enabled";
const SETTING_COLOR = "Mudknight Utils.Execution Time.color";
const BADGE_CLASS = "mk-exec-time";
const BADGE_EXTRA = ["ml-auto"];

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

app.registerExtension({
    name: "Mudknight Utils.Execution Time",

    setup() {
        startBadgeObserver();

        app.ui.settings.addSetting({
            id: SETTING_ID,
            name: "Show node execution time",
            type: "boolean",
            defaultValue: false,
        });

        app.ui.settings.addSetting({
            id: SETTING_COLOR,
            name: "Execution time badge color",
            type: "combo",
            defaultValue: "None",
            options: COLOR_PRESETS.map(([label]) => label),
        });

        const timeMap = new Map();
        // Map of nodeId -> elapsed seconds, kept for display.
        const durationMap = new Map();
        let lastId = null;

        api.addEventListener("execution_start", () => {
            // Clear all durations and badges on a new run.
            durationMap.clear();
            timeMap.clear();
            lastId = null;

            if (!app.graph) return;
            for (const node of app.graph._nodes) {
                node.executionDuration = undefined;
                clearVueBadges(String(node.id));
            }
        });

        api.addEventListener("executing", (e) => {
            // The executing event detail is the node ID directly.
            const id = e.detail ?? null;

            // Record elapsed time for the previously executing node.
            if (lastId !== null && timeMap.has(lastId)) {
                const delta =
                    (performance.now() - timeMap.get(lastId)) / 1000;
                durationMap.set(lastId, delta);

                if (app.ui.settings.getSettingValue(SETTING_ID)) {
                    const text = `${delta.toFixed(3)}s`;
                    // LiteGraph node.
                    const node = app.graph?.getNodeById(lastId);
                    if (node) node.executionDuration = delta;
                    // Vue node DOM badge.
                    const label = app.ui.settings
                        .getSettingValue(SETTING_COLOR) ?? "None";
                    const color = COLOR_PRESETS.find(
                        ([l]) => l === label)?.[1] ?? null;
                    setVueBadge(
                        BADGE_CLASS, BADGE_EXTRA, String(lastId),
                        text, color
                    );
                }

                timeMap.delete(lastId);
            }

            lastId = id;
            if (id !== null) timeMap.set(id, performance.now());
        });
    },

    beforeRegisterNodeDef(nodeType) {
        const orig = nodeType.prototype.onDrawForeground;

        // LiteGraph canvas rendering path.
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (
                this.executionDuration
                && app.ui.settings.getSettingValue(SETTING_ID)
            ) {
                drawTime(ctx, this.executionDuration);
            }

            if (orig) return orig.apply(this, arguments);
        };
    },
});

function drawTime(ctx, seconds) {
    const text = `${seconds.toFixed(3)}s`;

    ctx.save();
    ctx.font = "12px sans-serif";

    const padding = 4;
    const w = ctx.measureText(text).width + padding * 2;
    const h = LiteGraph.NODE_TITLE_HEIGHT - 10;
    const x = 0;
    const y = -LiteGraph.NODE_TITLE_HEIGHT - 22;
    const r = 4;

    ctx.fillStyle = LiteGraph.NODE_DEFAULT_BGCOLOR;
    roundedRect(ctx, x, y, w, h, r);
    ctx.fill();

    ctx.fillStyle = LiteGraph.NODE_TITLE_COLOR;
    ctx.fillText(text, x + padding, y + h - 6);

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

