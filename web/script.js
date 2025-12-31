let characters = {};
let models = {};
let styles = {};
let currentEditName = null;
let currentEditType = null;
let currentOriginalName = null; // Add this
let currentAddType = null;
let searchTerms = {
	character: '',
	model: '',
	style: ''
};
let characterImages = {};
let styleImages = {};
let activeTab = 'characters';
let selectedCategory = 'all';
let sidebarCollapsed = false;

let autocompleteTags = [];
let autocompleteState = {
	activeElement: null,
	selectedIndex: -1,
	currentWord: '',
	wordStart: 0,
	filteredTags: []
};

let savedSearches = {
	character: '',
	model: '',
	style: ''
};

// Load sidebar state from localStorage
function loadSidebarState() {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved !== null) {
        sidebarCollapsed = saved === 'true';
        updateSidebarState();
    }
}

// Toggle sidebar collapsed state
function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
    updateSidebarState();
}

// Update sidebar UI based on collapsed state
function updateSidebarState() {
    const sidebar = document.getElementById('categorySidebar');
    const toggleBtn = document.getElementById('sidebarToggle');

    if (sidebarCollapsed) {
        sidebar.classList.add('collapsed');
        toggleBtn.innerHTML = '›';
        toggleBtn.setAttribute('aria-label', 'Expand sidebar');
    } else {
        sidebar.classList.remove('collapsed');
        toggleBtn.innerHTML = '‹';
        toggleBtn.setAttribute('aria-label', 'Collapse sidebar');
    }
}

// Autocomplete
async function loadAutocompleteTags() {
	try {
		const response = await fetch('autocomplete.txt');
		if (!response.ok) {
			console.log('Autocomplete file not found');
			return;
		}
		
		const text = await response.text();
		const lines = text.split('\n');
		
		autocompleteTags = lines
			.map(line => {
				const parts = line.trim().split(',');
				if (parts.length >= 2) {
					return {
						tag: parts[0].trim(),
						count: parseInt(parts[1]) || 0
					};
				}
				return null;
			})
			.filter(Boolean)
			.sort((a, b) => b.count - a.count); // Sort by usage count
		
		console.log(`Loaded ${autocompleteTags.length} autocomplete tags`);
	} catch (error) {
		console.error('Error loading autocomplete tags:', error);
	}
}

async function loadAutocompleteTags() {
	try {
		const response = await fetch('autocomplete.txt');
		if (!response.ok) {
			console.log('Autocomplete file not found');
			return;
		}
		
		const text = await response.text();
		const lines = text.split('\n');
		
		autocompleteTags = lines
			.map(line => {
				const parts = line.trim().split(',');
				if (parts.length >= 2) {
					return {
						tag: parts[0].trim(),
						count: parseInt(parts[1]) || 0
					};
				}
				return null;
			})
			.filter(Boolean)
			.sort((a, b) => b.count - a.count); // Sort by usage count
		
		console.log(`Loaded ${autocompleteTags.length} autocomplete tags`);
	} catch (error) {
		console.error('Error loading autocomplete tags:', error);
	}
}

function getCurrentWord(input) {
	const cursorPos = input.selectionStart;
	const text = input.value;
	
	// Find the start of the current word (after last comma or start)
	let start = text.lastIndexOf(',', cursorPos - 1) + 1;
	
	// Skip any whitespace after the comma to find actual word start
	while (start < cursorPos && text[start] === ' ') {
		start++;
	}
	
	// Find the end of the current word (next comma or end)
	let end = text.indexOf(',', cursorPos);
	if (end === -1) end = text.length;
	
	const word = text.substring(start, end).trim();
	
	return {
		word: word,
		start: start,
		end: end
	};
}

function showAutocomplete(input, word, startPos) {
	if (!word || word.length < 2) {
		hideAutocomplete();
		return;
	}
	
	const searchWord = word.toLowerCase();
	const filtered = autocompleteTags
		.filter(item => item.tag.toLowerCase().includes(searchWord))
		.slice(0, 10); // Limit to 10 suggestions
	
	if (filtered.length === 0) {
		hideAutocomplete();
		return;
	}
	
	autocompleteState.filteredTags = filtered;
	autocompleteState.selectedIndex = 0; // Changed from -1 to 0
	autocompleteState.activeElement = input;
	autocompleteState.currentWord = word;
	autocompleteState.wordStart = startPos;
	
	const dropdown = document.getElementById('autocompleteDropdown');
	dropdown.innerHTML = '';
	
	filtered.forEach((item, index) => {
		const div = document.createElement('div');
		div.className = 'autocomplete-item';
		if (index === 0) {
			div.classList.add('selected'); // Add selected class to first item
		}
		div.innerHTML = `
			<span class="autocomplete-tag">${item.tag}</span>
			<span class="autocomplete-count">${item.count}</span>
		`;
		
		div.onclick = () => selectAutocomplete(index);
		dropdown.appendChild(div);
	});
	
	// Position the dropdown
	const rect = input.getBoundingClientRect();
	dropdown.style.left = rect.left + 'px';
	dropdown.style.top = (rect.bottom + 5) + 'px';
	dropdown.style.width = rect.width + 'px';
	dropdown.style.display = 'block';
}

