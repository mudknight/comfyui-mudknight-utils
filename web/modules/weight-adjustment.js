/**
 * Weight adjustment module for tag weights using Ctrl+Up/Down
 */

function parseWeightedTag(text) {
	// Match patterns like (tag:1.2) or ((tag1, tag2:1.2))
	// Also handle unweighted tags
	const weightPattern = /^\(+([^)]+):([0-9.]+)\)+$/;
	const match = text.match(weightPattern);
	
	if (match) {
		// Extract content, weight, and count leading/trailing parens
		const leadingParens = text.match(/^\(+/)[0].length;
		const trailingParens = text.match(/\)+$/)[0].length;
		const extraParens = Math.max(0, leadingParens - 1);
		
		return {
			isWeighted: true,
			content: match[1],
			weight: parseFloat(match[2]),
			extraParens: extraParens
		};
	}
	
	return {
		isWeighted: false,
		content: text.trim(),
		weight: 1.0,
		extraParens: 0
	};
}

function formatWeightedTag(content, weight, extraParens = 0) {
	// Round to 1 decimal place
	weight = Math.round(weight * 10) / 10;
	
	// If weight is 1.0, return just the content
	if (weight === 1.0) {
		if (extraParens > 0) {
			return '('.repeat(extraParens) + content + ')'.repeat(extraParens);
		}
		return content;
	}
	
	// Otherwise format with weight
	const weighted = `(${content}:${weight.toFixed(1)})`;
	
	if (extraParens > 0) {
		return '('.repeat(extraParens) + weighted + ')'.repeat(extraParens);
	}
	
	return weighted;
}

function adjustWeight(input, direction) {
	const start = input.selectionStart;
	const end = input.selectionEnd;
	
	// No selection, do nothing
	if (start === end) {
		return;
	}
	
	const fullText = input.value;
	const selectedText = fullText.substring(start, end);
	
	// Parse the selected text
	const parsed = parseWeightedTag(selectedText);
	
	// Calculate new weight
	let newWeight = parsed.weight;
	if (direction === 'up') {
		newWeight += 0.1;
	} else if (direction === 'down') {
		newWeight -= 0.1;
	}
	
	// Clamp weight between 0.1 and 2.0 (reasonable limits)
	newWeight = Math.max(0.1, Math.min(2.0, newWeight));
	
	// Format the new tag
	const newText = formatWeightedTag(
		parsed.content,
		newWeight,
		parsed.extraParens
	);
	
	// Replace the selected text
	const before = fullText.substring(0, start);
	const after = fullText.substring(end);
	input.value = before + newText + after;
	
	// Restore selection on the new text
	input.setSelectionRange(start, start + newText.length);
	
	// Trigger input event so other systems know the value changed
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

function handleKeyDown(e) {
	// Check for Ctrl+Up or Ctrl+Down
	if (!e.ctrlKey) {
		return;
	}
	
	if (e.key === 'ArrowUp') {
		e.preventDefault();
		adjustWeight(e.target, 'up');
	} else if (e.key === 'ArrowDown') {
		e.preventDefault();
		adjustWeight(e.target, 'down');
	}
}

export function setupWeightAdjustment(input) {
	input.addEventListener('keydown', handleKeyDown);
}

export function initWeightAdjustment() {
	// Set up weight adjustment on all text inputs and textareas
	const inputs = document.querySelectorAll('input[type="text"], textarea');
	inputs.forEach(input => {
		setupWeightAdjustment(input);
	});
}
