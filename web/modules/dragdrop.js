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
	const modal = document.getElementById(modalId);
	const modalContent = modal.querySelector('.modal-content');
	
	const newModalContent = modalContent.cloneNode(true);
	modalContent.parentNode.replaceChild(newModalContent, modalContent);
	
	newModalContent.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.stopPropagation();
		newModalContent.classList.add('drag-over');
	});

	newModalContent.addEventListener('dragleave', (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.target === newModalContent) {
			newModalContent.classList.remove('drag-over');
		}
	});

	newModalContent.addEventListener('drop', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		newModalContent.classList.remove('drag-over');

		const files = e.dataTransfer.files;
		if (files.length > 0 && files[0].type.startsWith('image/')) {
			const success = await uploadImage(files[0], name, type);
			if (success) {
				// Update preview
				if (type === 'character') {
					const preview = document.getElementById('imagePreview');
					const previewImg = document.getElementById('previewImg');
					previewImg.src = getImageUrl(name);
					preview.style.display = 'block';
				} else if (type === 'style') {
					const preview = document.getElementById('styleImagePreview');
					const previewImg = document.getElementById('stylePreviewImg');
					previewImg.src = getImageUrl(name, 'style');
					preview.style.display = 'block';
				}
				showStatus('Image updated!', 'success');
			} else {
				showStatus('Error uploading image', 'error');
			}
		}
	});
}
