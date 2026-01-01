import { autocompleteState } from './state.js';

function getCurrentWord(input) {
	const cursorPos = input.selectionStart;
	const text = input.value;
	
	let start = text.lastIndexOf(',', cursorPos - 1) + 1;
	
	while (start < cursorPos && text[start] === ' ') {
		start++;
	}
	
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
	const filtered = autocompleteState.tags
		.filter(item => item.tag.toLowerCase().includes(searchWord))
		.slice(0, 10);
	
	if (filtered.length === 0) {
		hideAutocomplete();
		return;
	}
	
	autocompleteState.filteredTags = filtered;
	autocompleteState.selectedIndex = 0;
	autocompleteState.activeElement = input;
	autocompleteState.currentWord = word;
	autocompleteState.wordStart = startPos;
	
	const dropdown = document.getElementById('autocompleteDropdown');
	dropdown.innerHTML = '';
	
	filtered.forEach((item, index) => {
		const div = document.createElement('div');
		div.className = 'autocomplete-item';
		if (index === 0) {
			div.classList.add('selected');
		}
		div.innerHTML = `
			<span class="autocomplete-tag">${item.tag}</span>
			<span class="autocomplete-count">${item.count}</span>
		`;
		
		div.onclick = () => selectAutocomplete(index);
		dropdown.appendChild(div);
	});
	
	const rect = input.getBoundingClientRect();
	dropdown.style.left = rect.left + 'px';
	dropdown.style.top = (rect.bottom + 5) + 'px';
	dropdown.style.width = rect.width + 'px';
	dropdown.style.display = 'block';
}

export function hideAutocomplete() {
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
	
	selectedTag = selectedTag.replace(/_/g, ' ');
	selectedTag = selectedTag.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
	
	const text = input.value;
	const info = getCurrentWord(input);
	
	const before = text.substring(0, info.start);
	const after = text.substring(info.end);
	
	const newText = before + selectedTag + ', ' + after.trimStart();
	
	input.value = newText;
	
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

export function setupAutocomplete(input) {
	input.addEventListener('input', (e) => {
		const info = getCurrentWord(input);
		showAutocomplete(input, info.word, info.start);
	});
	
	input.addEventListener('keydown', (e) => {
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
