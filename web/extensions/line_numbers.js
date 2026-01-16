import { app } from "/scripts/app.js";

// CSS styles embedded in JS
const styles = `
.comfy-line-numbers-overlay {
	position: absolute;
	top: 0;
	right: calc(100% + 0px);
	pointer-events: none;
	user-select: none;
	overflow: hidden;
	// background: var(--component-node-background);
	// border: 1px solid var(--component-node-widget-background);
	background: var(--component-node-widget-background);
	border: 2px solid var(--component-node-border);
	border-radius: 5px 0px 0px 5px;
	font-family: monospace;
	font-size: inherit;
	line-height: inherit;
	// color: rgba(255, 255, 255, 0.4);
	color: var(--node-component-header-icon);
	padding: 0px 2px;
	z-index: 1;
	box-sizing: border-box;
	min-width: 10px;
	max-width: 60px;
	opacity: 0.7;
}

.comfy-line-numbers-overlay.hidden {
	display: none;
}

.comfy-line-number {
	text-align: right;
	white-space: nowrap;
	display: block;
}

.comfy-line-number.current-line {
	color: var(--component-node-foreground);
	font-weight: bold;
}

.comfy-textarea-with-line-numbers {
	position: relative;
}
`;

// Inject styles
const styleSheet = document.createElement("style");
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

class LineNumberManager {
	constructor() {
		this.overlays = new WeakMap();
		this.enabled = true;
	}

	getOrCreateOverlay(textarea) {
		if (this.overlays.has(textarea)) {
			return this.overlays.get(textarea);
		}

		const overlay = document.createElement("div");
		overlay.className = "comfy-line-numbers-overlay hidden";
		
		// Ensure textarea parent has relative positioning
		const parent = textarea.parentElement;
		if (parent && !parent.classList.contains("comfy-textarea-with-line-numbers")) {
			const computedStyle = window.getComputedStyle(parent);
			if (computedStyle.position === "static") {
				parent.style.position = "relative";
			}
			parent.classList.add("comfy-textarea-with-line-numbers");
		}

		// Insert overlay after textarea (but it will float to the left due to CSS)
		textarea.parentElement.insertBefore(overlay, textarea);

		this.overlays.set(textarea, overlay);
		return overlay;
	}

	updateLineNumbers(textarea, overlay) {
		if (!this.enabled) return;

		const value = textarea.value || "";
		const lines = value.split("\n");
		const lineCount = lines.length;

		// Get current line
		const cursorPos = textarea.selectionStart;
		const textBeforeCursor = value.substring(0, cursorPos);
		const currentLineNumber = textBeforeCursor.split("\n").length;

		// Calculate max width needed (number of digits)
		const maxDigits = lineCount.toString().length;
		const estimatedWidth = Math.max(16, maxDigits * 8 + 8); // More accurate width estimation

		// Set overlay width
		overlay.style.width = `${estimatedWidth}px`;

		// Build line numbers HTML
		let html = "";
		for (let i = 1; i <= lineCount; i++) {
			const isCurrent = i === currentLineNumber;
			const className = isCurrent ? "comfy-line-number current-line" : "comfy-line-number";
			html += `<div class="${className}">${i}</div>`;
		}

		overlay.innerHTML = html;

		// Update overlay position only (dimensions already set above)
		this.syncOverlayPosition(textarea, overlay);
	}

	syncOverlayPosition(textarea, overlay) {
		const style = window.getComputedStyle(textarea);
		const lineHeight = style.lineHeight;
		const fontSize = style.fontSize;
		const paddingTop = style.paddingTop;
		const paddingLeft = style.paddingLeft;

		// Position overlay - float outside textarea on the left
		overlay.style.top = paddingTop;
		overlay.style.height = `calc(100% - ${paddingTop} - ${style.paddingBottom})`;
		overlay.style.lineHeight = lineHeight;
		overlay.style.fontSize = fontSize;

		// Sync scroll position
		overlay.scrollTop = textarea.scrollTop;

		// No need to adjust textarea padding since overlay floats outside
	}

	showLineNumbers(textarea) {
		if (!this.enabled) return;

		const overlay = this.getOrCreateOverlay(textarea);
		overlay.classList.remove("hidden");
		this.updateLineNumbers(textarea, overlay);
	}