function hideAutocomplete() {
	const dropdown = document.getElementById('autocompleteDropdown');
	dropdown.style.display = 'none';
	autocompleteState.activeElement = null;
	autocompleteState.selectedIndex = -1;
	autocompleteState.filteredTags = [];
}

function selectAutocomplete(index) {
	if (!autocompleteState.activeElement || 
	    index < 0 || 
	    index >= autocompleteState.filteredTags.length) {
		return;
	}
	
	const input = autocompleteState.activeElement;
	let selectedTag = autocompleteState.filteredTags[index].tag;
	
	// Replace underscores with spaces
	selectedTag = selectedTag.replace(/_/g, ' ');
	
	// Escape parentheses
	selectedTag = selectedTag.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
	
	const text = input.value;
	
	// Find the current word boundaries
	const info = getCurrentWord(input);
	
	// Replace the current word with the selected tag
	const before = text.substring(0, info.start);
	const after = text.substring(info.end);
	
	// Build new text - keep existing content before, just replace the word
	const newText = before + selectedTag + ', ' + after.trimStart();
	
	input.value = newText;
	
	// Set cursor position after the inserted tag and comma
	const newCursorPos = before.length + selectedTag.length + 2;
	input.setSelectionRange(newCursorPos, newCursorPos);
	
	hideAutocomplete();
	input.focus();
}

function handleAutocompleteKeydown(e, input) {
	const dropdown = document.getElementById('autocompleteDropdown');
	
	if (dropdown.style.display !== 'block') {
		return;
	}
	
	if (e.key === 'ArrowDown') {
		e.preventDefault();
		if (autocompleteState.selectedIndex < autocompleteState.filteredTags.length - 1) {
			autocompleteState.selectedIndex++;
			updateAutocompleteSelection();
		}
	} else if (e.key === 'ArrowUp') {
		e.preventDefault();
		if (autocompleteState.selectedIndex > 0) {
			autocompleteState.selectedIndex--;
			updateAutocompleteSelection();
		}
	} else if (e.key === 'Enter' || e.key === 'Tab') {
		if (autocompleteState.selectedIndex >= 0) {
			e.preventDefault();
			selectAutocomplete(autocompleteState.selectedIndex);
		}
	} else if (e.key === 'Escape') {
		e.preventDefault();
		hideAutocomplete();
	}
}

function updateAutocompleteSelection() {
	const items = document.querySelectorAll('.autocomplete-item');
	items.forEach((item, index) => {
		if (index === autocompleteState.selectedIndex) {
			item.classList.add('selected');
			item.scrollIntoView({ block: 'nearest' });
		} else {
			item.classList.remove('selected');
		}
	});
}

function setupAutocomplete(input) {
	input.addEventListener('input', (e) => {
		const info = getCurrentWord(input);
		showAutocomplete(input, info.word, info.start);
	});
	
	input.addEventListener('keydown', (e) => {
		handleAutocompleteKeydown(e, input);
	});
	
	input.addEventListener('blur', (e) => {
		// Delay hiding to allow click on dropdown
		setTimeout(() => {
			if (autocompleteState.activeElement === input) {
				hideAutocomplete();
			}
		}, 200);
	});
}

