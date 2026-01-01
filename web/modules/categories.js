import { state } from './state.js';
import { loadSidebarState, saveSidebarState } from './utils.js';

export function getAllCategories() {
	const categorySet = new Set();
	
	for (const name of Object.keys(state.characters)) {
		const char = state.characters[name];
		const categories = char.categories || '';
		
		if (categories.trim()) {
			const cats = categories.split(',').map(c => c.trim()).filter(Boolean);
			cats.forEach(cat => categorySet.add(cat));
		}
	}
	
	return Array.from(categorySet).sort((a, b) => 
		a.toLowerCase().localeCompare(b.toLowerCase())
	);
}

export function getCategoryCounts() {
	const counts = { all: 0 };
	
	for (const name of Object.keys(state.characters)) {
		counts.all++;
		
		const char = state.characters[name];
		const categories = char.categories || '';
		
		if (categories.trim()) {
			const cats = categories.split(',').map(c => c.trim()).filter(Boolean);
			cats.forEach(cat => {
				counts[cat] = (counts[cat] || 0) + 1;
			});
		}
	}
	
	return counts;
}

export function characterMatchesCategory(name, category) {
	if (category === 'all') return true;
	
	const char = state.characters[name];
	const categories = char.categories || '';
	
	if (!categories.trim()) return false;
	
	const cats = categories.split(',').map(c => c.trim()).filter(Boolean);
	return cats.includes(category);
}

export function renderCategories() {
	const categoryList = document.getElementById('categoryList');
	const allCategories = getAllCategories();
	const counts = getCategoryCounts();
	
	categoryList.innerHTML = `
		<div class="category-item ${state.selectedCategory === 'all' ? 'active' : ''}" 
		     data-category="all" onclick="window.selectCategory('all')">
			<span class="category-name">All Characters</span>
			<span class="category-count">${counts.all}</span>
		</div>
	`;
	
	for (const category of allCategories) {
		const item = document.createElement('div');
		item.className = `category-item ${state.selectedCategory === category ? 'active' : ''}`;
		item.setAttribute('data-category', category);
		item.onclick = () => window.selectCategory(category);
		
		item.innerHTML = `
			<span class="category-name">${category}</span>
			<span class="category-count">${counts[category] || 0}</span>
		`;
		
		categoryList.appendChild(item);
	}
}

export function selectCategory(category) {
	state.selectedCategory = category;
	renderCategories();
	// This will be called from main script which has access to renderCharacters
	if (window.renderCharacters) {
		window.renderCharacters();
	}
}

export function toggleSidebar() {
	state.sidebarCollapsed = !state.sidebarCollapsed;
	saveSidebarState(state.sidebarCollapsed);
	updateSidebarState();
}

export function updateSidebarState() {
	const sidebar = document.getElementById('categorySidebar');
	const toggleBtn = document.getElementById('sidebarToggle');

	if (state.sidebarCollapsed) {
		sidebar.classList.add('collapsed');
		toggleBtn.innerHTML = '›';
		toggleBtn.setAttribute('aria-label', 'Expand sidebar');
	} else {
		sidebar.classList.remove('collapsed');
		toggleBtn.innerHTML = '‹';
		toggleBtn.setAttribute('aria-label', 'Collapse sidebar');
	}
}

export function initCategories() {
	state.sidebarCollapsed = loadSidebarState();
	updateSidebarState();
}
