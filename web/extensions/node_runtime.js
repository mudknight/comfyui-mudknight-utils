import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const SETTING_ID = "Mudknight Utils.Execution Time.enabled";

app.registerExtension({
    name: "Mudknight Utils.Execution Time",

    setup() {
        app.ui.settings.addSetting({
            id: SETTING_ID,
            name: "Show node execution time",
            type: "boolean",
            defaultValue: false,
        });

        const time_map = new Map();
        let last_id = null;

        api.addEventListener("execution_start", () => {
            if (!app.graph) {
                return;
            }

            for (const node of app.graph._nodes) {
                delete node.executionDuration;
            }

            time_map.clear();
            last_id = null;
        });

        api.addEventListener("executing", (e) => {
            if (!app.ui.settings.getSettingValue(SETTING_ID)) {
                return;
            }

            const id = e?.node ?? e?.detail ?? null;

            if (last_id !== null && time_map.has(last_id)) {
                const delta =
                    (performance.now() - time_map.get(last_id)) / 1000;

                const node = app.graph.getNodeById(last_id);
                if (node) {
                    node.executionDuration =
                        (node.executionDuration ?? 0) + delta;
                }

                time_map.delete(last_id);
            }

            last_id = id;
            if (id !== null) {
                time_map.set(id, performance.now());
            }
        });
    },

    beforeRegisterNodeDef(node_type) {
        const orig = node_type.prototype.onDrawForeground;

        node_type.prototype.onDrawForeground = function (ctx) {
            if (
                this.executionDuration &&
                app.ui.settings.getSettingValue(SETTING_ID)
            ) {
                draw_time(ctx, this.executionDuration);
            }

            if (orig) {
                return orig.apply(this, arguments);
            }
        };
    },
});

function draw_time(ctx, seconds) {
    const text = `${seconds.toFixed(3)}s`;

    ctx.save();
    ctx.font = LiteGraph.NODE_TEXT_FONT;

    const padding = 6;
    const w = ctx.measureText(text).width + padding * 2;
    const h = LiteGraph.NODE_TITLE_HEIGHT - 10;
    const x = 0;
    const y = -LiteGraph.NODE_TITLE_HEIGHT - 20;
    const r = 4;

    ctx.fillStyle = LiteGraph.NODE_DEFAULT_BGCOLOR;
    rounded_rect(ctx, x, y, w, h, r);
    ctx.fill();

    ctx.fillStyle = LiteGraph.NODE_TITLE_COLOR;
    ctx.fillText(text, x + padding, y + h - 6);

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