// Categories
function getAllCategories() {
	const categorySet = new Set();
	
	for (const name of Object.keys(characters)) {
		const char = characters[name];
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

function getCategoryCounts() {
	const counts = { all: 0 };
	
	for (const name of Object.keys(characters)) {
		counts.all++;
		
		const char = characters[name];
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

function characterMatchesCategory(name, category) {
	if (category === 'all') return true;
	
	const char = characters[name];
	const categories = char.categories || '';
	
	if (!categories.trim()) return false;
	
	const cats = categories.split(',').map(c => c.trim()).filter(Boolean);
	return cats.includes(category);
}

function renderCategories() {
	const categoryList = document.getElementById('categoryList');
	const allCategories = getAllCategories();
	const counts = getCategoryCounts();
	
	// Clear existing (except "All")
	categoryList.innerHTML = `
		<div class="category-item ${selectedCategory === 'all' ? 'active' : ''}" 
		     data-category="all" onclick="selectCategory('all')">
			<span class="category-name">All Characters</span>
			<span class="category-count">${counts.all}</span>
		</div>
	`;
	
	// Add category items
	for (const category of allCategories) {
		const item = document.createElement('div');
		item.className = `category-item ${selectedCategory === category ? 'active' : ''}`;
		item.setAttribute('data-category', category);
		item.onclick = () => selectCategory(category);
		
		item.innerHTML = `
			<span class="category-name">${category}</span>
			<span class="category-count">${counts[category] || 0}</span>
		`;
		
		categoryList.appendChild(item);
	}
}

function selectCategory(category) {
	selectedCategory = category;
	renderCategories();
	renderCharacters();
}

function encodeName(name) {
	return btoa(unescape(encodeURIComponent(name)));
}

function decodeName(b64) {
	return decodeURIComponent(escape(atob(b64)));
}

function switchTab(tabName) {
	// Map tab names to search term keys
	const tabMap = {
		characters: 'character',
		models: 'model',
		styles: 'style'
	};
	
	// Save current search
	const searchInput = document.getElementById('searchInput');
	const currentKey = tabMap[activeTab];
	savedSearches[currentKey] = searchInput.value;
	searchTerms[currentKey] = searchInput.value;
	
	activeTab = tabName;
	
	// Restore saved search for new tab
	const newKey = tabMap[tabName];
	searchInput.value = savedSearches[newKey] || '';
	searchTerms[newKey] = searchInput.value;
	
	// Update placeholder
	const placeholders = {
		characters: 'Search characters...',
		models: 'Search models...',
		styles: 'Search styles...'
	};
	searchInput.placeholder = placeholders[tabName];
	
	// Show/hide clear button
	document.getElementById('clearSearch').style.display = 
		searchInput.value ? 'block' : 'none';
	
	// Update tab buttons
	document.querySelectorAll('.tab-button').forEach(btn => {
		btn.classList.remove('active');
		if (btn.textContent.trim().toLowerCase() === tabName) {
			btn.classList.add('active');
		}
	});
	
	// Update tab content
	document.querySelectorAll('.tab-content').forEach(content => {
		content.classList.remove('active');
	});
	document.getElementById(`${tabName}Tab`).classList.add('active');
	
	// Render current tab
	if (tabName === 'characters') renderCharacters();
	else if (tabName === 'models') renderModels();
	else if (tabName === 'styles') renderStyles();
}

function clearSearch() {
	// Map tab names to search term keys
	const tabMap = {
		characters: 'character',
		models: 'model',
		styles: 'style'
	};
	
	const searchInput = document.getElementById('searchInput');
	const currentKey = tabMap[activeTab];
	
	searchInput.value = '';
	searchTerms[currentKey] = '';
	savedSearches[currentKey] = '';
	document.getElementById('clearSearch').style.display = 'none';
	
	if (activeTab === 'characters') renderCharacters();
	else if (activeTab === 'models') renderModels();
	else if (activeTab === 'styles') renderStyles();
	
	searchInput.focus();
}

async function loadData() {
	try {
		// Load autocomplete tags first
		await loadAutocompleteTags();
		
		// Load characters
		const charResponse = await fetch('/character_editor');
		if (charResponse.ok) {
			characters = await charResponse.json();
			await checkImages('character');
		}
		
		// Load models
		const modelResponse = await fetch('/model_editor');
		if (modelResponse.ok) {
			models = await modelResponse.json();
		}
		
		// Load styles
		const styleResponse = await fetch('/style_editor');
		if (styleResponse.ok) {
			styles = await styleResponse.json();
			await checkImages('style');
		}
		
		renderAll();
	} catch (error) {
		console.error('Load error:', error);
		showStatus('Error loading data: ' + error.message, 'error');
	}
}

async function checkImages(type) {
	const dataMap = {
		character: characters,
		style: styles
	};
	const imageMap = {
		character: characterImages,
		style: styleImages
	};
	const endpoint = type === 'character' ? 
		'/character_editor/image/' : '/style_editor/image/';

	for (const name of Object.keys(dataMap[type])) {
		const response = await fetch(
			`${endpoint}${encodeName(name)}`
		);
		imageMap[type][name] = response.ok;
	}
}

function getImageUrl(name, type = 'character') {
	const endpoint = type === 'character' ? 
		'/character_editor/image/' : '/style_editor/image/';
	return `${endpoint}${encodeName(name)}?t=${Date.now()}`;
}

function getSortedNames(obj) {
	return Object.keys(obj).sort((a, b) => 
		a.toLowerCase().localeCompare(b.toLowerCase())
	);
}

function renderAll() {
	renderCategories();
	renderCharacters();
	renderModels();
	renderStyles();
}

function renderCharacters() {
	const grid = document.getElementById('characterGrid');
	const emptyState = document.getElementById('emptyState');
	grid.innerHTML = '';

	// Add the "Add" card first
	const addCard = document.createElement('div');
	addCard.className = 'character-card add-card';
	addCard.innerHTML = '+';
	addCard.onclick = () => {
		showEditModal('character', '');
	};
	grid.appendChild(addCard);

	const sortedNames = getSortedNames(characters);
	const filteredNames = sortedNames.filter(name => {
		const char = characters[name];
		const searchLower = searchTerms.character.toLowerCase();
		
		const matchesName = name.toLowerCase().includes(searchLower);
		const categories = char.categories || '';
		const matchesCategorySearch = categories.toLowerCase().includes(searchLower);
		
		const matchesSearch = matchesName || matchesCategorySearch;
		const matchesCategoryFilter = characterMatchesCategory(name, selectedCategory);
		
		return matchesSearch && matchesCategoryFilter;
	});

	emptyState.style.display = filteredNames.length === 0 ? 'block' : 'none';

	for (const name of filteredNames) {
		const card = document.createElement('div');
		card.className = 'character-card';
		const hasImage = characterImages[name];
		if (hasImage) {
			card.classList.add('has-image');
			card.style.backgroundImage = `url(${getImageUrl(name)})`;
		}

		card.onclick = () => showEditModal('character', name);

		card.innerHTML = `
			${!hasImage ? '<div class="character-card-placeholder"></div>' : ''}
			<div class="upload-hint">Drop image here</div>
			<div class="character-card-name">${name}</div>
		`;

		setupDragAndDrop(card, name, 'character');
		grid.appendChild(card);
	}
}

function renderModels() {
	const grid = document.getElementById('modelGrid');
	const emptyState = document.getElementById('modelEmptyState');
	grid.innerHTML = '';

	// Add the "Add" card first
	const addCard = document.createElement('div');
	addCard.className = 'preset-card preset-add-card';
	addCard.innerHTML = '+';
	addCard.onclick = () => {
		showEditModal('model', '');
	};
	grid.appendChild(addCard);

	const sortedNames = getSortedNames(models);
	const filteredNames = sortedNames.filter(name =>
		name.toLowerCase().includes(searchTerms.model.toLowerCase())
	);

	emptyState.style.display = filteredNames.length === 0 ? 'block' : 'none';

	for (const name of filteredNames) {
		const model = models[name];
		const card = document.createElement('div');
		card.className = 'preset-card';
		card.onclick = () => showEditModal('model', name);

		const preview = model.quality?.positive || 
			model.embeddings?.positive || '';
		card.innerHTML = `
			<div class="preset-card-name">${name}</div>
			<div class="preset-card-content">${preview}</div>
		`;

		grid.appendChild(card);
	}
}

function renderStyles() {
	const grid = document.getElementById('styleGrid');
	const emptyState = document.getElementById('styleEmptyState');
	grid.innerHTML = '';

	// Add the "Add" card first
	const addCard = document.createElement('div');
	addCard.className = 'character-card add-card';
	addCard.innerHTML = '+';
	addCard.onclick = () => {
		showEditModal('style', '');
	};
	grid.appendChild(addCard);

	const sortedNames = getSortedNames(styles);
	const filteredNames = sortedNames.filter(name =>
		name.toLowerCase().includes(searchTerms.style.toLowerCase())
	);

	emptyState.style.display = filteredNames.length === 0 ? 'block' : 'none';

	for (const name of filteredNames) {
		const card = document.createElement('div');
		card.className = 'character-card';
		const hasImage = styleImages[name];
		if (hasImage) {
			card.classList.add('has-image');
			card.style.backgroundImage = `url(${getImageUrl(name, 'style')})`;
		}

		card.onclick = () => showEditModal('style', name);

		card.innerHTML = `
			${!hasImage ? '<div class="character-card-placeholder"></div>' : ''}
			<div class="upload-hint">Drop image here</div>
			<div class="character-card-name">${name}</div>
		`;

		setupDragAndDrop(card, name, 'style');
		grid.appendChild(card);
	}
}

function showAddModal(type) {
	currentAddType = type;
	const modal = document.getElementById('addModal');
	const title = document.getElementById('addModalTitle');
	const label = document.getElementById('addModalLabel');
	
	const typeNames = {
		character: 'Character',
		model: 'Model',
		style: 'Style'
	};
	
	title.textContent = `Add New ${typeNames[type]}`;
	label.textContent = `${typeNames[type]} Name`;
	document.getElementById('newItemName').value = '';
	modal.classList.add('show');
}

function hideAddModal() {
	document.getElementById('addModal').classList.remove('show');
	currentAddType = null;
}

function addItem() {
	const name = document.getElementById('newItemName').value.trim();

	if (!name) {
		alert('Please enter a name');
		return;
	}

	const dataMap = {
		character: characters,
		model: models,
		style: styles
	};

	if (dataMap[currentAddType][name]) {
		alert('Item already exists');
		return;
	}

	// Create default data based on type
	if (currentAddType === 'character') {
		characters[name] = {
			character: '',
			top: '',
			bottom: '',
			neg: ''
		};
	} else if (currentAddType === 'model') {
		models[name] = {
			quality: { positive: '', negative: '' },
			embeddings: { positive: '', negative: '' }
		};
	} else if (currentAddType === 'style') {
		styles[name] = {
			positive: '',
			negative: ''
		};
	}

	renderAll();
	hideAddModal();
	showEditModal(currentAddType, name);
}

function showEditModal(type, name) {
	currentEditName = name;
	currentEditType = type;

	if (type === 'character') {
		const data = characters[name] || {
			character: '',
			top: '',
			bottom: '',
			neg: '',
			categories: ''
		};
		
		currentOriginalName = name;
		document.getElementById('editCharNameInput').value = name;
		document.getElementById('editCharacter').value = data.character || '';
		document.getElementById('editTop').value = data.top || '';
		document.getElementById('editBottom').value = data.bottom || '';
		document.getElementById('editNeg').value = data.neg || '';
		document.getElementById('editCategories').value = data.categories || '';

		const preview = document.getElementById('imagePreview');
		const previewImg = document.getElementById('previewImg');
		if (name && characterImages[name]) {
			previewImg.src = getImageUrl(name);
			preview.style.display = 'block';
		} else {
			preview.style.display = 'none';
		}

		// Setup autocomplete for tag fields
		setupAutocomplete(document.getElementById('editCharacter'));
		setupAutocomplete(document.getElementById('editTop'));
		setupAutocomplete(document.getElementById('editBottom'));
		setupAutocomplete(document.getElementById('editNeg'));
		setupAutocomplete(document.getElementById('editCategories'));
		setupAutocomplete(document.getElementById('editCharNameInput'));

		// Setup drag and drop for modal
		if (name) {
			setupModalDragAndDrop('editModal', name, 'character');
		}

		document.getElementById('editModal').classList.add('show');
	} else if (type === 'model') {
		const data = models[name] || {
			quality: { positive: '', negative: '' },
			embeddings: { positive: '', negative: '' }
		};

		currentOriginalName = name; // Add this line
		document.getElementById('editModelNameInput').value = name; // Changed from textContent
		document.getElementById('editModelQualityPos').value = 
			data.quality?.positive || '';
		document.getElementById('editModelQualityNeg').value = 
			data.quality?.negative || '';
		document.getElementById('editModelEmbedPos').value = 
			data.embeddings?.positive || '';
		document.getElementById('editModelEmbedNeg').value = 
			data.embeddings?.negative || '';

		// Setup autocomplete for model fields
		setupAutocomplete(document.getElementById('editModelQualityPos'));
		setupAutocomplete(document.getElementById('editModelQualityNeg'));
		setupAutocomplete(document.getElementById('editModelEmbedPos'));
		setupAutocomplete(document.getElementById('editModelEmbedNeg'));

		document.getElementById('modelEditModal').classList.add('show');
	} else if (type === 'style') {
		const data = styles[name] || {
			positive: '',
			negative: ''
		};

		currentOriginalName = name; // Add this line
		document.getElementById('editStyleNameInput').value = name; // Changed from textContent
		document.getElementById('editStylePos').value = data.positive || '';
		document.getElementById('editStyleNeg').value = data.negative || '';

		const preview = document.getElementById('styleImagePreview');
		const previewImg = document.getElementById('stylePreviewImg');
		if (name && styleImages[name]) {
			previewImg.src = getImageUrl(name, 'style');
			preview.style.display = 'block';
		} else {
			preview.style.display = 'none';
		}

		// Setup autocomplete for style fields
		setupAutocomplete(document.getElementById('editStylePos'));
		setupAutocomplete(document.getElementById('editStyleNeg'));

		// Setup drag and drop for modal
		if (name) {
			setupModalDragAndDrop('styleEditModal', name, 'style');
		}

		document.getElementById('styleEditModal').classList.add('show');
	}
}

function setupModalDragAndDrop(modalId, name, type = 'character') {
	const modal = document.getElementById(modalId);
	const modalContent = modal.querySelector('.modal-content');
	
	// Remove any existing listeners
	const newModalContent = modalContent.cloneNode(true);
	modalContent.parentNode.replaceChild(newModalContent, modalContent);
	
	newModalContent.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.stopPropagation();
		newModalContent.classList.add('drag-over');
	});

	newModalContent.addEventListener('dragleave', (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.target === newModalContent) {
			newModalContent.classList.remove('drag-over');
		}
	});

	newModalContent.addEventListener('drop', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		newModalContent.classList.remove('drag-over');

		const files = e.dataTransfer.files;
		if (files.length > 0 && files[0].type.startsWith('image/')) {
			await processImage(files[0], name, type);
			
			// Update preview
			if (type === 'character') {
				const preview = document.getElementById('imagePreview');
				const previewImg = document.getElementById('previewImg');
				previewImg.src = getImageUrl(name);
				preview.style.display = 'block';
			} else if (type === 'style') {
				const preview = document.getElementById('styleImagePreview');
				const previewImg = document.getElementById('stylePreviewImg');
				previewImg.src = getImageUrl(name, 'style');
				preview.style.display = 'block';
			}
		}
	});
}

