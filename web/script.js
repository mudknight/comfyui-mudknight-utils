let characters = {};
let currentEditName = null;
let searchTerm = '';
let characterImages = {};

function encodeName(name) {
    return btoa(unescape(encodeURIComponent(name)));
}

function decodeName(b64) {
    return decodeURIComponent(escape(atob(b64)));
}

async function loadCharacters() {
	try {
		const response = await fetch('/character_editor');
		console.log('Response status:', response.status);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		console.log('Loaded characters:', data);
		characters = data;

		// Load image availability
		await checkImages();

		renderCharacters();
	} catch (error) {
		console.error('Load error:', error);
		showStatus('Error loading characters: ' + error.message, 
			'error');
	}
}

async function checkImages() {
	for (const name of Object.keys(characters)) {
		const response = await fetch(
			`/character_editor/image/${encodeName(name)}`
		);
		characterImages[name] = response.ok;
	}
}

function getImageUrl(name) {
	return `/character_editor/image/${encodeName(name)}` +
		`?t=${Date.now()}`;
}

function getSortedCharacterNames() {
	return Object.keys(characters).sort((a, b) => 
		a.toLowerCase().localeCompare(b.toLowerCase())
	);
}

function renderCharacters() {
	const grid = document.getElementById('characterGrid');
	const emptyState = document.getElementById('emptyState');
	grid.innerHTML = '';

	const sortedNames = getSortedCharacterNames();
	const filteredNames = sortedNames.filter(name =>
		name.toLowerCase().includes(searchTerm.toLowerCase())
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

		card.onclick = (e) => {
			showEditModal(name);
		};

		card.innerHTML = `
	    ${!hasImage ? '<div class="character-card-placeholder"></div>' : ''}
	    <div class="upload-hint">Drop image here</div>
	    <div class="character-card-name">${name}</div>
	`;

		setupDragAndDrop(card, name);
		grid.appendChild(card);
	}
}

function showEditModal(name) {
	currentEditName = name;
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
}

function setupDragAndDrop(card, name) {
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
			await processImage(files[0], name);
		}
	});
}

async function processImage(file, name) {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = async (e) => {
			try {
				const response = await fetch(
					`/character_editor/image/` +
					`${encodeName(name)}`,
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
					characterImages[name] = true;
					renderCharacters();
					showStatus('Image updated!', 'success');
				} else {
					throw new Error('Failed to upload image');
				}
				resolve();
			} catch (error) {
				showStatus('Error uploading image: ' + 
					error.message, 'error');
				resolve();
			}
		};
		reader.readAsDataURL(file);
	});
}

async function saveCharacterData(name) {
	try {
		const response = await fetch('/character_editor', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(characters)
		});

		if (!response.ok) {
			throw new Error('Failed to save');
		}
	} catch (error) {
		showStatus('Error saving: ' + error.message, 'error');
	}
}

async function removeImage() {
	if (!currentEditName) return;

	if (!confirm('Remove image from this character?')) return;

	try {
		const response = await fetch(
			`/character_editor/image/` +
			`${encodeName(currentEditName)}`,
			{
				method: 'DELETE'
			}
		);

		if (response.ok || response.status === 404) {
			characterImages[currentEditName] = false;
			document.getElementById('imagePreview').style.display = 
				'none';
			renderCharacters();
			showStatus('Image removed!', 'success');
		} else {
			throw new Error('Failed to delete image');
		}
	} catch (error) {
		showStatus('Error removing image: ' + error.message, 
			'error');
	}
}

function hideEditModal() {
	document.getElementById('editModal').classList.remove('show');
	currentEditName = null;
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
			hideEditModal();
		} else {
			throw new Error('Failed to save');
		}
	} catch (error) {
		showStatus('Error saving character: ' + error.message, 
			'error');
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
			hideEditModal();
		} else {
			throw new Error('Failed to delete');
		}
	} catch (error) {
		showStatus('Error deleting character: ' + error.message, 
			'error');
	}
}

function showAddModal() {
	document.getElementById('addModal').classList.add('show');
	document.getElementById('newCharName').value = '';
}

function hideAddModal() {
	document.getElementById('addModal').classList.remove('show');
}

function addCharacter() {
	const name = document.getElementById('newCharName').value.trim();

	if (!name) {
		alert('Please enter a character name');
		return;
	}

	if (characters[name]) {
		alert('Character already exists');
		return;
	}

	characters[name] = {
		character: '',
		top: '',
		bottom: '',
		neg: ''
	};

	renderCharacters();
	hideAddModal();
	showEditModal(name);
}

function showStatus(message, type) {
	const status = document.getElementById('status');
	status.textContent = message;
	status.className = `status ${type} show`;
	setTimeout(() => status.classList.remove('show'), 3000);
}

document.getElementById('searchInput').addEventListener('input', 
	(e) => {
		searchTerm = e.target.value;
		renderCharacters();
	}
);

document.getElementById('addModal').addEventListener('click', (e) => {
	if (e.target.id === 'addModal') hideAddModal();
});

document.getElementById('editModal').addEventListener('click', 
	(e) => {
		if (e.target.id === 'editModal') hideEditModal();
	}
);

loadCharacters();
