import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const SETTING_ID = "Mudknight Utils.Execution Time.enabled";

// Badge element ID injected into the Vue node footer.
const BADGE_CLASS = "mk-exec-time";

// Sets or removes the time badge in a Vue node's footer bar.
// The footer bar is the mt-auto flex row that also contains the #id badge.
function setVueBadge(nodeId, text) {
    const footer = document.querySelector(
        `[data-node-id="${nodeId}"] .mt-auto`
    );
    if (!footer) return;

    let badge = footer.querySelector(`.${BADGE_CLASS}`);

    if (!text) {
        badge?.remove();
        return;
    }

    if (!badge) {
        badge = document.createElement("div");
        badge.className = [
            BADGE_CLASS,
            "flex", "h-6", "items-center", "justify-center",
            "overflow-clip", "rounded-full",
            "bg-component-node-widget-background",
            "ml-auto"
        ].join(" ");
        const inner = document.createElement("div");
        inner.className = [
            "flex", "min-w-max", "items-center", "gap-1",
            "rounded-sm", "px-1", "py-0.5", "text-xs", "h-6",
            "first:pl-2", "last:pr-2"
        ].join(" ");
        inner.style.cssText = "color: currentcolor; background-color: transparent;";
        badge.appendChild(inner);
        footer.appendChild(badge);
    }

    badge.querySelector("div").textContent = text;
}

app.registerExtension({
    name: "Mudknight Utils.Execution Time",

    setup() {
        app.ui.settings.addSetting({
            id: SETTING_ID,
            name: "Show node execution time",
            type: "boolean",
            defaultValue: false,
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
                setVueBadge(node.id, null);
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
                    setVueBadge(lastId, text);
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

