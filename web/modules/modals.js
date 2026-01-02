import { state } from './state.js';
import { showStatus } from './utils.js';
import { getImageUrl, saveCharacters, saveModels, saveStyles, saveTags, renameCharacter, deleteImage } from './api.js';
import { setupAutocomplete } from './autocomplete.js';
import { setupModalDragAndDrop } from './dragdrop.js';
import { setupWeightAdjustment } from './weight-adjustment.js';

export function showEditModal(type, name) {
	state.currentEditName = name;
	state.currentEditType = type;

	if (type === 'character') {
		const data = state.characters[name] || {
			character: '',
			top: '',
			bottom: '',
			neg: '',
			categories: ''
		};
		
		state.currentOriginalName = name;
		document.getElementById('editCharNameInput').value = name;
		document.getElementById('editCharacter').value = data.character || '';
		document.getElementById('editTop').value = data.top || '';
		document.getElementById('editBottom').value = data.bottom || '';
		document.getElementById('editNeg').value = data.neg || '';
		document.getElementById('editCategories').value = data.categories || '';

		const preview = document.getElementById('imagePreview');
		const previewImg = document.getElementById('previewImg');
		if (name && state.characterImages[name]) {
			previewImg.src = getImageUrl(name);
			preview.style.display = 'block';
		} else {
			preview.style.display = 'none';
		}

		if (name) {
			setupModalDragAndDrop('editModal', name, 'character');
		}

		setupAutocomplete(document.getElementById('editCharacter'));
		setupAutocomplete(document.getElementById('editTop'));
		setupAutocomplete(document.getElementById('editBottom'));
		setupAutocomplete(document.getElementById('editNeg'));
		setupAutocomplete(document.getElementById('editCategories'));
		setupAutocomplete(document.getElementById('editCharNameInput'), false);

		setupWeightAdjustment(document.getElementById('editCharacter'));
		setupWeightAdjustment(document.getElementById('editTop'));
		setupWeightAdjustment(document.getElementById('editBottom'));
		setupWeightAdjustment(document.getElementById('editNeg'));
		setupWeightAdjustment(document.getElementById('editCategories'));
		setupWeightAdjustment(document.getElementById('editCharNameInput'));

		document.getElementById('editModal').classList.add('show');
	} else if (type === 'model') {
		const data = state.models[name] || {
			quality: { positive: '', negative: '' },
			embeddings: { positive: '', negative: '' }
		};

		state.currentOriginalName = name;
		document.getElementById('editModelNameInput').value = name;
		document.getElementById('editModelQualityPos').value = 
			data.quality?.positive || '';
		document.getElementById('editModelQualityNeg').value = 
			data.quality?.negative || '';
		document.getElementById('editModelEmbedPos').value = 
			data.embeddings?.positive || '';
		document.getElementById('editModelEmbedNeg').value = 
			data.embeddings?.negative || '';

		setupAutocomplete(document.getElementById('editModelQualityPos'));
		setupAutocomplete(document.getElementById('editModelQualityNeg'));
		setupAutocomplete(document.getElementById('editModelEmbedPos'));
		setupAutocomplete(document.getElementById('editModelEmbedNeg'));

		setupWeightAdjustment(document.getElementById('editModelQualityPos'));
		setupWeightAdjustment(document.getElementById('editModelQualityNeg'));
		setupWeightAdjustment(document.getElementById('editModelEmbedPos'));
		setupWeightAdjustment(document.getElementById('editModelEmbedNeg'));

		document.getElementById('modelEditModal').classList.add('show');
	} else if (type === 'style') {
		const data = state.styles[name] || {
			positive: '',
			negative: ''
		};

		state.currentOriginalName = name;
		document.getElementById('editStyleNameInput').value = name;
		document.getElementById('editStylePos').value = data.positive || '';
		document.getElementById('editStyleNeg').value = data.negative || '';

		const preview = document.getElementById('styleImagePreview');
		const previewImg = document.getElementById('stylePreviewImg');
		if (name && state.styleImages[name]) {
			previewImg.src = getImageUrl(name, 'style');
			preview.style.display = 'block';
		} else {
			preview.style.display = 'none';
		}

		if (name) {
			setupModalDragAndDrop('styleEditModal', name, 'style');
		}

		setupAutocomplete(document.getElementById('editStylePos'));
		setupAutocomplete(document.getElementById('editStyleNeg'));

		setupWeightAdjustment(document.getElementById('editStylePos'));
		setupWeightAdjustment(document.getElementById('editStyleNeg'));

		document.getElementById('styleEditModal').classList.add('show');
	} else if (type === 'tag') {
		const data = state.tags[name] || {
			positive: '',
			negative: ''
		};

		state.currentOriginalName = name;
		document.getElementById('editTagNameInput').value = name;
		document.getElementById('editTagPos').value = data.positive || '';
		document.getElementById('editTagNeg').value = data.negative || '';

		setupAutocomplete(document.getElementById('editTagPos'));
		setupAutocomplete(document.getElementById('editTagNeg'));
		setupAutocomplete(document.getElementById('editTagNameInput'));

		setupWeightAdjustment(document.getElementById('editTagPos'));
		setupWeightAdjustment(document.getElementById('editTagNeg'));
		setupWeightAdjustment(document.getElementById('editTagNameInput'));

		document.getElementById('tagEditModal').classList.add('show');
	}
}

