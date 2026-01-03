import { autocompleteState } from './state.js';
import { getImageUrl } from './api.js';

// Shared thumbnail element for autocomplete
let sharedThumbnail = null;
let thumbnailTimeout = null;
let currentPreviewKey = null; // Track current preview to avoid redrawing

function getOrCreateThumbnail() {
	if (!sharedThumbnail) {
		sharedThumbnail = document.createElement('div');
		sharedThumbnail.className = 'autocomplete-thumbnail';
		document.body.appendChild(sharedThumbnail);
	}
	return sharedThumbnail;
}

function getPreviewUrl(nameOrPath, type) {
	if (type === 'character') {
		return getImageUrl(nameOrPath, 'character');
	} else if (type === 'lora') {
		// URL encode the name for the API
		return `/lora_preview/${encodeURIComponent(nameOrPath)}?t=${Date.now()}`;
	} else if (type === 'embedding') {
		// URL encode the path for the API
		return `/embedding_preview/${encodeURIComponent(nameOrPath)}?t=${Date.now()}`;
	}
	return null;
}

function showThumbnailForElement(element, nameOrPath, previewType, immediate = false) {
	// Create a unique key for this preview
	const previewKey = `${previewType}:${nameOrPath}`;
	
	// If we're already showing this exact preview, don't redraw
	if (currentPreviewKey === previewKey && sharedThumbnail && sharedThumbnail.style.display === 'block') {
		// Just update position in case the element moved
		if (immediate) {
			const rect = element.getBoundingClientRect();
			const thumbnailWidth = 128 + 8;
			const thumbnailHeight = 128 + 8;
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			
			let left = rect.right + 10;
			let top = rect.top;
			
			if (left + thumbnailWidth > viewportWidth) {
				left = rect.left - thumbnailWidth - 10;
			}
			
			if (top + thumbnailHeight > viewportHeight) {
				top = viewportHeight - thumbnailHeight - 10;
			}
			
			if (top < 10) {
				top = 10;
			}
			
			sharedThumbnail.style.left = left + 'px';
			sharedThumbnail.style.top = top + 'px';
		}
		return;
	}
	
	// Clear any existing timeout
	if (thumbnailTimeout) {
		clearTimeout(thumbnailTimeout);
		thumbnailTimeout = null;
	}
	
	const thumbnail = getOrCreateThumbnail();
	const previewUrl = getPreviewUrl(nameOrPath, previewType);
	
	if (!previewUrl) {
		currentPreviewKey = null;
		return;
	}
	
	// Update the current preview key
	currentPreviewKey = previewKey;
	
	// Update image if needed
	const img = thumbnail.querySelector('img');
	if (!img || img.src !== previewUrl) {
		thumbnail.innerHTML = `<img src="${previewUrl}" alt="${nameOrPath}" />`;
	}
	
	const showThumbnail = () => {
		const rect = element.getBoundingClientRect();
		const thumbnailWidth = 128 + 8; // image width + padding
		const thumbnailHeight = 128 + 8;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		
		// Position thumbnail to the right of the dropdown item
		let left = rect.right + 10;
		let top = rect.top;
		
		// Adjust if thumbnail would go off-screen to the right
		if (left + thumbnailWidth > viewportWidth) {
			// Position to the left instead
			left = rect.left - thumbnailWidth - 10;
		}
		
		// Adjust if thumbnail would go off-screen at the bottom
		if (top + thumbnailHeight > viewportHeight) {
			top = viewportHeight - thumbnailHeight - 10;
		}
		
		// Ensure thumbnail doesn't go off-screen at the top
		if (top < 10) {
			top = 10;
		}
		
		thumbnail.style.display = 'block';
		thumbnail.style.left = left + 'px';
		thumbnail.style.top = top + 'px';
	};
	
	if (immediate) {
		showThumbnail();
	} else {
		// Show thumbnail after a short delay
		thumbnailTimeout = setTimeout(showThumbnail, 300);
	}
}

function hideThumbnail() {
	if (thumbnailTimeout) {
		clearTimeout(thumbnailTimeout);
		thumbnailTimeout = null;
	}
	if (sharedThumbnail) {
		sharedThumbnail.style.display = 'none';
	}
	currentPreviewKey = null;
}

