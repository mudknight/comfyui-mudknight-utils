import { state } from './state.js';

export function switchTab(tabName) {
	const tabMap = {
		characters: 'character',
		models: 'model',
		styles: 'style',
		tags: 'tag',
	};
	
	const searchInput = document.getElementById('searchInput');
	const currentKey = tabMap[state.activeTab];
	state.savedSearches[currentKey] = searchInput.value;
	state.searchTerms[currentKey] = searchInput.value;
	
	state.activeTab = tabName;
	
	const newKey = tabMap[tabName];
	searchInput.value = state.savedSearches[newKey] || '';
	state.searchTerms[newKey] = searchInput.value;
	
	const placeholders = {
		characters: 'Search characters...',
		models: 'Search models...',
		styles: 'Search styles...',
		tags: 'Search tag presets...',
	};
	searchInput.placeholder = placeholders[tabName];
	
	document.getElementById('clearSearch').style.display = 
		searchInput.value ? 'block' : 'none';
	
	document.querySelectorAll('.tab-button').forEach(btn => {
		btn.classList.remove('active');
		if (btn.textContent.trim().toLowerCase() === tabName) {
			btn.classList.add('active');
		}
	});
	
	document.querySelectorAll('.tab-content').forEach(content => {
		content.classList.remove('active');
	});
	document.getElementById(`${tabName}Tab`).classList.add('active');
	
	if (tabName === 'characters' && window.renderCharacters) window.renderCharacters();
	else if (tabName === 'models' && window.renderModels) window.renderModels();
	else if (tabName === 'styles' && window.renderStyles) window.renderStyles();
	else if (tabName === 'tags' && window.renderTags) window.renderTags();
}

export function clearSearch() {
	const tabMap = {
		characters: 'character',
		models: 'model',
		styles: 'style',
		tags: 'tag'
	};
	
	const searchInput = document.getElementById('searchInput');
	const currentKey = tabMap[state.activeTab];
	
	searchInput.value = '';
	state.searchTerms[currentKey] = '';
	state.savedSearches[currentKey] = '';
	document.getElementById('clearSearch').style.display = 'none';
	
	if (state.activeTab === 'characters' && window.renderCharacters) window.renderCharacters();
	else if (state.activeTab === 'models' && window.renderModels) window.renderModels();
	else if (state.activeTab === 'styles' && window.renderStyles) window.renderStyles();
	else if (state.activeTab === 'tags' && window.renderTags) window.renderTags();
	
	searchInput.focus();
}

export function initSearch() {
	const searchInput = document.getElementById('searchInput');
	searchInput.addEventListener('input', (e) => {
		const tabMap = {
			characters: 'character',
			models: 'model',
			styles: 'style',
			tags: 'tag'
		};
		
		const value = e.target.value;
		const currentKey = tabMap[state.activeTab];
		
		state.searchTerms[currentKey] = value;
		state.savedSearches[currentKey] = value;
		
		document.getElementById('clearSearch').style.display = 
			value ? 'block' : 'none';
		
		if (state.activeTab === 'characters' && window.renderCharacters) window.renderCharacters();
		else if (state.activeTab === 'models' && window.renderModels) window.renderModels();
		else if (state.activeTab === 'styles' && window.renderStyles) window.renderStyles();
		else if (state.activeTab === 'tags' && window.renderTags) window.renderTags();
	});
}