export function hideEditModal(type) {
	if (type === 'character' || !type) {
		document.getElementById('editModal').classList.remove('show');
	}
	if (type === 'model') {
		document.getElementById('modelEditModal').classList.remove('show');
	}
	if (type === 'style') {
		document.getElementById('styleEditModal').classList.remove('show');
	}
	if (type === 'tag') {
		document.getElementById('tagEditModal').classList.remove('show');
	}
	state.currentEditName = null;
	state.currentEditType = null;
	state.currentOriginalName = null;
}

export async function saveCharacter() {
	const newName = document.getElementById('editCharNameInput').value.trim();
	
	if (!newName) {
		alert('Character name cannot be empty');
		return;
	}
	
	if (newName !== state.currentOriginalName && state.currentOriginalName && state.characters[newName]) {
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

	const fileInput = document.getElementById('editImage');
	if (fileInput.files.length > 0) {
		const { uploadImage } = await import('./api.js');
		await uploadImage(fileInput.files[0], state.currentOriginalName || newName);
	}

	if (!state.currentOriginalName) {
		if (state.characters[newName]) {
			alert('A character with this name already exists');
			return;
		}
		
		state.characters[newName] = characterData;

		try {
			await saveCharacters(state.characters);
			showStatus('Character created successfully!', 'success');
			if (window.renderAll) window.renderAll();
			hideEditModal('character');
		} catch (error) {
			showStatus('Error creating character: ' + error.message, 'error');
			delete state.characters[newName];
		}
		return;
	}

	if (newName !== state.currentOriginalName) {
		try {
			await renameCharacter(state.currentOriginalName, newName, characterData);
			
			delete state.characters[state.currentOriginalName];
			state.characters[newName] = characterData;
			
			if (state.characterImages[state.currentOriginalName]) {
				state.characterImages[newName] = true;
				delete state.characterImages[state.currentOriginalName];
			}
			
			showStatus('Character renamed successfully!', 'success');
			if (window.renderAll) window.renderAll();
			hideEditModal('character');
		} catch (error) {
			showStatus('Error renaming character: ' + error.message, 'error');
		}
	} else {
		state.characters[state.currentOriginalName] = characterData;

		try {
			await saveCharacters(state.characters);
			showStatus('Character saved successfully!', 'success');
			if (window.renderAll) window.renderAll();
			hideEditModal('character');
		} catch (error) {
			showStatus('Error saving character: ' + error.message, 'error');
		}
	}
}

export async function saveItem(type) {
	if (!state.currentEditName && state.currentEditName !== '') return;

	if (type === 'character') {
		await saveCharacter();
	} else if (type === 'model') {
		const newName = document.getElementById('editModelNameInput').value.trim();
		
		if (!newName) {
			alert('Model name cannot be empty');
			return;
		}
		
		if (newName !== state.currentOriginalName && state.currentOriginalName && state.models[newName]) {
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

		if (!state.currentOriginalName) {
			if (state.models[newName]) {
				alert('A model with this name already exists');
				return;
			}
			state.models[newName] = modelData;
		} else if (newName !== state.currentOriginalName) {
			delete state.models[state.currentOriginalName];
			state.models[newName] = modelData;
		} else {
			state.models[state.currentOriginalName] = modelData;
		}

		try {
			await saveModels(state.models);
			showStatus('Model saved successfully!', 'success');
			if (window.renderModels) window.renderModels();
			hideEditModal('model');
		} catch (error) {
			showStatus('Error saving model: ' + error.message, 'error');
		}
	} else if (type === 'style') {
		const newName = document.getElementById('editStyleNameInput').value.trim();
		
		if (!newName) {
			alert('Style name cannot be empty');
			return;
		}
		
		if (newName !== state.currentOriginalName && state.currentOriginalName && state.styles[newName]) {
			alert('A style with this name already exists');
			return;
		}
		
		const styleData = {
			positive: document.getElementById('editStylePos').value,
			negative: document.getElementById('editStyleNeg').value
		};

		const fileInput = document.getElementById('editStyleImage');
		if (fileInput.files.length > 0) {
			const { uploadImage } = await import('./api.js');
			await uploadImage(fileInput.files[0], state.currentOriginalName || newName, 'style');
		}

		if (!state.currentOriginalName) {
			if (state.styles[newName]) {
				alert('A style with this name already exists');
				return;
			}
			state.styles[newName] = styleData;
		} else if (newName !== state.currentOriginalName) {
			delete state.styles[state.currentOriginalName];
			state.styles[newName] = styleData;
			
			if (state.styleImages[state.currentOriginalName]) {
				state.styleImages[newName] = true;
				delete state.styleImages[state.currentOriginalName];
			}
		} else {
			state.styles[state.currentOriginalName] = styleData;
		}

		try {
			await saveStyles(state.styles);
			showStatus('Style saved successfully!', 'success');
			if (window.renderStyles) window.renderStyles();
			hideEditModal('style');
		} catch (error) {
			showStatus('Error saving style: ' + error.message, 'error');
		}
	} else if (type === 'tag') {
		const newName = document.getElementById('editTagNameInput').value.trim();
		
		if (!newName) {
			alert('Tag name cannot be empty');
			return;
		}
		
		if (newName !== state.currentOriginalName && 
		    state.currentOriginalName && 
		    state.tags[newName]) {
			alert('A tag preset with this name already exists');
			return;
		}
		
		const tagData = {
			positive: document.getElementById('editTagPos').value,
			negative: document.getElementById('editTagNeg').value
		};

		if (!state.currentOriginalName) {
			if (state.tags[newName]) {
				alert('A tag preset with this name already exists');
				return;
			}
			state.tags[newName] = tagData;
		} else if (newName !== state.currentOriginalName) {
			delete state.tags[state.currentOriginalName];
			state.tags[newName] = tagData;
		} else {
			state.tags[state.currentOriginalName] = tagData;
		}

		try {
			await saveTags(state.tags);
			showStatus('Tag preset saved successfully!', 'success');
			if (window.renderTags) window.renderTags();
			hideEditModal('tag');
		} catch (error) {
			showStatus('Error saving tag preset: ' + error.message, 'error');
		}
	}
}

export async function deleteCurrentItem(type) {
	if (!state.currentEditName) return;

	const typeNames = {
		character: 'character',
		model: 'model',
		style: 'style',
		tag: 'tag preset'
	};

	if (!confirm(`Delete ${typeNames[type]} "${state.currentEditName}"?`)) return;

	if (type === 'character') {
		delete state.characters[state.currentEditName];

		try {
			await saveCharacters(state.characters);
			showStatus('Character deleted successfully!', 'success');
			if (window.renderAll) window.renderAll();
			hideEditModal('character');
		} catch (error) {
			showStatus('Error deleting character: ' + error.message, 'error');
		}
	} else if (type === 'model') {
		delete state.models[state.currentEditName];

		try {
			await saveModels(state.models);
			showStatus('Model deleted successfully!', 'success');
			if (window.renderModels) window.renderModels();
			hideEditModal('model');
		} catch (error) {
			showStatus('Error deleting model: ' + error.message, 'error');
		}
	} else if (type === 'style') {
		delete state.styles[state.currentEditName];

		try {
			await saveStyles(state.styles);
			showStatus('Style deleted successfully!', 'success');
			if (window.renderStyles) window.renderStyles();
			hideEditModal('style');
		} catch (error) {
			showStatus('Error deleting style: ' + error.message, 'error');
		}
	} else if (type === 'tag') {
		delete state.tags[state.currentEditName];

		try {
			await saveTags(state.tags);
			showStatus('Tag preset deleted successfully!', 'success');
			if (window.renderTags) window.renderTags();
			hideEditModal('tag');
		} catch (error) {
			showStatus('Error deleting tag preset: ' + error.message, 'error');
		}
	}
}

export async function removeImage(type = 'character') {
	if (!state.currentEditName) return;

	const typeLabel = type === 'character' ? 'character' : 'style';
	if (!confirm(`Remove image from this ${typeLabel}?`)) return;

	try {
		await deleteImage(state.currentEditName, type);
		
		if (type === 'character') {
			state.characterImages[state.currentEditName] = false;
			document.getElementById('imagePreview').style.display = 'none';
			if (window.renderCharacters) window.renderCharacters();
		} else {
			state.styleImages[state.currentEditName] = false;
			document.getElementById('styleImagePreview').style.display = 'none';
			if (window.renderStyles) window.renderStyles();
		}
		showStatus('Image removed!', 'success');
	} catch (error) {
		showStatus('Error removing image: ' + error.message, 'error');
	}
}