function hideEditModal(type) {
	if (type === 'character' || !type) {
		document.getElementById('editModal').classList.remove('show');
	}
	if (type === 'model') {
		document.getElementById('modelEditModal').classList.remove('show');
	}
	if (type === 'style') {
		document.getElementById('styleEditModal').classList.remove('show');
	}
	currentEditName = null;
	currentEditType = null;
	currentOriginalName = null; // Clear original name
}

async function saveItem(type) {
	if (!currentEditName && currentEditName !== '') return;

	if (type === 'character') {
		await saveCharacter();
	} else if (type === 'model') {
		const newName = document.getElementById('editModelNameInput').value.trim();
		
		if (!newName) {
			alert('Model name cannot be empty');
			return;
		}
		
		// Check if name changed and new name already exists
		if (newName !== currentOriginalName && currentOriginalName && models[newName]) {
			alert('A model with this name already exists');
			return;
		}
		
		const modelData = {
			quality: {
				positive: document.getElementById('editModelQualityPos').value,
				negative: document.getElementById('editModelQualityNeg').value
			},
			embeddings: {
				positive: document.getElementById('editModelEmbedPos').value,
				negative: document.getElementById('editModelEmbedNeg').value
			}
		};

		// If this is a new model (no original name)
		if (!currentOriginalName) {
			if (models[newName]) {
				alert('A model with this name already exists');
				return;
			}
			models[newName] = modelData;
		} else if (newName !== currentOriginalName) {
			// Rename: delete old, add new
			delete models[currentOriginalName];
			models[newName] = modelData;
		} else {
			// Just update existing
			models[currentOriginalName] = modelData;
		}

		try {
			const response = await fetch('/model_editor', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(models)
			});

			if (response.ok) {
				showStatus('Model saved successfully!', 'success');
				renderModels();
				hideEditModal('model');
			} else {
				throw new Error('Failed to save');
			}
		} catch (error) {
			showStatus('Error saving model: ' + error.message, 'error');
		}
	} else if (type === 'style') {
		const newName = document.getElementById('editStyleNameInput').value.trim();
		
		if (!newName) {
			alert('Style name cannot be empty');
			return;
		}
		
		// Check if name changed and new name already exists
		if (newName !== currentOriginalName && currentOriginalName && styles[newName]) {
			alert('A style with this name already exists');
			return;
		}
		
		const styleData = {
			positive: document.getElementById('editStylePos').value,
			negative: document.getElementById('editStyleNeg').value
		};

		// Handle image upload first if there is one
		const fileInput = document.getElementById('editStyleImage');
		if (fileInput.files.length > 0) {
			await processImage(fileInput.files[0], currentOriginalName || newName, 'style');
		}

		// If this is a new style (no original name)
		if (!currentOriginalName) {
			if (styles[newName]) {
				alert('A style with this name already exists');
				return;
			}
			styles[newName] = styleData;
		} else if (newName !== currentOriginalName) {
			// Rename: delete old, add new
			delete styles[currentOriginalName];
			styles[newName] = styleData;
			
			// Update image tracking if renaming
			if (styleImages[currentOriginalName]) {
				styleImages[newName] = true;
				delete styleImages[currentOriginalName];
			}
		} else {
			// Just update existing
			styles[currentOriginalName] = styleData;
		}

		try {
			const response = await fetch('/style_editor', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(styles)
			});

			if (response.ok) {
				showStatus('Style saved successfully!', 'success');
				renderStyles();
				hideEditModal('style');
			} else {
				throw new Error('Failed to save');
			}
		} catch (error) {
			showStatus('Error saving style: ' + error.message, 'error');
		}
	}
}

