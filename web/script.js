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
		const hideAliases = localStorage.getItem(
			"Mudknight Utils.Autocomplete.HideAliasesWithMain"
		);
		autocompleteState.hideAliasesWithMain = hideAliases === 'true';

		const blacklistStr = localStorage.getItem(
			"Comfy.Settings.Mudknight Utils.Autocomplete.Blacklist"
		) || "";
		const blacklist = new Set(
			blacklistStr.split(',')
			.map(t => t.trim().toLowerCase().replace(/ /g, '_'))
			.filter(t => t.length > 0)
		);
		autocompleteState.blacklist = blacklist;
		if (blacklist.size > 0) {
			console.log(
				`Preset Manager: Blacklist loaded: ${blacklist.size} tag(s)`
			);
		}

		const customSources = localStorage.getItem(
			"Comfy.Settings.Mudknight Utils.Autocomplete.CustomSources"
		) || "";

		const customTags = localStorage.getItem(
			"Comfy.Settings.Mudknight Utils.Autocomplete.CustomTags"
		) || "";

		console.log(
			"Preset Manager: Loading with custom sources:",
			customSources
		);

		// Use cached data loader
		const autocompleteData = await api.loadAllAutocompleteData(
			customSources,
			customTags
		);

		Object.assign(autocompleteState, autocompleteData);

		// Apply tag usage boost (Preset Manager specific)
		const tagUsage = await api.loadTagUsage();
		if (Object.keys(tagUsage).length > 0) {
			autocompleteState.tags = autocompleteState.tags.map(tag => ({
				...tag,
				count: (tag.count || 0) + 
				((tagUsage[tag.tag.toLowerCase()] || 0) * 10)
			}));
		}

		// Load preset manager data
		state.characters = await api.loadCharacters();
		state.models = await api.loadModels();
		state.styles = await api.loadStyles();
		state.tags = await api.loadTags();

		// Check images in parallel
		await Promise.all([
			api.checkImages('character'),
			api.checkImages('style')
		]);

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
	
	window.addEventListener('storage', (event) => {
		if (event.key === "Mudknight Utils.Autocomplete.HideAliasesWithMain") {
			autocompleteState.hideAliasesWithMain = event.newValue === 'true';
		}
	});
	
	loadData();
}

init();
