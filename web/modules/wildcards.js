import { state } from './state.js';
import { getSortedNames } from './utils.js';

export function renderWildcards() {
    const grid = document.getElementById('wildcardGrid');
    const emptyState = document.getElementById('wildcardEmptyState');
    grid.innerHTML = '';

    const addCard = document.createElement('div');
    addCard.className = 'preset-card preset-add-card';
    addCard.innerHTML = '+';
    addCard.onclick = () => {
        if (window.showEditModal) {
            window.showEditModal('wildcard', '');
        }
    };
    grid.appendChild(addCard);

    const sortedNames = getSortedNames(state.wildcards);
    const filteredNames = sortedNames.filter(name =>
        name.toLowerCase().includes(
            state.searchTerms.wildcard.toLowerCase()
        )
    );

    emptyState.style.display = 
        filteredNames.length === 0 ? 'block' : 'none';

    for (const name of filteredNames) {
        const options = state.wildcards[name];
        const card = document.createElement('div');
        card.className = 'preset-card';
        card.onclick = () => {
            if (window.showEditModal) {
                window.showEditModal('wildcard', name);
            }
        };

        const preview = options.length > 50 
            ? options.substring(0, 50) + '...' 
            : options;

        card.innerHTML = `
            <div class="preset-card-name">${name}</div>
            <div class="preset-card-content">${preview}</div>
        `;

        grid.appendChild(card);
    }
}