async function deleteCurrentItem(type) {
	if (!currentEditName) return;

	const typeNames = {
		character: 'character',
		model: 'model',
		style: 'style'
	};

	if (!confirm(`Delete ${typeNames[type]} "${currentEditName}"?`)) return;

	if (type === 'character') {
		await deleteCurrentCharacter();
	} else if (type === 'model') {
		delete models[currentEditName];

		try {
			const response = await fetch('/model_editor', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(models)
			});

			if (response.ok) {
				showStatus('Model deleted successfully!', 'success');
				renderModels();
				hideEditModal('model');
			} else {
				throw new Error('Failed to delete');
			}
		} catch (error) {
			showStatus('Error deleting model: ' + error.message, 'error');
		}
	} else if (type === 'style') {
		delete styles[currentEditName];

		try {
			const response = await fetch('/style_editor', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(styles)
			});

			if (response.ok) {
				showStatus('Style deleted successfully!', 'success');
				renderStyles();
				hideEditModal('style');
			} else {
				throw new Error('Failed to delete');
			}
		} catch (error) {
			showStatus('Error deleting style: ' + error.message, 'error');
		}
	}
}

// Keep existing character-specific functions
function setupDragAndDrop(card, name, type = 'character') {
	card.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.stopPropagation();
		card.classList.add('drag-over');
	});

	card.addEventListener('dragleave', (e) => {
		e.preventDefault();
		e.stopPropagation();
		card.classList.remove('drag-over');
	});

	card.addEventListener('drop', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		card.classList.remove('drag-over');

		const files = e.dataTransfer.files;
		if (files.length > 0 && files[0].type.startsWith('image/')) {
			await processImage(files[0], name, type);
		}
	});
}