function detectContext(input) {
	const cursorPos = input.selectionStart;
	const text = input.value.substring(0, cursorPos);
	
	// Check for LoRA syntax: <lora: (with optional content after)
	const loraMatch = text.match(/<lora:([^:>]*)$/);
	if (loraMatch) {
		return {
			type: 'lora',
			searchTerm: loraMatch[1] || '',
			start: cursorPos - loraMatch[1].length
		};
	}
	
	// Check for embedding syntax: embedding: (with optional content)
	const embedMatch = text.match(/\bembedding:([^\s,]*)$/i);
	if (embedMatch) {
		return {
			type: 'embedding',
			searchTerm: embedMatch[1] || '',
			start: cursorPos - embedMatch[1].length
		};
	}
	
	// Default to tag search (existing logic)
	const lastComma = text.lastIndexOf(',', cursorPos - 1);
	const lastNewline = text.lastIndexOf('\n', cursorPos - 1);

	// Start from whichever is closer to the cursor to preserve newlines
	let start = Math.max(lastComma, lastNewline) + 1;

	while (start < cursorPos && /[ \t]/.test(text[start])) {
		start++;
	}
	
	let end = text.indexOf(',', cursorPos);
	if (end === -1) end = text.length;
	
	const searchTerm = text.substring(start, end).trim();
	
	return {
		type: 'tag',
		searchTerm: searchTerm,
		start: start,
		end: end
	};
}

