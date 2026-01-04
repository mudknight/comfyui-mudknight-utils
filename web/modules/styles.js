import { state } from './state.js';
import { getSortedNames } from './utils.js';
import { getImageUrl } from './api.js';
import { setupDragAndDrop } from './dragdrop.js';

let imageObserver = null;

function getImageObserver() {
	if (!imageObserver) {
		imageObserver = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					const card = entry.target;
					const name = card.dataset.styleName;
					const imageUrl = getImageUrl(name, 'style');
					card.style.backgroundImage = `url(${imageUrl})`;
					imageObserver.unobserve(card);
				}
			});
		}, {
			rootMargin: '50px'
		});
	}
	return imageObserver;
}

export function renderStyles() {
	const grid = document.getElementById('styleGrid');
	const emptyState = document.getElementById('styleEmptyState');
	grid.innerHTML = '';

	const addCard = document.createElement('div');
	addCard.className = 'character-card add-card';
	addCard.innerHTML = '+';
	addCard.onclick = () => {
		if (window.showEditModal) {
			window.showEditModal('style', '');
		}
	};
	grid.appendChild(addCard);

	const sortedNames = getSortedNames(state.styles);
	const filteredNames = sortedNames.filter(name =>
		name.toLowerCase().includes(
			state.searchTerms.style.toLowerCase()
		)
	);

	emptyState.style.display = 
		filteredNames.length === 0 ? 'block' : 'none';

	const observer = getImageObserver();

	for (const name of filteredNames) {
		const card = document.createElement('div');
		card.className = 'character-card';
		card.dataset.styleName = name;
		
		const hasImage = state.styleImages[name];
		if (hasImage) {
			card.classList.add('has-image');
			observer.observe(card);
		}

		card.onclick = () => {
			if (window.showEditModal) {
				window.showEditModal('style', name);
			}
		};

		card.innerHTML = `
			${!hasImage ? 
				'<div class="character-card-placeholder"></div>' : 
				''
			}
			<div class="upload-hint">Drop image here</div>
			<div class="character-card-name">${name}</div>
		`;

		setupDragAndDrop(card, name, 'style');
		grid.appendChild(card);
	}
}