async function processImage(file, name, type = 'character') {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = async (e) => {
			try {
				const endpoint = type === 'character' ? 
					'/character_editor/image/' : '/style_editor/image/';
				const response = await fetch(
					`${endpoint}${encodeName(name)}`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							image: e.target.result
						})
					}
				);

				if (response.ok) {
					if (type === 'character') {
						characterImages[name] = true;
						renderCharacters();
					} else {
						styleImages[name] = true;
						renderStyles();
					}
					showStatus('Image updated!', 'success');
				} else {
					throw new Error('Failed to upload image');
				}
				resolve();
			} catch (error) {
				showStatus('Error uploading image: ' + error.message, 
					'error');
				resolve();
			}
		};
		reader.readAsDataURL(file);
	});
}

async function removeImage(type = 'character') {
	if (!currentEditName) return;

	const typeLabel = type === 'character' ? 'character' : 'style';
	if (!confirm(`Remove image from this ${typeLabel}?`)) return;

	try {
		const endpoint = type === 'character' ? 
			'/character_editor/image/' : '/style_editor/image/';
		const response = await fetch(
			`${endpoint}${encodeName(currentEditName)}`,
			{
				method: 'DELETE'
			}
		);

		if (response.ok || response.status === 404) {
			if (type === 'character') {
				characterImages[currentEditName] = false;
				document.getElementById('imagePreview').style.display = 
					'none';
				renderCharacters();
			} else {
				styleImages[currentEditName] = false;
				document.getElementById('styleImagePreview').style.display = 
					'none';
				renderStyles();
			}
			showStatus('Image removed!', 'success');
		} else {
			throw new Error('Failed to delete image');
		}
	} catch (error) {
		showStatus('Error removing image: ' + error.message, 'error');
	}
}