	hideLineNumbers(textarea) {
		const overlay = this.overlays.get(textarea);
		if (overlay) {
			overlay.classList.add("hidden");
			// No need to reset padding since we don't modify it
		}
	}

	

	handleScroll(textarea) {
		const overlay = this.overlays.get(textarea);
		if (overlay && !overlay.classList.contains("hidden")) {
			overlay.scrollTop = textarea.scrollTop;
		}
	}

	handleInput(textarea) {
		const overlay = this.overlays.get(textarea);
		if (overlay && !overlay.classList.contains("hidden")) {
			this.updateLineNumbers(textarea, overlay);
		}
	}

	handleSelectionChange(textarea) {
		const overlay = this.overlays.get(textarea);
		if (overlay && !overlay.classList.contains("hidden")) {
			// Only update current line highlighting
			this.updateLineNumbers(textarea, overlay);
		}
	}

	setEnabled(enabled) {
		this.enabled = enabled;
		if (!enabled) {
			// Hide all overlays
			document.querySelectorAll("textarea").forEach(textarea => {
				this.hideLineNumbers(textarea);
			});
		}
	}
}

const lineNumberManager = new LineNumberManager();

app.registerExtension({
	name: "Mudknight Utils.Line Numbers",
	settings: [
		{
			id: "Mudknight Utils.Line Numbers.Enabled",
			name: "Enable Line Numbers in Textareas",
			type: "boolean",
			defaultValue: true,
			tooltip: "Show line numbers on the left side of multiline text inputs when focused",
			onChange: (value) => {
				lineNumberManager.setEnabled(value);
			}
		}
	],
	async setup() {
		// Get initial setting
		const enabled = app.ui.settings.getSettingValue(
			"Mudknight Utils.Line Numbers.Enabled",
		);
		lineNumberManager.setEnabled(enabled);

		// Track active textarea for selection changes
		let activeTextarea = null;

		// Use event delegation for better performance
		document.addEventListener("focus", (e) => {
			const target = e.target;
			if (target.tagName === "TEXTAREA") {
				const enabled = app.ui.settings.getSettingValue(
					"Mudknight Utils.Line Numbers.Enabled",
				);
				if (enabled) {
					activeTextarea = target;
					lineNumberManager.showLineNumbers(target);
				}
			}
		}, true);

		document.addEventListener("blur", (e) => {
			const target = e.target;
			if (target.tagName === "TEXTAREA") {
				activeTextarea = null;
				lineNumberManager.hideLineNumbers(target);
			}
		}, true);

		document.addEventListener("input", (e) => {
			const target = e.target;
			if (target.tagName === "TEXTAREA") {
				lineNumberManager.handleInput(target);
			}
		}, true);

		document.addEventListener("scroll", (e) => {
			const target = e.target;
			if (target.tagName === "TEXTAREA") {
				lineNumberManager.handleScroll(target);
			}
		}, true);

		// Handle selection changes (for current line highlighting)
		document.addEventListener("selectionchange", () => {
			if (activeTextarea && document.activeElement === activeTextarea) {
				lineNumberManager.handleSelectionChange(activeTextarea);
			}
		});

		// Handle textarea resize (using ResizeObserver if available)
		if (typeof ResizeObserver !== "undefined") {
			const resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const textarea = entry.target;
					if (textarea.tagName === "TEXTAREA") {
						const overlay = lineNumberManager.overlays.get(textarea);
						if (overlay && !overlay.classList.contains("hidden")) {
							lineNumberManager.syncOverlayPosition(textarea, overlay);
						}
					}
				}
			});

			// Observe textareas as they appear
			const textareaObserver = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					mutation.addedNodes.forEach((node) => {
						if (node.tagName === "TEXTAREA") {
							resizeObserver.observe(node);
						} else if (node.querySelectorAll) {
							node.querySelectorAll("textarea").forEach((textarea) => {
								resizeObserver.observe(textarea);
							});
						}
					});
				});
			});

			textareaObserver.observe(document.body, {
				childList: true,
				subtree: true
			});

			// Observe existing textareas
			document.querySelectorAll("textarea").forEach((textarea) => {
				resizeObserver.observe(textarea);
			});
		}
	}
});