function showAutocomplete(input, context) {
	const { type, searchTerm, start } = context;

	// For LoRA and embedding, show immediately after typing prefix
	// For tags, require at least 2 characters
	if (type === 'tag' && (!searchTerm || searchTerm.length < 2)) {
		hideAutocomplete();
		return;
	}

	// For LoRA/embedding, allow showing with 0 characters
	if ((type === 'lora' || type === 'embedding') && 
		searchTerm === undefined) {
		hideAutocomplete();
		return;
	}

	autocompleteState.contextType = type;
	let filtered = [];

	// Filter based on context type
	if (type === 'lora') {
		const searchLower = searchTerm.toLowerCase();
		filtered = autocompleteState.loras
			.filter(item => 
				searchLower === '' || 
				item.name.toLowerCase().includes(searchLower)
			)
			.slice(0, 10)
			.map(item => ({
				display: item.name,
				value: item.name,
				type: 'lora',
				hasPreview: item.hasPreview || false,
				previewName: item.name,
				previewPath: item.path  // Store full path as fallback
			}));
	} else if (type === 'embedding') {
		const searchLower = searchTerm.toLowerCase();
		filtered = autocompleteState.embeddings
			.filter(item => 
				searchLower === '' || 
				item.name.toLowerCase().includes(searchLower)
			)
			.slice(0, 10)
			.map(item => ({
				display: item.name,
				value: item.name,
				type: 'embedding',
				hasPreview: item.hasPreview || false,
				previewPath: item.path
			}));
	} else {
		// Tag search with category, alias, and preset support
		// Replace spaces with underscores for matching
		const searchLower = searchTerm.toLowerCase().replace(/ /g, '_');
		
		// Create a map to merge presets with regular tags
		// Presets replace regular tags when they have the same name
		const tagMap = new Map();
		
		// First, add all regular tags
		autocompleteState.tags.forEach(tag => {
			const key = tag.tag.toLowerCase().trim();
			tagMap.set(key, tag);
		});
		
		// Then, override with character presets
		autocompleteState.characterPresets.forEach(preset => {
			const key = preset.tag.toLowerCase().trim();
			tagMap.set(key, preset);
		});
		
		// Finally, override with tag presets
		autocompleteState.tagPresets.forEach(preset => {
			const key = preset.tag.toLowerCase().trim();
			tagMap.set(key, preset);
		});
		
		// Convert map back to array and filter matching tags
		let matching = Array.from(tagMap.values())
			.filter(item => 
				item.tag.toLowerCase().includes(searchLower)
			)
			.map(item => ({
				display: item.tag.replace(/_/g, ' '),
				value: item.isAlias ? 
					item.aliasFor.replace(/_/g, ' ') : 
					item.tag.replace(/_/g, ' '),
				count: item.count,
				category: item.category,
				isAlias: item.isAlias,
				aliasFor: item.aliasFor ? 
					item.aliasFor.replace(/_/g, ' ') : undefined,
				isPreset: item.isPreset || false,
				presetType: item.presetType,
				characterName: item.characterName,  // For image lookup
				hasImage: item.hasImage || false,
				type: 'tag'
			}));
		
		// Filter aliases if setting enabled
		if (autocompleteState.hideAliasesWithMain) {
			const mainTagsPresent = new Map();
			matching.forEach(item => {
				if (!item.isAlias) {
					const normalizedValue = 
						item.value.toLowerCase().replace(/ /g, '_');
					mainTagsPresent.set(normalizedValue, true);
				}
			});
			
			matching = matching.filter(item => {
				if (!item.isAlias || !item.aliasFor) {
					return true;
				}
				
				const mainTag = 
					item.aliasFor.toLowerCase().replace(/ /g, '_');
				const aliasTag = 
					item.display.toLowerCase().replace(/ /g, '_');
				
				if (mainTagsPresent.has(mainTag)) {
					const searchMatchesAlias = 
						aliasTag.startsWith(searchLower);
					const searchMatchesMain = 
						mainTag.startsWith(searchLower);
					
					return searchMatchesAlias && !searchMatchesMain;
				}
				
				return true;
			});
		}
		
		if (autocompleteState.presetsFirst) {
			matching.sort((a, b) => {
				// Presets always come first
				if (a.isPreset && !b.isPreset) return -1;
				if (!a.isPreset && b.isPreset) return 1;
				// Within same group, sort by count
				return b.count - a.count;
			});
		} else {
			// Just sort by count
			matching.sort((a, b) => b.count - a.count);
		}
		
		filtered = matching.slice(0, 10);
	}

	if (filtered.length === 0) {
		hideAutocomplete();
		return;
	}

	autocompleteState.filteredTags = filtered;
	autocompleteState.selectedIndex = 0;
	autocompleteState.activeElement = input;
	autocompleteState.currentWord = searchTerm;
	autocompleteState.wordStart = start;

	const dropdown = document.getElementById('autocompleteDropdown');
	dropdown.innerHTML = '';

	filtered.forEach((item, index) => {
		const div = document.createElement('div');
		div.className = 'autocomplete-item';
		if (index === 0) {
			div.classList.add('selected');
		}

		// Add category class for tags
		if (item.type === 'tag' && item.category !== undefined) {
			div.classList.add(`tag-category-${item.category}`);
		}

		// Different display based on type
		if (item.type === 'tag') {
			if (item.isAlias) {
				// Alias format: alias -> tag (category) [PRESET] count
				const categoryLabel = getCategoryLabel(item.category);
				const presetLabel = item.isPreset ? 
					' <span class="preset-label">PRESET</span>' : '';
				div.innerHTML = `
					<span class="autocomplete-tag">
						<span class="alias-name">${item.display}</span>
						<span class="alias-arrow"> → </span>
						<span class="alias-target">${item.value}</span>
						${categoryLabel ? 
							`<span class="category-label">
								${categoryLabel}
							</span>` : ''}${presetLabel}
					</span>
					<span class="autocomplete-count">${item.count}</span>
				`;
			} else {
				// Regular tag format: tag (category) [PRESET] count
				const categoryLabel = getCategoryLabel(item.category);
				const presetLabel = item.isPreset ? 
					' <span class="preset-label">PRESET</span>' : '';
				div.innerHTML = `
					<span class="autocomplete-tag">
						${item.display}
						${categoryLabel ? 
							`<span class="category-label">
								${categoryLabel}
							</span>` : ''}${presetLabel}
					</span>
					<span class="autocomplete-count">${item.count}</span>
				`;
			}
		} else {
			// LoRA/embedding format
			div.innerHTML = `
				<span class="autocomplete-tag">${item.display}</span>
			`;
		}

		div.onclick = () => selectAutocomplete(index);
		
		// Store preview info in data attributes for selection-based display
		if (item.type === 'tag' && item.isPreset && 
		    item.presetType === 'character' && item.hasImage && 
		    item.characterName) {
			div.dataset.characterName = item.characterName;
			div.dataset.previewType = 'character';
			setupThumbnailHover(div, item.characterName, 'character');
		} else if (item.type === 'lora' && item.hasPreview) {
			// Try previewPath first (full path), then fall back to previewName
			const previewIdentifier = item.previewPath || item.previewName;
			if (previewIdentifier) {
				div.dataset.previewName = item.previewName;
				div.dataset.previewPath = item.previewPath;
				div.dataset.previewType = 'lora';
				setupThumbnailHover(div, previewIdentifier, 'lora');
			}
		} else if (item.type === 'embedding' && item.hasPreview && item.previewPath) {
			div.dataset.previewPath = item.previewPath;
			div.dataset.previewType = 'embedding';
			setupThumbnailHover(div, item.previewPath, 'embedding');
		}
		
		dropdown.appendChild(div);
	});

	const rect = input.getBoundingClientRect();
	dropdown.style.left = rect.left + 'px';
	dropdown.style.top = (rect.bottom + 5) + 'px';
	dropdown.style.width = rect.width + 'px';
	dropdown.style.display = 'block';
	
	// Set  cursor is over dropdown but not over a specific item
	dropdown.addEventListener('mouseenter', () => {
		updateThumbnailForSelectedItem();
	});
	
	dropdown.addEventListener('mouseleave', () => {
		// When leaving dropdown entirely, hide thumbnail
		hideThumbnail();
	});
	
	// Show thumbnail for initially selected item if it has a character image
	updateThumbnailForSelectedItem();
}

