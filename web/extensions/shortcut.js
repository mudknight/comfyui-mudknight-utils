import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Mudknight Utils.Shortcuts",
    async setup() {
        const id = "Mudknight Utils.Shortcuts.Batch";

        app.ui.settings.addSetting({
            id,
            name: "Enable Alt+Up/Down Batch Shortcuts",
            type: "boolean",
            defaultValue: true,
            tooltip: "Alt+Up/Down to change batch count by 1" +
            "Shift+Alt+Up/Down to double/halve batch count"
        });

        console.log("[Mudknight Shortcuts] Extension loaded");

        window.addEventListener("keydown", (event) => {
            const enabled = app.ui.settings.getSettingValue(id);
            if (!enabled) return;

            const isUp = event.key === "ArrowUp";
            const isDown = event.key === "ArrowDown";

            if (event.altKey && (isUp || isDown)) {
                const container = document.querySelector(".batch-count");
                const input = container?.querySelector("input");

                if (!input) return;

                event.preventDefault();
                event.stopImmediatePropagation();

                let val = parseInt(input.value, 10) || 1;
                const min = parseInt(input.getAttribute("aria-valuemin"), 10) || 1;
                const max = parseInt(input.getAttribute("aria-valuemax"), 10) || 100;

                const oldVal = val;
                if (event.shiftKey) {
                    if (isUp) val = Math.min(val * 2, max);
                    if (isDown) val = Math.max(Math.floor(val / 2), min);
                } else {
                    if (isUp && val < max) val++;
                    if (isDown && val > min) val--;
                }

                if (oldVal !== val) {
                    input.value = val;
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    input.dispatchEvent(new Event("blur", { bubbles: true }));
                }
            }
        }, true);
    }
});