async function saveCharacter() {
	const newName = document.getElementById('editCharNameInput').value.trim();
	
	if (!newName) {
		alert('Character name cannot be empty');
		return;
	}
	
	// Check if name changed and new name already exists
	if (newName !== currentOriginalName && currentOriginalName && characters[newName]) {
		alert('A character with this name already exists');
		return;
	}

	const characterData = {
		character: document.getElementById('editCharacter').value,
		top: document.getElementById('editTop').value,
		bottom: document.getElementById('editBottom').value,
		neg: document.getElementById('editNeg').value,
		categories: document.getElementById('editCategories').value
	};

	// Handle image upload first if there is one
	const fileInput = document.getElementById('editImage');
	if (fileInput.files.length > 0) {
		await processImage(fileInput.files[0], currentOriginalName || newName);
	}

	// If this is a new character (no original name)
	if (!currentOriginalName) {
		if (characters[newName]) {
			alert('A character with this name already exists');
			return;
		}
		
		characters[newName] = characterData;

		try {
			const response = await fetch('/character_editor', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(characters)
			});

			if (response.ok) {
				showStatus('Character created successfully!', 'success');
				renderAll();
				hideEditModal('character');
			} else {
				throw new Error('Failed to save');
			}
		} catch (error) {
			showStatus('Error creating character: ' + error.message, 'error');
			// Remove the character if save failed
			delete characters[newName];
		}
		return;
	}

	// If name changed, use rename endpoint
	if (newName !== currentOriginalName) {
		try {
			const response = await fetch('/character_editor/rename', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					oldName: currentOriginalName,
					newName: newName,
					data: characterData
				})
			});

			if (response.ok) {
				// Update local data
				delete characters[currentOriginalName];
				characters[newName] = characterData;
				
				// Update image tracking
				if (characterImages[currentOriginalName]) {
					characterImages[newName] = true;
					delete characterImages[currentOriginalName];
				}
				
				showStatus('Character renamed successfully!', 'success');
				renderAll();
				hideEditModal('character');
			} else {
				const error = await response.json();
				throw new Error(error.error || 'Failed to rename');
			}
		} catch (error) {
			showStatus('Error renaming character: ' + error.message, 'error');
		}
	} else {
		// Just update the data
		characters[currentOriginalName] = characterData;

		try {
			const response = await fetch('/character_editor', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(characters)
			});

			if (response.ok) {
				showStatus('Character saved successfully!', 'success');
				renderAll();
				hideEditModal('character');
			} else {
				throw new Error('Failed to save');
			}
		} catch (error) {
			showStatus('Error saving character: ' + error.message, 'error');
		}
	}
}

