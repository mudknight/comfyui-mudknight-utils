import { state } from './state.js';
import { getSortedNames } from './utils.js';
import { getImageUrl } from './api.js';
import { setupDragAndDrop } from './dragdrop.js';
import { characterMatchesCategory } from './categories.js';

// Create intersection observer for lazy loading images
let imageObserver = null;

function getImageObserver() {
	if (!imageObserver) {
		imageObserver = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					const card = entry.target;
					const name = card.dataset.characterName;
					const imageUrl = getImageUrl(name, 'character');
					card.style.backgroundImage = `url(${imageUrl})`;
					imageObserver.unobserve(card);
				}
			});
		}, {
			rootMargin: '50px' // Start loading slightly before visible
		});
	}
	return imageObserver;
}

export function renderCharacters() {
	const grid = document.getElementById('characterGrid');
	const emptyState = document.getElementById('emptyState');
	grid.innerHTML = '';

	const addCard = document.createElement('div');
	addCard.className = 'character-card add-card';
	addCard.innerHTML = '+';
	addCard.onclick = () => {
		if (window.showEditModal) {
			window.showEditModal('character', '');
		}
	};
	grid.appendChild(addCard);

	const sortedNames = getSortedNames(state.characters);
	const filteredNames = sortedNames.filter(name => {
		const char = state.characters[name];
		const searchLower = state.searchTerms.character.toLowerCase();
		
		const matchesName = name.toLowerCase().includes(searchLower);
		const categories = char.categories || '';
		const matchesCategorySearch = 
			categories.toLowerCase().includes(searchLower);
		
		const matchesSearch = matchesName || matchesCategorySearch;
		const matchesCategoryFilter = 
			characterMatchesCategory(name, state.selectedCategory);
		
		return matchesSearch && matchesCategoryFilter;
	});

	emptyState.style.display = 
		filteredNames.length === 0 ? 'block' : 'none';

	const observer = getImageObserver();

	for (const name of filteredNames) {
		const card = document.createElement('div');
		card.className = 'character-card';
		card.dataset.characterName = name;
		
		const hasImage = state.characterImages[name];
		if (hasImage) {
			card.classList.add('has-image');
			// Observe for lazy loading
			observer.observe(card);
		}

		card.onclick = () => {
			if (window.showEditModal) {
				window.showEditModal('character', name);
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

		setupDragAndDrop(card, name, 'character');
		grid.appendChild(card);
	}
}
