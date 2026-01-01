export function encodeName(name) {
	return btoa(unescape(encodeURIComponent(name)));
}

export function decodeName(b64) {
	return decodeURIComponent(escape(atob(b64)));
}

export function getSortedNames(obj) {
	return Object.keys(obj).sort((a, b) => 
		a.toLowerCase().localeCompare(b.toLowerCase())
	);
}

export function showStatus(message, type) {
	const status = document.getElementById('status');
	status.textContent = message;
	status.className = `status ${type} show`;
	
	if (status.hideTimeout) {
		clearTimeout(status.hideTimeout);
	}
	
	status.hideTimeout = setTimeout(() => {
		status.classList.add('hiding');
		
		setTimeout(() => {
			status.classList.remove('show', 'hiding');
		}, 300);
	}, 3000);
}

export function loadSidebarState() {
	const saved = localStorage.getItem('sidebarCollapsed');
	if (saved !== null) {
		return saved === 'true';
	}
	return false;
}

export function saveSidebarState(collapsed) {
	localStorage.setItem('sidebarCollapsed', collapsed);
}
