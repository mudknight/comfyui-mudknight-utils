let characters = {};
let models = {};
let styles = {};
let currentEditName = null;
let currentEditType = null;
let currentAddType = null;
let searchTerms = {
	character: '',
	model: '',
	style: ''
};
let characterImages = {};
let styleImages = {};
let activeTab = 'characters';

function encodeName(name) {
	return btoa(unescape(encodeURIComponent(name)));
}

function decodeName(b64) {
	return decodeURIComponent(escape(atob(b64)));
}

function switchTab(tabName) {
	activeTab = tabName;
	
	// Update tab buttons
	document.querySelectorAll('.tab-button').forEach(btn => {
		btn.classList.remove('active');
	});
	event.target.classList.add('active');
	
	// Update tab content
	document.querySelectorAll('.tab-content').forEach(content => {
		content.classList.remove('active');
	});
	document.getElementById(`${tabName}Tab`).classList.add('active');
}

async function loadData() {
	try {
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
	renderCharacters();
	renderModels();
	renderStyles();
}

function renderCharacters() {
	const grid = document.getElementById('characterGrid');
	const emptyState = document.getElementById('emptyState');
	grid.innerHTML = '';

	const sortedNames = getSortedNames(characters);
	const filteredNames = sortedNames.filter(name =>
		name.toLowerCase().includes(searchTerms.character.toLowerCase())
	);

	if (filteredNames.length === 0) {
		grid.style.display = 'none';
		emptyState.style.display = 'block';
		return;
	}

	grid.style.display = 'grid';
	emptyState.style.display = 'none';

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

		setupDragAndDrop(card, name);
		grid.appendChild(card);
	}
}

function renderModels() {
	const grid = document.getElementById('modelGrid');
	const emptyState = document.getElementById('modelEmptyState');
	grid.innerHTML = '';

	const sortedNames = getSortedNames(models);
	const filteredNames = sortedNames.filter(name =>
		name.toLowerCase().includes(searchTerms.model.toLowerCase())
	);

	if (filteredNames.length === 0) {
		grid.style.display = 'none';
		emptyState.style.display = 'block';
		return;
	}

	grid.style.display = 'grid';
	emptyState.style.display = 'none';

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

	const sortedNames = getSortedNames(styles);
	const filteredNames = sortedNames.filter(name =>
		name.toLowerCase().includes(searchTerms.style.toLowerCase())
	);

	if (filteredNames.length === 0) {
		grid.style.display = 'none';
		emptyState.style.display = 'block';
		return;
	}

	grid.style.display = 'grid';
	emptyState.style.display = 'none';

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
		const data = characters[name];
		document.getElementById('editCharName').textContent = name;
		document.getElementById('editCharacter').value = 
			data.character || '';
		document.getElementById('editTop').value = data.top || '';
		document.getElementById('editBottom').value = data.bottom || '';
		document.getElementById('editNeg').value = data.neg || '';

		const preview = document.getElementById('imagePreview');
		const previewImg = document.getElementById('previewImg');
		if (characterImages[name]) {
			previewImg.src = getImageUrl(name);
			preview.style.display = 'block';
		} else {
			preview.style.display = 'none';
		}

		document.getElementById('editModal').classList.add('show');
	} else if (type === 'model') {
		const data = models[name];
		document.getElementById('editModelName').textContent = name;
		document.getElementById('editModelQualityPos').value = 
			data.quality?.positive || '';
		document.getElementById('editModelQualityNeg').value = 
			data.quality?.negative || '';
		document.getElementById('editModelEmbedPos').value = 
			data.embeddings?.positive || '';
		document.getElementById('editModelEmbedNeg').value = 
			data.embeddings?.negative || '';

		document.getElementById('modelEditModal').classList.add('show');
	} else if (type === 'style') {
		const data = styles[name];
		document.getElementById('editStyleName').textContent = name;
		document.getElementById('editStylePos').value = 
			data.positive || '';
		document.getElementById('editStyleNeg').value = 
			data.negative || '';

		const preview = document.getElementById('styleImagePreview');
		const previewImg = document.getElementById('stylePreviewImg');
		if (styleImages[name]) {
			previewImg.src = getImageUrl(name, 'style');
			preview.style.display = 'block';
		} else {
			preview.style.display = 'none';
		}

		document.getElementById('styleEditModal').classList.add('show');
	}
}

function hideEditModal(type) {
	if (type === 'character') {
		document.getElementById('editModal').classList.remove('show');
	} else if (type === 'model') {
		document.getElementById('modelEditModal').classList.remove('show');
	} else if (type === 'style') {
		document.getElementById('styleEditModal').classList.remove('show');
	}
	currentEditName = null;
	currentEditType = null;
}

async function saveItem(type) {
	if (!currentEditName) return;

	if (type === 'character') {
		await saveCharacter();
	} else if (type === 'model') {
		models[currentEditName] = {
			quality: {
				positive: document.getElementById(
					'editModelQualityPos').value,
				negative: document.getElementById(
					'editModelQualityNeg').value
			},
			embeddings: {
				positive: document.getElementById(
					'editModelEmbedPos').value,
				negative: document.getElementById(
					'editModelEmbedNeg').value
			}
		};

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
		styles[currentEditName] = {
			positive: document.getElementById('editStylePos').value,
			negative: document.getElementById('editStyleNeg').value
		};

		const fileInput = document.getElementById('editStyleImage');
		if (fileInput.files.length > 0) {
			await processImage(fileInput.files[0], currentEditName, 'style');
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
	if (!currentEditName) return;

	characters[currentEditName] = {
		character: document.getElementById('editCharacter').value,
		top: document.getElementById('editTop').value,
		bottom: document.getElementById('editBottom').value,
		neg: document.getElementById('editNeg').value
	};

	const fileInput = document.getElementById('editImage');
	if (fileInput.files.length > 0) {
		await processImage(fileInput.files[0], currentEditName);
	}

	try {
		const response = await fetch('/character_editor', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(characters)
		});

		if (response.ok) {
			showStatus('Character saved successfully!', 'success');
			renderCharacters();
			hideEditModal('character');
		} else {
			throw new Error('Failed to save');
		}
	} catch (error) {
		showStatus('Error saving character: ' + error.message, 'error');
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
			renderCharacters();
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
	setTimeout(() => status.classList.remove('show'), 3000);
}

// Event listeners
document.getElementById('searchInput').addEventListener('input', (e) => {
	searchTerms.character = e.target.value;
	renderCharacters();
});

document.getElementById('modelSearchInput').addEventListener('input', 
	(e) => {
		searchTerms.model = e.target.value;
		renderModels();
	}
);

document.getElementById('styleSearchInput').addEventListener('input', 
	(e) => {
		searchTerms.style = e.target.value;
		renderStyles();
	}
);

document.getElementById('addModal').addEventListener('click', (e) => {
	if (e.target.id === 'addModal') hideAddModal();
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

loadData();
