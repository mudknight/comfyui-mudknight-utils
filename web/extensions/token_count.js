import { app } from "../../../scripts/app.js";

app.registerExtension({
	name: "testing.TokenCounter",
	init() {
		app.ui.settings.addSetting({
			id: "testing.Utils.input.showTokens",
			name: "Show Token Count",
			type: "boolean",
			defaultValue: true,
		});
	},
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		const onNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

			requestAnimationFrame(() => {
				if (!this.widgets) return;

				this.widgets.forEach((widget) => {
					if (widget.element?.tagName === "TEXTAREA" || widget.type === "customtext") {
						const inputEl = widget.inputEl || widget.element;
						if (!inputEl || !inputEl.parentElement) return;

						if (inputEl.parentElement.querySelector(".comfy-token-counter")) return;

						const counter = document.createElement("div");
						counter.className = "comfy-token-counter";
						
						Object.assign(counter.style, {
							position: "absolute",
							top: "-12px",
							right: "4px",
							fontSize: "10px",
							// Use theme text color
							color: "var(--desc-color)",
							pointerEvents: "none",
							zIndex: "1000",
							fontFamily: "monospace",
							width: "fit-content",
							height: "auto",
							display: "inline-block",
							// Use theme background and border colors
							backgroundColor: "var(--comfy-menu-bg)",
							padding: "1px 5px",
							borderRadius: "4px",
							border: "1px solid var(--border-color)",
							opacity: "0",
							transition: "opacity 0.2s ease",
							boxShadow: "0 0 4px rgba(0,0,0,0.5)"
						});

						const update = () => {
							const val = inputEl.value || "";
							const tokens = val.split(/\s+/).filter(Boolean).length;
							counter.innerText = tokens;
						};

						const checkVisibility = (isFocused) => {
							const enabled = app.ui.settings.getSettingValue(
								"Mudknight.Utils.input.showTokens", 
								true
							);
							counter.style.opacity = (isFocused && enabled) ? "1" : "0";
						};

						inputEl.addEventListener("focus", () => checkVisibility(true));
						inputEl.addEventListener("blur", () => checkVisibility(false));
						inputEl.addEventListener("input", update, { passive: true });
						
						inputEl.parentElement.style.position = "relative";
						inputEl.parentElement.appendChild(counter);
						
						update();
					}
				});
			});

			return r;
		};
	},
});