function updateThumbnailForSelectedItem() {
	const dropdown = document.getElementById('autocompleteDropdown');
	if (!dropdown || dropdown.style.display !== 'block') {
		return;
	}
	
	const selectedIndex = autocompleteState.selectedIndex;
	if (selectedIndex >= 0 && selectedIndex < autocompleteState.filteredTags.length) {
		const selectedElement = dropdown.querySelector('.autocomplete-item.selected');
		if (selectedElement) {
			// Check what type of preview the selected item has
			const previewType = selectedElement.dataset.previewType;
			if (previewType === 'character' && selectedElement.dataset.characterName) {
				showThumbnailForElement(selectedElement, selectedElement.dataset.characterName, 'character', true);
			} else if (previewType === 'lora') {
				// Try previewPath first, then fall back to previewName
				const previewIdentifier = selectedElement.dataset.previewPath || selectedElement.dataset.previewName;
				if (previewIdentifier) {
					showThumbnailForElement(selectedElement, previewIdentifier, 'lora', true);
				} else {
					hideThumbnail();
				}
			} else if (previewType === 'embedding' && selectedElement.dataset.previewPath) {
				showThumbnailForElement(selectedElement, selectedElement.dataset.previewPath, 'embedding', true);
			} else {
				hideThumbnail();
			}
		} else {
			hideThumbnail();
		}
	} else {
		hideThumbnail();
	}
}

function setupThumbnailHover(element, nameOrPath, previewType) {
	element.addEventListener('mouseenter', () => {
		// Show thumbnail on hover with delay
		showThumbnailForElement(element, nameOrPath, previewType, false);
	});
	
	element.addEventListener('mouseleave', () => {
		// When leaving, check if there's a selected item to show instead
		const dropdown = document.getElementById('autocompleteDropdown');
		if (dropdown && dropdown.style.display === 'block') {
			const selectedIndex = autocompleteState.selectedIndex;
			if (selectedIndex >= 0 && selectedIndex < autocompleteState.filteredTags.length) {
				const selectedItem = autocompleteState.filteredTags[selectedIndex];
				const selectedElement = dropdown.querySelector('.autocomplete-item.selected');
				
				if (selectedElement) {
					// Check what type of preview the selected item has
					const selectedPreviewType = selectedElement.dataset.previewType;
					if (selectedPreviewType === 'character' && selectedElement.dataset.characterName) {
						showThumbnailForElement(selectedElement, selectedElement.dataset.characterName, 'character', true);
					} else if (selectedPreviewType === 'lora') {
						// Try previewPath first, then fall back to previewName
						const previewIdentifier = selectedElement.dataset.previewPath || selectedElement.dataset.previewName;
						if (previewIdentifier) {
							showThumbnailForElement(selectedElement, previewIdentifier, 'lora', true);
						} else {
							hideThumbnail();
						}
					} else if (selectedPreviewType === 'embedding' && selectedElement.dataset.previewPath) {
						showThumbnailForElement(selectedElement, selectedElement.dataset.previewPath, 'embedding', true);
					} else {
						hideThumbnail();
					}
				} else {
					hideThumbnail();
				}
			} else {
				hideThumbnail();
			}
		} else {
			hideThumbnail();
		}
	});
}

function getCategoryLabel(category) {
	const labels = {
		1: '(artist)',
		3: '(copyright)',
		4: '(character)',
		5: '(meta)'
	};
	return labels[category] || '';
}

export function hideAutocomplete() {
	const dropdown = document.getElementById('autocompleteDropdown');
	dropdown.style.display = 'none';
	
	// Hide thumbnail
	hideThumbnail();
	
	autocompleteState.activeElement = null;
	autocompleteState.selectedIndex = -1;
	autocompleteState.filteredTags = [];
	autocompleteState.contextType = 'tag';
}

