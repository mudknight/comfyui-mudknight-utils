import { state } from './state.js';
import { encodeName } from './utils.js';

export async function loadCharacters() {
	const response = await fetch('/character_editor');
	if (response.ok) {
		return await response.json();
	}
	throw new Error('Failed to load characters');
}

export async function loadModels() {
	const response = await fetch('/model_editor');
	if (response.ok) {
		return await response.json();
	}
	throw new Error('Failed to load models');
}

export async function loadStyles() {
	const response = await fetch('/style_editor');
	if (response.ok) {
		return await response.json();
	}
	throw new Error('Failed to load styles');
}

export async function loadTags() {
	const response = await fetch('/tag_editor');
	if (response.ok) {
		return await response.json();
	}
	throw new Error('Failed to load tags');
}

export async function loadAutocompleteTags() {
	try {
		const response = await fetch('autocomplete.txt');
		if (!response.ok) {
			console.log('Autocomplete file not found');
			return [];
		}
		
		const text = await response.text();
		const lines = text.split('\n');
		
		const tags = lines
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
			.sort((a, b) => b.count - a.count);
		
		console.log(`Loaded ${tags.length} autocomplete tags`);
		return tags;
	} catch (error) {
		console.error('Error loading autocomplete tags:', error);
		return [];
	}
}

export async function saveCharacters(characters) {
	const response = await fetch('/character_editor', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(characters)
	});
	if (!response.ok) {
		throw new Error('Failed to save characters');
	}
}

export async function saveModels(models) {
	const response = await fetch('/model_editor', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(models)
	});
	if (!response.ok) {
		throw new Error('Failed to save models');
	}
}

export async function saveStyles(styles) {
	const response = await fetch('/style_editor', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(styles)
	});
	if (!response.ok) {
		throw new Error('Failed to save styles');
	}
}

export async function saveTags(tags) {
	const response = await fetch('/tag_editor', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(tags)
	});
	if (!response.ok) {
		throw new Error('Failed to save tags');
	}
}

export async function renameCharacter(oldName, newName, data) {
	const response = await fetch('/character_editor/rename', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			oldName: oldName,
			newName: newName,
			data: data
		})
	});
	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to rename');
	}
}

export async function checkImages(type) {
	const dataMap = {
		character: state.characters,
		style: state.styles
	};
	const imageMap = {
		character: state.characterImages,
		style: state.styleImages
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

export function getImageUrl(name, type = 'character') {
	const endpoint = type === 'character' ? 
		'/character_editor/image/' : '/style_editor/image/';
	return `${endpoint}${encodeName(name)}?t=${Date.now()}`;
}

export async function uploadImage(file, name, type = 'character') {
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
						state.characterImages[name] = true;
					} else {
						state.styleImages[name] = true;
					}
					resolve(true);
				} else {
					throw new Error('Failed to upload image');
				}
			} catch (error) {
				console.error('Error uploading image:', error);
				resolve(false);
			}
		};
		reader.readAsDataURL(file);
	});
}

export async function deleteImage(name, type = 'character') {
	const endpoint = type === 'character' ? 
		'/character_editor/image/' : '/style_editor/image/';
	const response = await fetch(
		`${endpoint}${encodeName(name)}`,
		{
			method: 'DELETE'
		}
	);

	if (response.ok || response.status === 404) {
		if (type === 'character') {
			state.characterImages[name] = false;
		} else {
			state.styleImages[name] = false;
		}
		return true;
	}
	throw new Error('Failed to delete image');
}

export async function loadLoras() {
	try {
		const response = await fetch('/lora_list');
		if (!response.ok) {
			console.log('Failed to load LoRA list');
			return [];
		}
		const loras = await response.json();
		console.log(`Loaded ${loras.length} LoRAs`);
		return loras;
	} catch (error) {
		console.error('Error loading LoRAs:', error);
		return [];
	}
}

export async function loadEmbeddings() {
	try {
		const response = await fetch('/embedding_list');
		if (!response.ok) {
			console.log('Failed to load embedding list');
			return [];
		}
		const embeddings = await response.json();
		console.log(`Loaded ${embeddings.length} embeddings`);
		return embeddings;
	} catch (error) {
		console.error('Error loading embeddings:', error);
		return [];
	}
}
