// Centralized state management
export const state = {
	characters: {},
	models: {},
	styles: {},
	tags: {},
	wildcards: {},
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
		wildcard: '',
	},
	savedSearches: {
		character: '',
		model: '',
		style: '',
		tag: '',
		wildcard: '',
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
	wildcardPresets: [],
	tagPresets: [],
	contextType: 'tag',
	insertComma: true,
	presetsFirst: false,
	blacklist: new Set()
};
