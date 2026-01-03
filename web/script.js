import { state, autocompleteState } from './modules/state.js';
import * as api from './modules/api.js';
import { showStatus } from './modules/utils.js';
import { initAutocomplete } from './modules/autocomplete.js';
import { 
	initCategories, 
	renderCategories, 
	selectCategory, 
	toggleSidebar 
} from './modules/categories.js';
import { renderCharacters } from './modules/characters.js';
import { renderModels } from './modules/models.js';
import { renderStyles } from './modules/styles.js';
import { renderTags } from './modules/tags.js';
import { 
	showEditModal, 
	hideEditModal, 
	saveItem, 
	deleteCurrentItem, 
	removeImage 
} from './modules/modals.js';
import { initSearch, switchTab, clearSearch } from './modules/search.js';
import { initWeightAdjustment } from './modules/weight-adjustment.js';

function renderAll() {
	renderCategories();
	renderCharacters();
	renderModels();
	renderStyles();
	renderTags();
}

async function loadData() {
	try {
		const autocompleteTags = await api.loadAutocompleteTags();
		autocompleteState.tags = autocompleteTags;
		
		// Load character and tag presets after tags are loaded
		const characterPresets = await api.loadCharacterPresets(
			autocompleteTags
		);
		autocompleteState.characterPresets = characterPresets;
		
		const tagPresets = await api.loadTagPresets(autocompleteTags);
		autocompleteState.tagPresets = tagPresets;
		
		// Load LoRAs and embeddings
		const loras = await api.loadLoras();
		autocompleteState.loras = loras;
		
		const embeddings = await api.loadEmbeddings();
		autocompleteState.embeddings = embeddings;
		
		state.characters = await api.loadCharacters();
		await api.checkImages('character');
		
		state.models = await api.loadModels();
		
		state.styles = await api.loadStyles();
		await api.checkImages('style');
		
		state.tags = await api.loadTags();
		
		renderAll();
	} catch (error) {
		console.error('Load error:', error);
		showStatus('Error loading data: ' + error.message, 'error');
	}
}

function setupModalEventListeners() {
	document.getElementById('editModal').addEventListener('click', (e) => {
		if (e.target.id === 'editModal') hideEditModal('character');
	});

	document.getElementById('modelEditModal')
		.addEventListener('click', (e) => {
			if (e.target.id === 'modelEditModal') hideEditModal('model');
		});

	document.getElementById('styleEditModal')
		.addEventListener('click', (e) => {
			if (e.target.id === 'styleEditModal') hideEditModal('style');
		});

	document.getElementById('tagEditModal').addEventListener('click', (e) => {
		if (e.target.id === 'tagEditModal') hideEditModal('tag');
	});
}

function init() {
	initAutocomplete();
	initCategories();
	initSearch();
	initWeightAdjustment();
	setupModalEventListeners();
	
	window.renderAll = renderAll;
	window.renderCharacters = renderCharacters;
	window.renderModels = renderModels;
	window.renderStyles = renderStyles;
	window.renderTags = renderTags;
	window.showEditModal = showEditModal;
	window.hideEditModal = hideEditModal;
	window.saveItem = saveItem;
	window.deleteCurrentItem = deleteCurrentItem;
	window.removeImage = removeImage;
	window.switchTab = switchTab;
	window.clearSearch = clearSearch;
	window.selectCategory = selectCategory;
	window.toggleSidebar = toggleSidebar;
	
	loadData();
}

init();
