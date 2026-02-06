import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Mudknight Utils.Shortcuts",
    async setup() {
        const batchId = "Mudknight Utils.Shortcuts.Batch";
        const cancelId = "Mudknight Utils.Shortcuts.CancelRun";

        app.ui.settings.addSetting({
            id: batchId,
            name: "Enable Alt+Up/Down Batch Shortcuts",
            type: "boolean",
            defaultValue: true,
            tooltip: "Alt+Up/Down to change batch count by 1" +
            "Shift+Alt+Up/Down to double/halve batch count"
        });

        app.ui.settings.addSetting({
            id: cancelId,
            name: "Enable Ctrl+Escape Cancel Shortcut",
            type: "boolean",
            defaultValue: true,
            tooltip: "Ctrl+Escape to cancel the current run"
        });

        console.log("[Mudknight Shortcuts] Extension loaded");

        window.addEventListener("keydown", (event) => {
            if (event.ctrlKey && event.key === "Escape") {
                if (app.ui.settings.getSettingValue(cancelId)) {
                    const cancelButton = document.querySelector('button[aria-label="Cancel current run"]');
                    if (cancelButton && !cancelButton.disabled) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        cancelButton.click();
                        return;
                    }
                }
            }

            const batchEnabled = app.ui.settings.getSettingValue(batchId);
            if (!batchEnabled) return;

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
