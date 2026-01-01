import { state } from './state.js';
import { getSortedNames } from './utils.js';

export function renderTags() {
	const grid = document.getElementById('tagGrid');
	const emptyState = document.getElementById('tagEmptyState');
	grid.innerHTML = '';

	const addCard = document.createElement('div');
	addCard.className = 'preset-card preset-add-card';
	addCard.innerHTML = '+';
	addCard.onclick = () => {
		if (window.showEditModal) {
			window.showEditModal('tag', '');
		}
	};
	grid.appendChild(addCard);

	const sortedNames = getSortedNames(state.tags);
	const filteredNames = sortedNames.filter(name =>
		name.toLowerCase().includes(state.searchTerms.tag.toLowerCase())
	);

	emptyState.style.display = filteredNames.length === 0 ? 
		'block' : 'none';

	for (const name of filteredNames) {
		const tag = state.tags[name];
		const card = document.createElement('div');
		card.className = 'preset-card';
		card.onclick = () => {
			if (window.showEditModal) {
				window.showEditModal('tag', name);
			}
		};

		let previewHTML = '';
		
		if (tag.positive && tag.positive.trim()) {
			previewHTML += `<span class="tag-positive">${tag.positive}</span>`;
		}
		
		if (tag.negative && tag.negative.trim()) {
			if (previewHTML) previewHTML += ' ';
			previewHTML += `<span class="tag-negative">${tag.negative}</span>`;
		}
		
		if (!previewHTML) {
			previewHTML = '<span class="tag-empty">(no tags defined)</span>';
		}

		card.innerHTML = `
			<div class="preset-card-name">${name}</div>
			<div class="preset-card-content tag-preview">${previewHTML}</div>
		`;

		grid.appendChild(card);
	}
}