function selectAutocomplete(index) {
	if (!autocompleteState.activeElement || 
	    index < 0 || 
	    index >= autocompleteState.filteredTags.length) {
		return;
	}
	
	const input = autocompleteState.activeElement;
	const item = autocompleteState.filteredTags[index];
	const text = input.value;
	const cursorPos = input.selectionStart;
	
	let newText, newCursorPos;
	
	if (autocompleteState.contextType === 'lora') {
		// Complete LoRA syntax: <lora:name:1.0>
		const beforeLora = text.lastIndexOf('<lora:', cursorPos) + 6;
		const afterCursor = text.substring(cursorPos);
		
		// Find the end of the lora tag
		let endPos = cursorPos;
		if (afterCursor.includes('>')) {
			endPos = cursorPos + afterCursor.indexOf('>') + 1;
		}
		
		const before = text.substring(0, beforeLora);
		const after = text.substring(endPos);
		
		// Don't add comma for LoRA tags
		newText = `${before}${item.value}:1.0>${after}`;
		newCursorPos = before.length + item.value.length + 5;
		
	} else if (autocompleteState.contextType === 'embedding') {
		// Complete embedding syntax: embedding:name
		const beforeEmbed = 
			text.lastIndexOf('embedding:', cursorPos) + 10;
		const before = text.substring(0, beforeEmbed);
		
		// Find next comma or end
		let endPos = cursorPos;
		const afterCursor = text.substring(cursorPos);
		const commaPos = afterCursor.indexOf(',');
		if (commaPos !== -1) {
			endPos = cursorPos + commaPos;
		} else {
			endPos = text.length;
		}
		
		const after = text.substring(endPos);
		
		// Check if comma insertion is enabled
		const insertComma = autocompleteState.insertComma !== false;
		const suffix = insertComma ? ', ' : '';
		
		newText = `${before}${item.value}${suffix}${after}`;
		newCursorPos = before.length + item.value.length + suffix.length;
		
	} else {
		// Tag completion (existing logic with insertComma support)
		let selectedTag = item.value;
		selectedTag = selectedTag.replace(/_/g, ' ');
		selectedTag = selectedTag.replace(
			/\(/g, '\\('
		).replace(/\)/g, '\\)');
		
		const context = detectContext(input);
		const before = text.substring(0, context.start);
		const after = text.substring(context.end || cursorPos);
		
		// Check if comma insertion is enabled
		const insertComma = autocompleteState.insertComma !== false;
		const suffix = insertComma ? ', ' : '';
		
		newText = before + selectedTag + suffix + after;
		newCursorPos = before.length + selectedTag.length + suffix.length;
	}
	
	input.value = newText;
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
		if (autocompleteState.selectedIndex <
		    autocompleteState.filteredTags.length - 1) {
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
	
	// Update thumbnail for the newly selected item
	updateThumbnailForSelectedItem();
}

export function setupAutocomplete(input, insertComma = true) {
	if (!input._autocompleteSetup) {
		input._autocompleteSetup = true;
		input._insertComma = insertComma;

		input.addEventListener('input', (e) => {
			// Default to true if the check function doesn't exist
			const enabled = input._checkEnabled ? 
				input._checkEnabled() : true;
			if (!enabled) return;

			autocompleteState.insertComma = input._insertComma;
			const context = detectContext(input);
			showAutocomplete(input, context);
		});

		input.addEventListener('keydown', (e) => {
			const enabled = input._checkEnabled ? 
				input._checkEnabled() : true;
			const dropdown = 
				document.getElementById('autocompleteDropdown');

			if (!enabled || dropdown.style.display !== 'block') return;

			autocompleteState.insertComma = input._insertComma;
			handleAutocompleteKeydown(e, input);
		});

		input.addEventListener('blur', (e) => {
			setTimeout(() => {
				if (autocompleteState.activeElement === input) {
					hideAutocomplete();
				}
			}, 200);
		});
	}
}

export function initAutocomplete() {
	document.addEventListener('click', (e) => {
		const dropdown = document.getElementById('autocompleteDropdown');
		if (dropdown && 
		    dropdown.style.display === 'block' && 
		    !dropdown.contains(e.target) && 
		    e.target !== autocompleteState.activeElement) {
			hideAutocomplete();
		}
	});
}
