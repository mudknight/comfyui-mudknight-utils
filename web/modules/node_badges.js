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
export function setVueBadge(badgeClass, extraClasses, nodeId, text) {
    if (!registry.has(nodeId)) registry.set(nodeId, new Map());
    const nodeBadges = registry.get(nodeId);

    if (!text) {
        nodeBadges.delete(badgeClass);
        _removeBadge(badgeClass, nodeId);
        return;
    }

    nodeBadges.set(badgeClass, { text, extraClasses });
    _applyBadge(badgeClass, extraClasses, nodeId, text);
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

function _applyBadge(badgeClass, extraClasses, nodeId, text) {
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

    badge.querySelector("div").textContent = text;
}

// Re-applies all registered badges for a given node ID.
function _reapplyBadges(nodeId) {
    const nodeBadges = registry.get(nodeId);
    if (!nodeBadges) return;
    for (const [badgeClass, { text, extraClasses }] of nodeBadges) {
        _applyBadge(badgeClass, extraClasses, nodeId, text);
    }
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
