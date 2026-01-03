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

function loadHideAliasesSetting() {
	const saved = localStorage.getItem('autocomplete.hideAliasesWithMain');
	if (saved !== null) {
		return saved === 'true';
	}
	return true;
}

function saveHideAliasesSetting(value) {
	localStorage.setItem('autocomplete.hideAliasesWithMain', value);
}

async function loadData() {
	try {
		autocompleteState.hideAliasesWithMain = 
			loadHideAliasesSetting();
		
		const autocompleteTags = await api.loadAutocompleteTags();
		autocompleteState.tags = autocompleteTags;
		
		const characterPresets = await api.loadCharacterPresets(
			autocompleteTags
		);
		autocompleteState.characterPresets = characterPresets;
		
		const tagPresets = await api.loadTagPresets(autocompleteTags);
		autocompleteState.tagPresets = tagPresets;
		
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

function toggleHideAliases() {
	autocompleteState.hideAliasesWithMain = 
		!autocompleteState.hideAliasesWithMain;
	saveHideAliasesSetting(autocompleteState.hideAliasesWithMain);
	
	const checkbox = document.getElementById('hideAliasesCheckbox');
	if (checkbox) {
		checkbox.checked = autocompleteState.hideAliasesWithMain;
	}
}

function createSettingsPanel() {
	const panel = document.createElement('div');
	panel.style.cssText = `
		position: fixed;
		bottom: 20px;
		right: 20px;
		background: #2a2a2a;
		border: 1px solid #3a3a3a;
		border-radius: 6px;
		padding: 15px;
		z-index: 1000;
		min-width: 250px;
	`;
	
	panel.innerHTML = `
		<div style="font-size: 14px; font-weight: 600; 
		            margin-bottom: 10px; color: #fff;">
			Autocomplete Settings
		</div>
		<label style="display: flex; align-items: center; gap: 10px; 
		              cursor: pointer; color: #e0e0e0;">
			<input type="checkbox" id="hideAliasesCheckbox" 
			       style="cursor: pointer;">
			<span style="font-size: 13px;">
				Hide aliases when main tag is present
			</span>
		</label>
		<div style="font-size: 11px; color: #888; margin-top: 8px; 
		            margin-left: 30px;">
			When enabled, aliases won't show if their main tag is in 
			results, unless you specifically type the alias
		</div>
	`;
	
	document.body.appendChild(panel);
	
	const checkbox = document.getElementById('hideAliasesCheckbox');
	checkbox.checked = autocompleteState.hideAliasesWithMain;
	checkbox.addEventListener('change', toggleHideAliases);
}

function init() {
	initAutocomplete();
	initCategories();
	initSearch();
	initWeightAdjustment();
	setupModalEventListeners();
	// createSettingsPanel();
	
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
