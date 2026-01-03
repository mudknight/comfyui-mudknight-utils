// Centralized state management
export const state = {
	characters: {},
	models: {},
	styles: {},
	tags: {},
	characterImages: {},
	styleImages: {},
	activeTab: 'characters',
	selectedCategory: 'all',
	sidebarCollapsed: false,
	searchTerms: {
		character: '',
		model: '',
		style: '',
		tag: '',
	},
	savedSearches: {
		character: '',
		model: '',
		style: '',
		tag: ''
	},
	currentEditName: null,
	currentEditType: null,
	currentOriginalName: null,
	currentAddType: null
};

export const autocompleteState = {
	activeElement: null,
	selectedIndex: -1,
	currentWord: '',
	wordStart: 0,
	filteredTags: [],
	tags: [],
	loras: [],
	embeddings: [],
	characterPresets: [],
	tagPresets: [],
	contextType: 'tag',
	insertComma: true,
	presetsFirst: true  // Configurable: show presets above regular tags
};
