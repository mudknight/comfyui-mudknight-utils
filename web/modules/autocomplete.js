import { autocompleteState } from './state.js';
import { getImageUrl } from './api.js';

// Shared thumbnail element for autocomplete
let sharedThumbnail = null;
let thumbnailTimeout = null;
let currentPreviewKey = null; // Track current preview to avoid redrawing
let autocompleteTimeout = null;

function getCanvasScale() {
	if (window.app?.canvas?.ds) {
		return window.app.canvas.ds.scale || 1;
	}
	return 1;
}

function getCaretCoordinates(element) {
	const caretPos = element.selectionStart;
	const rect = element.getBoundingClientRect();
	const scale = getCanvasScale();
	const div = document.createElement('div');
	const style = window.getComputedStyle(element);

	const layoutStyles = [
		'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
		'letterSpacing', 'textTransform', 'wordSpacing',
		'textIndent', 'whiteSpace', 'paddingLeft', 'paddingRight',
		'paddingTop', 'paddingBottom', 'lineHeight', 'width', 'boxSizing'
	];

	div.style.position = 'absolute';
	div.style.visibility = 'hidden';
	div.style.whiteSpace = 'pre-wrap';
	div.style.wordWrap = 'break-word';
	layoutStyles.forEach(prop => div.style[prop] = style[prop]);

	div.textContent = element.value.substring(0, caretPos);
	const span = document.createElement('span');
	span.textContent = element.value.substring(caretPos) || '.';
	div.appendChild(span);

	document.body.appendChild(div);
	const spanOffsetLeft = (span.offsetLeft - element.scrollLeft) * scale;
	const spanOffsetTop = (span.offsetTop - element.scrollTop) * scale;

	const lineHeight = parseFloat(style.lineHeight) ||
		parseFloat(style.fontSize) * 1.2;
	const scaledLineHeight = lineHeight * scale;

	document.body.removeChild(div);

	return {
		left: rect.left + spanOffsetLeft,
		top: rect.top + spanOffsetTop,
		fontSize: parseFloat(style.fontSize) * scale + 'px',
		lineHeight: scaledLineHeight
	};
}

function getOrCreateThumbnail() {
	if (!sharedThumbnail) {
		sharedThumbnail = document.createElement('div');
		sharedThumbnail.className = 'autocomplete-thumbnail';
		sharedThumbnail.style.position = 'fixed';
		sharedThumbnail.style.zIndex = '10001';
		document.body.appendChild(sharedThumbnail);
	}
	return sharedThumbnail;
}

function getPreviewUrl(nameOrPath, type) {
	if (type === 'character') {
		return getImageUrl(nameOrPath, 'character');
	} else if (type === 'lora') {
		return `/lora_preview/${encodeURIComponent(nameOrPath)}`;
	} else if (type === 'embedding') {
		return `/embedding_preview/${encodeURIComponent(nameOrPath)}`;
	}
	return null;
}

function repositionThumbnail(dropdown) {
	if (!sharedThumbnail || sharedThumbnail.style.display !== 'block') {
		return;
	}

	const dropRect = dropdown.getBoundingClientRect();
	const thumbnailWidth = 128 + 10;

	let left = dropRect.right + 10;
	if (left + thumbnailWidth > window.innerWidth) {
		left = dropRect.left - thumbnailWidth;
	}

	sharedThumbnail.style.left = left + 'px';
	sharedThumbnail.style.top = dropRect.top + 'px';
}

