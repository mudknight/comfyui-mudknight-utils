// Shared utility for injecting persistent badges into Vue node footer bars.
// Badges are stored in a registry and re-applied whenever a node's DOM
// element is (re)mounted, handling workflow switches and collapse/expand.

// Registry: nodeId (string) -> Map of badgeClass -> { text, className }
const registry = new Map();

// Sets or removes a badge in a Vue node's footer bar and persists it
// in the registry so it survives re-renders.
//
// badgeClass   - unique CSS class identifying this badge type
// extraClasses - additional Tailwind classes for the outer wrapper
// nodeId       - node ID as a string
// text         - display text, or null to remove
// color        - optional CSS variable name e.g. "--success-background"
// icon         - optional Lucide icon name e.g. "clock"
export function setVueBadge(
        badgeClass, extraClasses, nodeId, text, color = null, icon = null) {
    if (!registry.has(nodeId)) registry.set(nodeId, new Map());
    const nodeBadges = registry.get(nodeId);

    if (!text) {
        nodeBadges.delete(badgeClass);
        _removeBadge(badgeClass, nodeId);
        return;
    }

    nodeBadges.set(badgeClass, { text, extraClasses, color, icon });
    _applyBadge(badgeClass, extraClasses, nodeId, text, color, icon);
}

// Clears all badges for a node from both the DOM and the registry.
export function clearVueBadges(nodeId) {
    const nodeBadges = registry.get(nodeId);
    if (!nodeBadges) return;
    for (const badgeClass of nodeBadges.keys()) {
        _removeBadge(badgeClass, nodeId);
    }
    nodeBadges.clear();
}

function _getFooter(nodeId) {
    return document.querySelector(`[data-node-id="${nodeId}"] .mt-auto`);
}

function _removeBadge(badgeClass, nodeId) {
    _getFooter(nodeId)?.querySelector(`.${badgeClass}`)?.remove();
}

function _applyBadge(badgeClass, extraClasses, nodeId, text, color = null, icon = null) {
    const footer = _getFooter(nodeId);
    if (!footer) return;

    // Ensure footer has a positioning context for absolute badges.
    footer.classList.add("relative");

    let badge = footer.querySelector(`.${badgeClass}`);
    if (!badge) {
        badge = document.createElement("div");
        badge.className = [
            badgeClass,
            "flex", "h-6", "items-center", "justify-center",
            "overflow-clip", "rounded-full",
            "bg-component-node-widget-background",
            ...extraClasses
        ].join(" ");
        const inner = document.createElement("div");
        inner.className = [
            "flex", "min-w-max", "items-center", "gap-1",
            "rounded-sm", "px-1", "py-0.5", "text-xs", "h-6",
            "first:pl-2", "last:pr-2"
        ].join(" ");
        inner.style.cssText =
            "color: currentcolor; background-color: transparent;";
        badge.appendChild(inner);
        footer.appendChild(badge);
    }

    const inner = badge.querySelector("div");

    // Rebuild inner content: optional icon + text.
    inner.innerHTML = "";
    if (icon) {
        const i = document.createElement("i");
        i.className = `icon-[lucide--${icon}] size-3`;
        inner.appendChild(i);
    }
    const span = document.createElement("span");
    span.textContent = text;
    inner.appendChild(span);

    // Apply theme color via CSS variable, or reset to transparent.
    // Set text color for maximum contrast against the background.
    inner.style.backgroundColor = color
        ? `var(${color})`
        : "transparent";
    inner.style.color = _contrastColor(color) ?? "currentcolor";
}

// Re-applies all registered badges for a given node ID.
function _reapplyBadges(nodeId) {
    const nodeBadges = registry.get(nodeId);
    if (!nodeBadges) return;
    for (const [badgeClass, { text, extraClasses, color, icon }] of nodeBadges) {
        _applyBadge(badgeClass, extraClasses, nodeId, text, color, icon);
    }
}

// Cache of CSS variable -> "#fff" or "#000" for contrast text.
const _contrastCache = new Map();

// Returns "#fff" or "#000" for maximum contrast against the given CSS
// variable's resolved color. Result is cached per variable name.
function _contrastColor(cssVar) {
    if (!cssVar) return null;
    if (_contrastCache.has(cssVar)) return _contrastCache.get(cssVar);

    const el = document.createElement("div");
    el.style.cssText = `position:absolute;visibility:hidden;background-color:var(${cssVar})`;
    document.body.appendChild(el);
    const rgb = getComputedStyle(el).backgroundColor;
    document.body.removeChild(el);

    // Parse rgb(r, g, b) or rgba(r, g, b, a).
    const m = rgb.match(/\d+/g);
    let result = "#000";
    if (m) {
        const [r, g, b] = m.map(Number);
        // Relative luminance per WCAG 2.1.
        const lum = (c) => {
            const s = c / 255;
            return s <= 0.03928
                ? s / 12.92
                : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        const L = 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
        result = L > 0.179 ? "#000" : "#fff";
    }

    _contrastCache.set(cssVar, result);
    return result;
}

// Single MutationObserver watching for [data-node-id] elements being
// added to the DOM. Fires for workflow switches and collapse/expand.
let _observer = null;

export function startBadgeObserver() {
    if (_observer) return;

    _observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement)) continue;

                // The node element itself may be the added element.
                if (node.dataset?.nodeId) {
                    _reapplyBadges(node.dataset.nodeId);
                    continue;
                }

                // Or it may be a subtree — scan descendants.
                for (const el of node.querySelectorAll("[data-node-id]")) {
                    _reapplyBadges(el.dataset.nodeId);
                }
            }
        }
    });

    // Observe the whole document body since node elements can be
    // reparented into various containers across workflow switches.
    _observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}
