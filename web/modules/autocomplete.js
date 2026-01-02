import { autocompleteState } from './state.js';

function detectContext(input) {
	const cursorPos = input.selectionStart;
	const text = input.value.substring(0, cursorPos);
	
	// Check for LoRA syntax: <lora: (with optional content after)
	const loraMatch = text.match(/<lora:([^:>]*)$/);
	if (loraMatch) {
		console.log('Detected LoRA context:', loraMatch[1]);
		return {
			type: 'lora',
			searchTerm: loraMatch[1] || '',
			start: cursorPos - loraMatch[1].length
		};
	}
	
	// Check for embedding syntax: embedding: (with optional content)
	const embedMatch = text.match(/\bembedding:([^\s,]*)$/i);
	if (embedMatch) {
		console.log('Detected embedding context:', embedMatch[1]);
		return {
			type: 'embedding',
			searchTerm: embedMatch[1] || '',
			start: cursorPos - embedMatch[1].length
		};
	}
	
	// Default to tag search (existing logic)
	let start = text.lastIndexOf(',', cursorPos - 1) + 1;
	while (start < cursorPos && text[start] === ' ') {
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

	console.log(`Searching ${type}:`, searchTerm);

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
				type: 'lora'
			}));
		console.log('Filtered LoRAs:', filtered.length);
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
				type: 'embedding'
			}));
		console.log('Filtered embeddings:', filtered.length);
	} else {
		// Tag search with category and alias support
		// Replace spaces with underscores for matching
		const searchLower = searchTerm.toLowerCase().replace(/ /g, '_');
		filtered = autocompleteState.tags
			.filter(item => 
				item.tag.toLowerCase().includes(searchLower)
			)
			.slice(0, 10)
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
				type: 'tag'
			}));
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
				// Alias format: alias -> tag (category) count
				const categoryLabel = getCategoryLabel(item.category);
				div.innerHTML = `
		    <span class="autocomplete-tag">
			<span class="alias-name">${item.display}</span>
			<span class="alias-arrow"> → </span>
			<span class="alias-target">${item.value}</span>
			${categoryLabel ? 
					`<span class="category-label">${categoryLabel}
			    </span>` : ''}
		    </span>
		    <span class="autocomplete-count">${item.count}</span>
		`;
			} else {
				// Regular tag format: tag (category) count
				const categoryLabel = getCategoryLabel(item.category);
				div.innerHTML = `
		    <span class="autocomplete-tag">
			${item.display}
			${categoryLabel ? 
					`<span class="category-label">${categoryLabel}
			    </span>` : ''}
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
		dropdown.appendChild(div);
	});

	const rect = input.getBoundingClientRect();
	dropdown.style.left = rect.left + 'px';
	dropdown.style.top = (rect.bottom + 5) + 'px';
	dropdown.style.width = rect.width + 'px';
	dropdown.style.display = 'block';
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
}

export function setupAutocomplete(input, insertComma = true) {
	// Store the insertComma setting in the state
	if (!input._autocompleteSetup) {
		input._autocompleteSetup = true;
		input._insertComma = insertComma;
		
		input.addEventListener('input', (e) => {
			// Update state with current element's setting
			autocompleteState.insertComma = input._insertComma;
			const context = detectContext(input);
			showAutocomplete(input, context);
		});
		
		input.addEventListener('keydown', (e) => {
			// Update state with current element's setting
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
