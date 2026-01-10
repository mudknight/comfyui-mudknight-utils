import { uploadImage, getImageUrl } from './api.js';
import { showStatus } from './utils.js';

export function setupDragAndDrop(card, name, type = 'character') {
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
			const success = await uploadImage(files[0], name, type);
			if (success) {
				showStatus('Image updated!', 'success');
				// Trigger re-render
				if (type === 'character' && window.renderCharacters) {
					window.renderCharacters();
				} else if (type === 'style' && window.renderStyles) {
					window.renderStyles();
				}
			} else {
				showStatus('Error uploading image', 'error');
			}
		}
	});
}

export function setupModalDragAndDrop(modalId, name, type = 'character') {
	const dropZoneId = type === 'character' ? 
		'charImageDropZone' : 'styleImageDropZone';
	const previewId = type === 'character' ? 
		'previewImg' : 'stylePreviewImg';

	const dropZone = document.getElementById(dropZoneId);
	const previewImg = document.getElementById(previewId);

	if (!dropZone) return;

	// Remove old listeners by cloning
	const newDropZone = dropZone.cloneNode(true);
	dropZone.parentNode.replaceChild(newDropZone, dropZone);
	const finalDropZone = document.getElementById(dropZoneId);
	const finalPreview = document.getElementById(previewId);

	const handleImage = async (file) => {
		if (!file.type.startsWith('image/')) return;

		// For new characters/styles, just preview
		if (!name || name === 'new' || name === '') {
			const reader = new FileReader();
			reader.onload = (e) => {
				finalPreview.src = e.target.result;
				finalPreview.style.display = 'block';
				finalDropZone.classList.add('has-image');

				// Store pending image
				if (type === 'character') {
					window.pendingCharacterImage = e.target.result;
				} else {
					window.pendingStyleImage = e.target.result;
				}

				showStatus('Image ready (will upload on save)', 'success');
			};
			reader.readAsDataURL(file);
		} else {
			// Existing character - upload immediately
			const success = await uploadImage(file, name, type);
			if (success) {
				finalPreview.src = getImageUrl(name, type);
				finalPreview.style.display = 'block';
				finalDropZone.classList.add('has-image');
				showStatus('Image updated!', 'success');
			} else {
				showStatus('Error uploading image', 'error');
			}
		}
	};

	// Drag and drop
	finalDropZone.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.stopPropagation();
		finalDropZone.classList.add('drag-over');
	});

	finalDropZone.addEventListener('dragleave', (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.target === finalDropZone) {
			finalDropZone.classList.remove('drag-over');
		}
	});

	finalDropZone.addEventListener('drop', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		finalDropZone.classList.remove('drag-over');

		const files = e.dataTransfer.files;
		if (files.length > 0) {
			await handleImage(files[0]);
		}
	});

	// Click to browse
	finalDropZone.addEventListener('click', () => {
		const fileInput = document.getElementById(
			type === 'character' ? 'editImage' : 'editStyleImage'
		);
		fileInput?.click();
	});
}
