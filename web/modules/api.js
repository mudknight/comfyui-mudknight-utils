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
		const response = await fetch(
			'/extensions/comfyui-mudknight-utils/danbooru.csv'
		);
		if (!response.ok) {
			console.log('Danbooru CSV not found');
			return [];
		}

		const text = await response.text();
		const lines = text.split('\n');

		const tags = [];

		for (const line of lines) {
			if (!line.trim()) continue;

			// Parse CSV line handling quotes
			const parts = parseCsvLine(line);
			if (parts.length < 3) continue;

			const tag = parts[0].trim();
			const category = parseInt(parts[1]) || 0;
			const count = parseInt(parts[2]) || 0;
			const aliasField = parts[3] || '';

			// Skip category 2 (unused)
			if (category === 2) continue;

			// Add main tag
			tags.push({
				tag: tag,
				category: category,
				count: count,
				isAlias: false
			});

			// Parse and add aliases
			if (aliasField) {
				const aliases = parseAliases(aliasField);
				for (const alias of aliases) {
					tags.push({
						tag: alias,
						category: category,
						count: count,
						isAlias: true,
						aliasFor: tag
					});
				}
			}
		}

		// Sort by count (descending)
		tags.sort((a, b) => b.count - a.count);

		console.log(`Loaded ${tags.length} tags from Danbooru CSV`);
		return tags;
	} catch (error) {
		console.error('Error loading Danbooru tags:', error);
		return [];
	}
}

function parseCsvLine(line) {
	const parts = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (char === '"') {
			inQuotes = !inQuotes;
		} else if (char === ',' && !inQuotes) {
			parts.push(current);
			current = '';
		} else {
			current += char;
		}
	}

	if (current) {
		parts.push(current);
	}

	return parts;
}

function parseAliases(aliasField) {
	if (!aliasField) return [];

	// Remove quotes and leading/trailing slashes
	let cleaned = aliasField.replace(/^["\/]+|["\/]+$/g, '');

	// Split by comma
	const aliases = cleaned.split(',')
		.map(a => a.trim())
		.filter(a => a.length > 0);

	return aliases;
}

export async function loadCharacterPresets(danbooruTags) {
	try {
		const response = await fetch('/character_editor');
		if (!response.ok) {
			console.log('Failed to load character presets');
			return [];
		}
		const characters = await response.json();
		
		// Create tag lookup map for faster searching
		const tagMap = new Map();
		danbooruTags.forEach(tag => {
			tagMap.set(tag.tag.toLowerCase(), tag);
		});
		
		// First, collect all character data
		const presetData = [];
		for (const [name, data] of Object.entries(characters)) {
			// Normalize: strip backslashes, trim, lowercase, 
			// replace spaces with underscores
			const nameLower = name.trim()
				.replace(/\\/g, '')  // Remove backslashes
				.toLowerCase()
				.replace(/ /g, '_');
			const danbooruTag = tagMap.get(nameLower);
			
			// Inherit properties from danbooru if exists,
			// otherwise default to character category
			const category = danbooruTag ? danbooruTag.category : 4;
			const count = danbooruTag ? danbooruTag.count : 0;
			
			presetData.push({
				name: name,
				nameLower: nameLower,
				category: category,
				count: count
			});
		}
		
		// Check all images in parallel
		const imageChecks = presetData.map(item => 
			checkCharacterImage(item.name).then(hasImage => ({
				...item,
				hasImage: hasImage
			}))
		);
		const presetsWithImages = await Promise.all(imageChecks);
		
		// Build final presets array
		const presets = presetsWithImages.map(item => ({
			tag: item.nameLower,
			category: item.category,
			count: item.count,
			isAlias: false,
			isPreset: true,
			presetType: 'character',
			characterName: item.name,  // Store original name for image lookup
			hasImage: item.hasImage
		}));
		
		console.log(`Loaded ${presets.length} character presets`);
		return presets;
	} catch (error) {
		console.error('Error loading character presets:', error);
		return [];
	}
}

async function checkCharacterImage(name) {
	try {
		const response = await fetch(`/character_editor/image/${encodeName(name)}`);
		return response.ok;
	} catch (error) {
		return false;
	}
}

export async function loadTagPresets(danbooruTags) {
	try {
		const response = await fetch('/tag_editor');
		if (!response.ok) {
			console.log('Failed to load tag presets');
			return [];
		}
		const tags = await response.json();
		
		// Create tag lookup map for faster searching
		const tagMap = new Map();
		danbooruTags.forEach(tag => {
			tagMap.set(tag.tag.toLowerCase(), tag);
		});
		
		const presets = [];
		for (const name of Object.keys(tags)) {
			// Normalize: strip backslashes, trim, lowercase,
			// replace spaces with underscores
			const nameLower = name.trim()
				.replace(/\\/g, '')  // Remove backslashes
				.toLowerCase()
				.replace(/ /g, '_');
			const danbooruTag = tagMap.get(nameLower);
			
			// Inherit properties from danbooru if exists,
			// otherwise default to general category
			const category = danbooruTag ? danbooruTag.category : 0;
			const count = danbooruTag ? danbooruTag.count : 0;
			
			presets.push({
				tag: nameLower,
				category: category,
				count: count,
				isAlias: false,
				isPreset: true,
				presetType: 'tag'
			});
		}
		
		console.log(`Loaded ${presets.length} tag presets`);
		return presets;
	} catch (error) {
		console.error('Error loading tag presets:', error);
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
