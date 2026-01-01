import { state } from './state.js';
import { getSortedNames } from './utils.js';

export function renderModels() {
	const grid = document.getElementById('modelGrid');
	const emptyState = document.getElementById('modelEmptyState');
	grid.innerHTML = '';

	const addCard = document.createElement('div');
	addCard.className = 'preset-card preset-add-card';
	addCard.innerHTML = '+';
	addCard.onclick = () => {
		if (window.showEditModal) {
			window.showEditModal('model', '');
		}
	};
	grid.appendChild(addCard);

	const sortedNames = getSortedNames(state.models);
	const filteredNames = sortedNames.filter(name =>
		name.toLowerCase().includes(state.searchTerms.model.toLowerCase())
	);

	emptyState.style.display = filteredNames.length === 0 ? 'block' : 'none';

	for (const name of filteredNames) {
		const model = state.models[name];
		const card = document.createElement('div');
		card.className = 'preset-card';
		card.onclick = () => {
			if (window.showEditModal) {
				window.showEditModal('model', name);
			}
		};

		let previewHTML = '';
		
		const positiveParts = [];
		if (model.quality?.positive) {
			positiveParts.push(model.quality.positive);
		}
		if (model.embeddings?.positive) {
			positiveParts.push(model.embeddings.positive);
		}
		
		const negativeParts = [];
		if (model.quality?.negative) {
			negativeParts.push(model.quality.negative);
		}
		if (model.embeddings?.negative) {
			negativeParts.push(model.embeddings.negative);
		}
		
		if (positiveParts.length > 0) {
			previewHTML += `<span class="tag-positive">${positiveParts.join(', ')}</span>`;
		}
		
		if (negativeParts.length > 0) {
			if (previewHTML) previewHTML += ' ';
			previewHTML += `<span class="tag-negative">${negativeParts.join(', ')}</span>`;
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