function showThumbnailForElement(
	dropdown, nameOrPath, previewType, immediate = false
) {
	const previewKey = `${previewType}:${nameOrPath}`;

	if (currentPreviewKey === previewKey &&
		sharedThumbnail?.style.display === 'block') {
		repositionThumbnail(dropdown);
		return;
	}

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
	
	currentPreviewKey = previewKey;
	
	const renderAndPosition = () => {
		const currentImg = thumbnail.querySelector('img');
		if (!currentImg || currentImg.src !== previewUrl) {
			thumbnail.innerHTML = `<img src="${previewUrl}" ` +
				`style="width:128px;height:auto;display:block;" />`;
		}
		thumbnail.style.display = 'block';
		repositionThumbnail(dropdown);
	};

	if (immediate) {
		renderAndPosition();
	} else {
		thumbnailTimeout = setTimeout(renderAndPosition, 300);
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
	
	// Check for LoRA syntax: <lora:
	const loraMatch = text.match(/<lora:([^:>]*)$/);
	if (loraMatch) {
		return {
			type: 'lora',
			searchTerm: loraMatch[1] || '',
			start: cursorPos - loraMatch[1].length
		};
	}
	
	// Check for embedding syntax: embedding:
	const embedMatch = text.match(/\bembedding:([^\s,]*)$/i);
	if (embedMatch) {
		return {
			type: 'embedding',
			searchTerm: embedMatch[1] || '',
			start: cursorPos - embedMatch[1].length
		};
	}
	
	// Check for character syntax: character:name[:outfit[:part]]
	const charMatch = text.match(
		/\bcharacter:([^:,\n]*):?([^:,\n]*):?([^,\n]*)$/i
	);
	if (charMatch) {
		const namePart = charMatch[1] || '';
		const outfitPart = charMatch[2] || '';
		const partPart = charMatch[3] || '';
		
		// Count colons to determine what we're completing
		const charPrefix = text.substring(
			text.lastIndexOf('character:'),
			cursorPos
		);
		const colonCount = (charPrefix.match(/:/g) || []).length;
		
		if (colonCount === 3) {
			// Completing part (top/bottom)
			return {
				type: 'character-part',
				searchTerm: partPart,
				start: cursorPos - partPart.length
			};
		} else if (colonCount === 2) {
			// Completing outfit name
			return {
				type: 'character-outfit',
				searchTerm: outfitPart,
				start: cursorPos - outfitPart.length,
				characterName: namePart
			};
		} else {
			// Completing character name
			return {
				type: 'character',
				searchTerm: namePart,
				start: cursorPos - namePart.length
			};
		}
	}
	
	// Check for tag preset syntax: tag:
	const tagMatch = text.match(/\btag:([^\s,]*)$/i);
	if (tagMatch) {
		return {
			type: 'tagpreset',
			searchTerm: tagMatch[1] || '',
			start: cursorPos - tagMatch[1].length
		};
	}
	
	// Default to tag search - track full tag boundaries
	const lastComma = text.lastIndexOf(',', cursorPos - 1);
	const lastNewline = text.lastIndexOf('\n', cursorPos - 1);

	let start = Math.max(lastComma, lastNewline) + 1;

	while (start < cursorPos && /[ \t]/.test(text[start])) {
		start++;
	}
	
	const afterCursor = input.value.substring(cursorPos);
	const nextComma = afterCursor.indexOf(',');
	const nextNewline = afterCursor.indexOf('\n');
	
	let end;
	if (nextComma === -1 && nextNewline === -1) {
		end = input.value.length;
	} else if (nextComma === -1) {
		end = cursorPos + nextNewline;
	} else if (nextNewline === -1) {
		end = cursorPos + nextComma;
	} else {
		end = cursorPos + Math.min(nextComma, nextNewline);
	}
	
	const fullTag = input.value.substring(start, end).trim();
	
	return {
		type: 'tag',
		searchTerm: fullTag,
		start: start,
		end: end
	};
}

function isAutocompleteEnabled() {
	const isPresetManager = window.location.pathname.includes(
		'character_editor.html'
	);
	const key = isPresetManager
		? "Mudknight Utils.Autocomplete.PresetManagerEnabled"
		: "Mudknight Utils.Autocomplete.Enabled";
	const value = localStorage.getItem(key);
	return value !== 'false';
}

function showAutocomplete(input, context) {
	if (!isAutocompleteEnabled()) {
		hideAutocomplete();
		return;
	}

	const { type, searchTerm, start } = context;

	// For prefix-triggered types, show immediately after typing prefix
	if (type === 'lora' || type === 'embedding' ||
		type === 'character' || type === 'character-outfit' ||
		type === 'character-part' || type === 'tagpreset') {
		// Allow showing with empty search term
		if (searchTerm === undefined) {
			hideAutocomplete();
			return;
		}
	} else {
		// For tags, require at least 2 characters
		if (!searchTerm || searchTerm.length < 2) {
			hideAutocomplete();
			return;
		}
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
	} else if (type === 'character') {
		const searchLower = searchTerm.toLowerCase();
		filtered = autocompleteState.characterPresets
			.filter(item => 
				searchLower === '' || 
				item.tag.toLowerCase().includes(searchLower)
			)
			.slice(0, 10)
			.map(item => ({
				display: item.characterName || item.tag,
				value: item.characterName || item.tag,
				type: 'character',
				hasPreview: item.hasImage || false,
				characterName: item.characterName,
				presetType: 'character'
			}));
	} else if (type === 'character-outfit') {
		// For now, just show "default" as the only outfit
		const searchLower = searchTerm.toLowerCase();
		filtered = ['default']
			.filter(outfit => 
				searchLower === '' || 
				outfit.includes(searchLower)
			)
			.map(outfit => ({
				display: outfit,
				value: outfit,
				type: 'character-outfit'
			}));
	} else if (type === 'character-part') {
		const parts = ['top', 'bottom'];
		const searchLower = searchTerm.toLowerCase();
		filtered = parts
			.filter(part => 
				searchLower === '' || 
				part.includes(searchLower)
			)
			.map(part => ({
				display: part,
				value: part,
				type: 'character-part'
			}));
	} else if (type === 'tagpreset') {
		const searchLower = searchTerm.toLowerCase();
		filtered = autocompleteState.tagPresets
			.filter(item => 
				searchLower === '' || 
				item.tag.toLowerCase().includes(searchLower)
			)
			.slice(0, 10)
			.map(item => ({
				display: item.tag.replace(/_/g, ' '),
				value: item.tag.replace(/_/g, ' '),
				type: 'tagpreset',
				presetType: 'tag'
			}));
	} else {
		// Tag search with category, alias, and preset support
		// Replace spaces with underscores for matching
		const searchLower = searchTerm.toLowerCase().replace(/ /g, '_');
		
		// Filter matching tags (no preset merging)
		let matching = autocompleteState.tags
			.filter(item => {
				// Check blacklist
				const tagKey = item.tag.toLowerCase().trim();
				const aliasKey = item.aliasFor ? 
					item.aliasFor.toLowerCase().trim() : null;

				// Block if tag itself is blacklisted
				if (autocompleteState.blacklist.has(tagKey)) {
					return false;
				}

				// Block if this is an alias of a blacklisted tag
				if (aliasKey && autocompleteState.blacklist.has(aliasKey)) {
					return false;
				}

				// Then check search match
				return item.tag.toLowerCase().includes(searchLower);
			})
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
				isCustom: item.isCustom || false,
				presetType: item.presetType,
				characterName: item.characterName,
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
			filtered = matching.slice(0, 50);  // Only sort/process top 50, show 10
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
	const coords = getCaretCoordinates(input);

	dropdown.innerHTML = '';
	dropdown.style.display = 'block';
	dropdown.style.position = 'fixed';
	dropdown.style.fontSize = coords.fontSize;

	filtered.forEach((item, index) => {
		const div = document.createElement('div');
		div.className = 'autocomplete-item' +
			(index === 0 ? ' selected' : '');

		if (item.type === 'tag' && item.category !== undefined) {
			div.classList.add(`tag-category-${item.category}`);
		}

		if (item.type === 'tag') {
			const categoryLabel = getCategoryLabel(item.category);
			const presetLabel = item.isPreset ? 
				' <span class="preset-label">PRESET</span>' : '';
			const customLabel = item.isCustom ?
				' <span class="preset-label">CUSTOM</span>' : '';
			
			if (item.isAlias) {
				div.innerHTML = `
					<span class="autocomplete-tag">
						<span class="alias-name">${item.display}</span>
						<span class="alias-arrow"> → </span>
						<span class="alias-target">${item.value}</span>
						${categoryLabel ? 
							`<span class="category-label" style="color: grey;">
								${categoryLabel}
							</span>` : ''}${presetLabel}${customLabel}
					</span>
					<span class="autocomplete-count">${item.count}</span>
				`;
			} else {
				div.innerHTML = `
					<span class="autocomplete-tag">
						${item.display}
						${categoryLabel ? 
							`<span class="category-label" style="color: grey;">
								${categoryLabel}
							</span>` : ''}${presetLabel}${customLabel}
					</span>
					<span class="autocomplete-count">${item.count}</span>
				`;
			}

			if (item.isPreset && item.presetType === 'character' && 
				item.hasImage && item.characterName) {
				div.dataset.characterName = item.characterName;
				div.dataset.previewType = 'character';
			}
		} else {
			div.innerHTML = `<span class="autocomplete-tag">` +
				`${item.display}</span>`;
			if (item.hasPreview || item.type === 'character') {
				div.dataset.previewType = item.type;
				if (item.type === 'character' && item.characterName) {
					div.dataset.characterName = item.characterName;
				} else {
					div.dataset.previewPath = item.previewPath;
					div.dataset.previewName = item.previewName;
				}
			}
		}

		div.onclick = () => selectAutocomplete(index);
		dropdown.appendChild(div);
	});

	let top = coords.top + coords.lineHeight + 5;
	if (top + dropdown.offsetHeight > window.innerHeight) {
		top = coords.top - dropdown.offsetHeight - 5;
	}

	dropdown.style.left = coords.left + 'px';
	dropdown.style.top = top + 'px';
	
	updateThumbnailForSelectedItem();
}

function updateThumbnailForSelectedItem() {
	const dropdown = document.getElementById('autocompleteDropdown');
	if (!dropdown || dropdown.style.display !== 'block') {
		return;
	}
	
	const selectedElement = 
		dropdown.querySelector('.autocomplete-item.selected');
	if (selectedElement && selectedElement.dataset.previewType) {
		const type = selectedElement.dataset.previewType;
		const id = selectedElement.dataset.previewPath ||
					 selectedElement.dataset.characterName ||
					 selectedElement.dataset.previewName;
		showThumbnailForElement(dropdown, id, type, true);
	} else {
		hideThumbnail();
	}
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
	if (dropdown) {
		dropdown.style.display = 'none';
	}
	
	hideThumbnail();
	
	autocompleteState.activeElement = null;
	autocompleteState.selectedIndex = -1;
	autocompleteState.filteredTags = [];
	autocompleteState.contextType = 'tag';
}

function selectAutocomplete(index) {
	if (!autocompleteState.activeElement || 
		index < 0 || 
		index >= autocompleteState.filteredTags.length) { return; }
	
	const input = autocompleteState.activeElement;
	const item = autocompleteState.filteredTags[index];
	const context = detectContext(input);
	const text = input.value;
	
	let newText, newCursorPos;
	
	// Determine suffix based on context and item type
	let suffix;
	
	// Check if this is a keyword (character, tag, embedding)
	const isKeyword = ['character', 'tag', 'embedding'].includes(
		item.value.toLowerCase()
	);
	
	if (isKeyword && autocompleteState.contextType === 'tag') {
		// Keywords get colon when selected from normal tag context
		suffix = ':';
	} else if (autocompleteState.contextType === 'character' ||
		autocompleteState.contextType === 'character-outfit') {
		// Jump to next colon for character contexts
		suffix = ':';
	} else if (autocompleteState.contextType === 'tagpreset') {
		// Tag presets end with comma, not colon
		suffix = autocompleteState.insertComma !== false ? ', ' : '';
	} else if (autocompleteState.contextType === 'character-part') {
		// End with comma for outfit parts
		suffix = autocompleteState.insertComma !== false ? ', ' : '';
	} else {
		// Default comma suffix for everything else
		suffix = autocompleteState.insertComma !== false ? ', ' : '';
	}
	
	if (autocompleteState.contextType === 'lora') {
		const beforeLora = 
			text.lastIndexOf('<lora:', input.selectionStart) + 6;
		const rest = text.substring(input.selectionStart);
		const after = rest.includes('>')
			? rest.substring(rest.indexOf('>') + 1)
			: rest;
		newText = `${text.substring(0, beforeLora)}${item.value}:1.0>${after}`;
		newCursorPos = beforeLora + item.value.length + 5;
		
	} else if (autocompleteState.contextType === 'embedding') {
		const beforeEmbed = 
			text.lastIndexOf('embedding:', input.selectionStart) + 10;
		const rest = text.substring(input.selectionStart);
		const after = rest.includes(',')
			? rest.substring(rest.indexOf(','))
			: rest;
		newText = 
			`${text.substring(0, beforeEmbed)}${item.value}${suffix}${after}`;
		newCursorPos = beforeEmbed + item.value.length + suffix.length;
		
	} else if (autocompleteState.contextType === 'character') {
		const beforeChar = 
			text.lastIndexOf('character:', input.selectionStart) + 10;
		const rest = text.substring(input.selectionStart);
		
		// Find the actual end boundary (comma, newline, or end of string)
		let endPos = input.selectionStart;
		while (endPos < text.length && 
			text[endPos] !== ',' && 
			text[endPos] !== '\n') {
			endPos++;
		}
		
		const after = text.substring(endPos);
		newText = 
			`${text.substring(0, beforeChar)}${item.value}${suffix}${after}`;
		newCursorPos = beforeChar + item.value.length + suffix.length;
		
	} else if (autocompleteState.contextType === 'character-outfit') {
		// Find position after first colon
		const charStart = 
			text.lastIndexOf('character:', input.selectionStart);
		const firstColon = text.indexOf(':', charStart + 10);
		const beforeOutfit = firstColon + 1;
		
		// Find the actual end boundary
		let endPos = input.selectionStart;
		while (endPos < text.length && 
			text[endPos] !== ',' && 
			text[endPos] !== '\n') {
			endPos++;
		}
		
		const after = text.substring(endPos);
		newText = 
			`${text.substring(0, beforeOutfit)}${item.value}${suffix}${after}`;
		newCursorPos = beforeOutfit + item.value.length + suffix.length;
		
	} else if (autocompleteState.contextType === 'character-part') {
		// Find position after second colon
		const charStart = 
			text.lastIndexOf('character:', input.selectionStart);
		const firstColon = text.indexOf(':', charStart + 10);
		const secondColon = text.indexOf(':', firstColon + 1);
		const beforePart = secondColon + 1;
		
		// Find the actual end boundary
		let endPos = input.selectionStart;
		while (endPos < text.length && 
			text[endPos] !== ',' && 
			text[endPos] !== '\n') {
			endPos++;
		}
		
		const after = text.substring(endPos);
		newText = 
			`${text.substring(0, beforePart)}${item.value}${suffix}${after}`;
		newCursorPos = beforePart + item.value.length + suffix.length;
		
	} else if (autocompleteState.contextType === 'tagpreset') {
		const beforeTag = 
			text.lastIndexOf('tag:', input.selectionStart) + 4;
		
		// Find the actual end boundary
		let endPos = input.selectionStart;
		while (endPos < text.length && 
			text[endPos] !== ',' && 
			text[endPos] !== '\n') {
			endPos++;
		}
		
		const after = text.substring(endPos);
		newText = 
			`${text.substring(0, beforeTag)}${item.value}${suffix}${after}`;
		newCursorPos = beforeTag + item.value.length + suffix.length;
		
	} else {
		// Replace the entire tag from start to end
		let tag = item.value.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
		newText = text.substring(0, context.start) + tag + suffix + 
			text.substring(context.end);
		newCursorPos = context.start + tag.length + suffix.length;
	}
	
	input.value = newText;
	input.setSelectionRange(newCursorPos, newCursorPos);
	
	hideAutocomplete();
	input.focus();
	
	// If we just inserted a colon, immediately show autocomplete for next part
	if (suffix === ':') {
		// Small delay to let the input update
		setTimeout(() => {
			const context = detectContext(input);
			showAutocomplete(input, context);
		}, 10);
	}
}

function handleAutocompleteKeydown(e, input) {
	const dropdown = document.getElementById('autocompleteDropdown');

	if (!isAutocompleteEnabled() || dropdown.style.display !== 'block') {
		return;
	}
	
	if (e.key === 'ArrowDown') {
		e.preventDefault();
		autocompleteState.selectedIndex = 
			(autocompleteState.selectedIndex + 1) % 
			autocompleteState.filteredTags.length;
		updateAutocompleteSelection();
	} else if (e.key === 'ArrowUp') {
		e.preventDefault();
		autocompleteState.selectedIndex = 
			(autocompleteState.selectedIndex - 1 + 
			autocompleteState.filteredTags.length) % 
			autocompleteState.filteredTags.length;
		updateAutocompleteSelection();
	} else if (e.key === 'Enter' || e.key === 'Tab') {
		e.preventDefault();
		selectAutocomplete(autocompleteState.selectedIndex);
	} else if (e.key === 'Escape') {
		hideAutocomplete();
	}
}

function updateAutocompleteSelection() {
	const items = document.querySelectorAll('.autocomplete-item');
	items.forEach((item, index) => {
		item.classList.toggle('selected', 
			index === autocompleteState.selectedIndex);
		if (index === autocompleteState.selectedIndex) {
			item.scrollIntoView({ block: 'nearest' });
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
			const enabled = input._checkEnabled ? 
				input._checkEnabled() : true;
			if (!enabled) return;

			// Debounce: wait 100ms after typing stops
			if (autocompleteTimeout) {
				clearTimeout(autocompleteTimeout);
			}

			autocompleteTimeout = setTimeout(() => {
				autocompleteState.insertComma = input._insertComma;
				showAutocomplete(input, detectContext(input));
			}, 100);
		});

		// Hide on cursor movement (mouse clicks)
		input.addEventListener('click', () => {
			hideAutocomplete();
		});

		input.addEventListener('keydown', (e) => {
			const enabled = input._checkEnabled ? 
				input._checkEnabled() : true;
			const dropdown = 
				document.getElementById('autocompleteDropdown');

			if (!enabled) return;

			// If dropdown is visible, handle navigation
			if (dropdown.style.display === 'block') {
				autocompleteState.insertComma = input._insertComma;
				handleAutocompleteKeydown(e, input);
			}
			
			// Hide on left/right arrow movement
			if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
				hideAutocomplete();
			}
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
		const active = autocompleteState.activeElement;
		if (dropdown && 
		    dropdown.style.display === 'block' && 
		    !dropdown.contains(e.target) && 
		    e.target !== active) {
			hideAutocomplete();
		}
	});
}
