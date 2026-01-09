import { app } from "../../../scripts/app.js";

app.registerExtension({
	name: "Mudknight Utils.Input",
	settings: [
		{
			id: "Mudknight Utils.Input.ShiftDelete",
			name: "Enable Shift+Delete (Clear Line)",
			type: "boolean",
			defaultValue: true,
		},
		{
			id: "Mudknight Utils.Input.WeightSelection",
			name: "Enable Enhanced Tag Selection (Ctrl+Up/Down)",
			type: "boolean",
			defaultValue: true,
		},
		{
			id: "Mudknight Utils.Input.LoraWeight",
			name: "Enable Lora Weight Adjustment (Ctrl+Up/Down)",
			type: "boolean",
			defaultValue: true,
		},
		{
			id: "Mudknight Utils.Input.LoraStep",
			name: "Lora Weight Step Value",
			type: "number",
			defaultValue: 0.1,
		}
	],
	async setup() {
		const handleKeyDown = (e) => {
			const target = e.target;
			if (target.tagName !== "TEXTAREA") return;

			const shiftDeleteEnabled = app.ui.settings.getSettingValue(
				"Mudknight Utils.Input.ShiftDelete"
			);
			const weightSelectEnabled = app.ui.settings.getSettingValue(
				"Mudknight Utils.Input.WeightSelection"
			);
			const loraWeightEnabled = app.ui.settings.getSettingValue(
				"Mudknight Utils.Input.LoraWeight"
			);
			const loraStep = app.ui.settings.getSettingValue(
				"Mudknight Utils.Input.LoraStep"
			);

			const value = target.value;
			const start = target.selectionStart;
			const end = target.selectionEnd;

			// 1. Shift + Delete logic
			if (e.key === "Delete" && e.shiftKey && shiftDeleteEnabled) {
				const lastNewline = value.lastIndexOf("\n", start - 1);
				const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;

				let nextNewline = value.indexOf("\n", start);
				if (nextNewline === -1) nextNewline = value.length;

				target.value = value.substring(0, lineStart) + 
							  value.substring(nextNewline);
				target.selectionStart = target.selectionEnd = lineStart;

				this.finalizeEvent(e, target);
			}

			// 2. Lora and Tag Weighting (Ctrl + Up/Down)
			if ((e.key === "ArrowUp" || e.key === "ArrowDown") && 
				e.ctrlKey) {
				
				if (loraWeightEnabled) {
					const loraRegex = /<lora:([^:]+):([^>]+)>/g;
					let match;
					while ((match = loraRegex.exec(value)) !== null) {
						const mStart = match.index;
						const mEnd = match.index + match[0].length;

						if (start >= mStart && start <= mEnd) {
							const name = match[1];
							let weight = parseFloat(match[2]);
							if (isNaN(weight)) weight = 1.0;

							const dir = e.key === "ArrowUp" ? 1 : -1;
							const step = loraStep || 0.05;
							weight = Math.round((weight + (dir * step)) * 100) / 100;

							const newLora = `<lora:${name}:${weight.toFixed(2)}>`;
							target.value = value.substring(0, mStart) + 
										  newLora + 
										  value.substring(mEnd);
							
							target.selectionStart = target.selectionEnd = start;
							this.finalizeEvent(e, target);
							return;
						}
					}
				}

				if (weightSelectEnabled && start === end) {
					const before = value.substring(0, start);
					const after = value.substring(start);

					const sMatch = before.lastIndexOf(",");
					const eMatch = after.indexOf(",");

					let tagStart = sMatch === -1 ? 0 : sMatch + 1;
					let tagEnd = eMatch === -1 ? 
								 value.length : start + eMatch;

					const tagContent = value.substring(tagStart, tagEnd);
					const leading = tagContent.search(/\S/);
					const trailing = tagContent.length - 
									 tagContent.trimEnd().length;

					if (leading !== -1) {
						target.selectionStart = tagStart + leading;
						target.selectionEnd = tagEnd - trailing;
					}
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown, true);
	},

	finalizeEvent(e, target) {
		e.preventDefault();
		e.stopPropagation();
		target.dispatchEvent(new Event("input", { bubbles: true }));
	}
});