async function deleteCurrentCharacter() {
	if (!currentEditName) return;

	if (!confirm(`Delete character "${currentEditName}"?`)) return;

	delete characters[currentEditName];

	try {
		const response = await fetch('/character_editor', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(characters)
		});

		if (response.ok) {
			showStatus('Character deleted successfully!', 'success');
			renderAll(); // Changed from renderCharacters() to update categories
			hideEditModal('character');
		} else {
			throw new Error('Failed to delete');
		}
	} catch (error) {
		showStatus('Error deleting character: ' + error.message, 'error');
	}
}

function showStatus(message, type) {
	const status = document.getElementById('status');
	status.textContent = message;
	status.className = `status ${type} show`;
	
	// Clear any existing timeout
	if (status.hideTimeout) {
		clearTimeout(status.hideTimeout);
	}
	
	// Set timeout to start slide-out animation
	status.hideTimeout = setTimeout(() => {
		status.classList.add('hiding');
		
		// Remove after animation completes
		setTimeout(() => {
			status.classList.remove('show', 'hiding');
		}, 300); // Match animation duration
	}, 3000);
}

// Event listeners
document.getElementById('searchInput').addEventListener('input', (e) => {
	// Map tab names to search term keys
	const tabMap = {
		characters: 'character',
		models: 'model',
		styles: 'style'
	};
	
	const value = e.target.value;
	const currentKey = tabMap[activeTab];
	
	searchTerms[currentKey] = value;
	savedSearches[currentKey] = value;
	
	// Show/hide clear button
	document.getElementById('clearSearch').style.display = 
		value ? 'block' : 'none';
	
	if (activeTab === 'characters') renderCharacters();
	else if (activeTab === 'models') renderModels();
	else if (activeTab === 'styles') renderStyles();
});

document.getElementById('editModal').addEventListener('click', (e) => {
	if (e.target.id === 'editModal') hideEditModal('character');
});

document.getElementById('modelEditModal').addEventListener('click', 
	(e) => {
		if (e.target.id === 'modelEditModal') hideEditModal('model');
	}
);

document.getElementById('styleEditModal').addEventListener('click', 
	(e) => {
		if (e.target.id === 'styleEditModal') hideEditModal('style');
	}
);

document.addEventListener('click', (e) => {
	const dropdown = document.getElementById('autocompleteDropdown');
	if (dropdown && 
	    dropdown.style.display === 'block' && 
	    !dropdown.contains(e.target) && 
	    e.target !== autocompleteState.activeElement) {
		hideAutocomplete();
	}
});

loadData();
