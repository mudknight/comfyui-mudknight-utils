import { state } from './state.js';
import { encodeName } from './utils.js';

const TAG_CACHE_PREFIX = 'mudknight_tag_cache_';
const TAG_CACHE_META = 'mudknight_tag_cache_meta';
const CACHE_EXPIRY_HOURS = 24;

const AUTOCOMPLETE_CACHE_KEY = 'mudknight_autocomplete_data';
const AUTOCOMPLETE_CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

function getCacheKey(url) {
    // Create a safe key from URL
    return TAG_CACHE_PREFIX + btoa(url).replace(/[^a-zA-Z0-9]/g, '_');
}

function getCacheMeta() {
    try {
        const meta = localStorage.getItem(TAG_CACHE_META);
        return meta ? JSON.parse(meta) : {};
    } catch {
        return {};
    }
}

function setCacheMeta(meta) {
    try {
        localStorage.setItem(TAG_CACHE_META, JSON.stringify(meta));
    } catch (e) {
        console.error('Failed to save cache metadata:', e);
    }
}

function getCachedFile(url) {
    try {
        const key = getCacheKey(url);
        const meta = getCacheMeta();
        const urlMeta = meta[url];

        if (!urlMeta) return null;

        // Check if cache is expired
        const cacheAge = Date.now() - urlMeta.timestamp;
        const maxAge = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;

        if (cacheAge > maxAge) {
            console.log(`Cache expired for ${url}`);
            return null;
        }

        const cached = localStorage.getItem(key);
        if (cached) {
            console.log(
                `Using cached file for ${url} ` +
                `(${(cacheAge / 1000 / 60).toFixed(0)} minutes old)`
            );
            return cached;
        }
    } catch (e) {
        console.error(`Error reading cache for ${url}:`, e);
    }
    return null;
}

function setCachedFile(url, text) {
    try {
        const key = getCacheKey(url);
        const meta = getCacheMeta();

        // Try to store the file
        localStorage.setItem(key, text);

        // Update metadata
        meta[url] = {
            timestamp: Date.now(),
            size: text.length,
            key: key
        };
        setCacheMeta(meta);

        console.log(
            `Cached ${(text.length / 1024).toFixed(1)}KB for ${url}`
        );
        return true;
    } catch (e) {
        // localStorage quota exceeded
        if (e.name === 'QuotaExceededError' || 
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            console.warn(
                `Cache full, cannot cache ${url}. ` +
                `Consider clearing old caches.`
            );
        } else {
            console.error(`Error caching ${url}:`, e);
        }
        return false;
    }
}

function clearRemovedCaches(currentUrls) {
    try {
        const meta = getCacheMeta();
        const currentUrlSet = new Set(
            currentUrls.map(u => u.trim()).filter(Boolean)
        );
        
        let cleared = 0;
        for (const [url, urlMeta] of Object.entries(meta)) {
            if (!currentUrlSet.has(url)) {
                // URL was removed, clear its cache
                try {
                    localStorage.removeItem(urlMeta.key);
                    delete meta[url];
                    cleared++;
                    console.log(`Cleared cache for removed URL: ${url}`);
                } catch (e) {
                    console.error(`Error clearing cache for ${url}:`, e);
                }
            }
        }
        
        if (cleared > 0) {
            setCacheMeta(meta);
            console.log(`Cleared ${cleared} removed cache(s)`);
        }
    } catch (e) {
        console.error('Error clearing removed caches:', e);
    }
}

export async function loadAllAutocompleteData(
    customSources = '',
    customTags = '',
    loadDanbooru = true
) {
    console.log('Loading autocomplete data...');
    
    const tags = await loadAutocompleteTags(customSources, customTags, loadDanbooru);
    
    const [characterPresets, tagPresets, wildcardPresets, loras, embeddings] = 
        await Promise.all([
            loadCharacterPresets(tags),
            loadTagPresets(tags),
            loadWildcardPresets(),
            loadLoras(),
            loadEmbeddings()
        ]);
    
    return { 
        tags, 
        characterPresets, 
        tagPresets, 
        wildcardPresets,
        loras, 
        embeddings 
    };
}

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

async function parseTagFile(text, url) {
    const lines = text.split('\n');
    const tags = [];

    // Detect format: CSV has 3+ fields, TXT has 2
    const firstLine = lines.find(l => l.trim()) || '';
    const firstParts = parseCsvLine(firstLine);
    const isCsv = firstParts.length >= 3;

    console.log(
        `Parsing ${url} as ${isCsv ? 'CSV' : 'TXT'} format`
    );

    for (const line of lines) {
        if (!line.trim()) continue;

        if (isCsv) {
            // CSV format: tag,category,count,aliases
            const parts = parseCsvLine(line);
            if (parts.length < 3) continue;

            const tag = parts[0].trim();
            const category = parseInt(parts[1]) || 0;
            const count = parseInt(parts[2]) || 0;
            const aliasField = parts[3] || '';

            if (category === 2) continue;

            tags.push({
                tag: tag,
                category: category,
                count: count,
                isAlias: false
            });

            if (aliasField) {
                const aliases = parseAliases(aliasField);
                // Check if we should lower alias priority
                const lowerAliasPriority = localStorage.getItem(
                    "Comfy.Settings.Mudknight Utils.Autocomplete" +
                    ".LowerAliasPriority"
                ) !== 'false';  // Default true
                
                for (const alias of aliases) {
                    tags.push({
                        tag: alias,
                        category: category,
                        count: lowerAliasPriority ? 0 : count,
                        isAlias: true,
                        aliasFor: tag
                    });
                }
            }
        } else {
            // TXT format: tag,count
            const parts = line.split(',').map(p => p.trim());
            if (parts.length < 2) continue;

            const tag = parts[0];
            const count = parseInt(parts[1]) || 0;

            if (!tag) continue;

            tags.push({
                tag: tag,
                category: 0,
                count: count,
                isAlias: false
            });
        }
    }

    console.log(`Parsed ${tags.length} tags from ${url}`);
    return tags;
}

export async function loadAutocompleteTags(customSourcesStr = '', customTagsStr = '', loadDanbooru = true) {
    try {
        const allTags = new Map();

        // Parse custom sources first to clear removed caches
        const sources = customSourcesStr && customSourcesStr.trim()
            ? customSourcesStr
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0)
            : [];

        // Clear caches for removed URLs
        clearRemovedCaches(sources);

        // Load base Danbooru CSV
        if (loadDanbooru) {
            try {
                const response = await fetch(
                    '/extensions/comfyui-mudknight-utils/danbooru.csv'
                );
                if (response.ok) {
                    const text = await response.text();
                    const tags = await parseTagFile(text, 'danbooru.csv');

                    for (const tag of tags) {
                        allTags.set(tag.tag.toLowerCase(), tag);
                    }

                    console.log(
                        `Loaded ${tags.length} tags from Danbooru CSV`
                    );
                }
            } catch (error) {
                console.log('Danbooru CSV not found, skipping');
            }
        } else {
            console.log('Danbooru CSV disabled by setting');
        }

        // Load custom sources
        if (sources.length > 0) {
            console.log(
                `Loading ${sources.length} custom tag source(s)...`
            );

            for (const sourceUrl of sources) {
                try {
                    console.log(`Checking ${sourceUrl}...`);

                    // Try to get cached version first
                    let text = getCachedFile(sourceUrl);

                    if (!text) {
                        // Fetch from network
                        console.log(`Fetching ${sourceUrl}...`);
                        const response = await fetch(sourceUrl);

                        if (!response.ok) {
                            console.error(
                                `Failed to load ${sourceUrl}: ` +
                                `${response.status} ${response.statusText}`
                            );
                            continue;
                        }

                        const contentType = response.headers.get(
                            'content-type'
                        ) || '';
                        console.log(`Content-Type: ${contentType}`);

                        text = await response.text();
                        console.log(
                            `Fetched ${(text.length / 1024).toFixed(1)}KB ` +
                            `from ${sourceUrl}`
                        );

                        // Cache the file
                        setCachedFile(sourceUrl, text);
                    }

                    const tags = await parseTagFile(text, sourceUrl);

                    // Merge tags
                    for (const tag of tags) {
                        const key = tag.tag.toLowerCase();
                        const existing = allTags.get(key);

                        if (existing && !tag.isAlias) {
                            // Inherit category from CSV sources
                            if (existing.category !== 0) {
                                tag.category = existing.category;
                            }
                            // Inherit aliases
                            if (existing.isAlias && existing.aliasFor) {
                                tag.aliasFor = existing.aliasFor;
                            }
                        }

                        allTags.set(key, tag);
                    }

                    console.log(
                        `Merged ${tags.length} tags from ${sourceUrl}`
                    );
                } catch (error) {
                    console.error(
                        `Error loading ${sourceUrl}:`,
                        error.message || error
                    );
                    if (error.message && 
                        error.message.includes('CORS')) {
                        console.error(
                            'CORS error: The server must allow ' +
                            'cross-origin requests.'
                        );
                    }
                }
            }
        }

        if (customTagsStr && customTagsStr.trim()) {
            console.log('Parsing custom tags...');
            const customTags = parseCustomTags(customTagsStr);

            for (const tag of customTags) {
                const key = tag.tag.toLowerCase();
                allTags.set(key, tag);
            }

            console.log(`Added ${customTags.length} custom tags`);
        }

        try {
            const tagUsage = await loadTagUsage();
            const usageCount = Object.keys(tagUsage).length;

            if (usageCount > 0) {
                // Check if usage boost is enabled
                const applyUsage = localStorage.getItem(
                    "Comfy.Settings.Mudknight Utils.Autocomplete.ApplyUsage"
                ) !== 'false';

                const onlyExistingTags = localStorage.getItem(
                    "Comfy.Settings.Mudknight Utils.Autocomplete" +
                    ".UsageOnlyExisting"
                ) === 'true';

                if (applyUsage) {
                    console.log(
                        `Applying usage counts for ${usageCount} tags...`
                    );
                    let appliedCount = 0;

                    // Filter usage to only existing tags if enabled
                    let filteredUsage = tagUsage;
                    if (onlyExistingTags) {
                        filteredUsage = {};
                        for (const [key, usage] of Object.entries(tagUsage)) {
                            if (allTags.has(key)) {
                                filteredUsage[key] = usage;
                            }
                        }
                        console.log(
                            `Filtered to ${Object.keys(filteredUsage).length}` +
                            ` existing tags`
                        );
                    }

                    for (const [key, tag] of allTags.entries()) {
                        const usage = filteredUsage[key] || 0;
                        if (usage > 0) {
                            // Boost used tags significantly
                            tag.count = (tag.count || 0) + usage;
                            appliedCount++;
                        }
                    }

                    console.log(`Applied usage boost to ${appliedCount} tags`);
                } else {
                    console.log('Tag usage boost disabled');
                }
            }
        } catch (error) {
            console.error('Error applying tag usage:', error);
        }

        // Convert map to sorted array
        const tags = Array.from(allTags.values());

        // Boost autocomplete keywords
        const keywords = ['character', 'tag', 'embedding', 'wildcard'];
        keywords.forEach(keyword => {
            const existing = tags.find(t => t.tag === keyword);
            if (existing) {
                existing.count = 9999999;
            } else {
                tags.push({
                    tag: keyword,
                    category: 5, // meta
                    count: 9999999,
                    isAlias: false,
                    isKeyword: true
                });
            }
        });

        tags.sort((a, b) => b.count - a.count);

        console.log(
            `Total ${tags.length} tags loaded ` +
            `(${allTags.size} unique)`
        );
        return tags;
    } catch (error) {
        console.error('Error loading autocomplete tags:', error);
        return [];
    }
}


function parseCustomTags(customTagsStr) {
    if (!customTagsStr || !customTagsStr.trim()) {
        return [];
    }

    const tags = [];
    const entries = customTagsStr
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);

    for (const entry of entries) {
        const tagName = entry.replace(/ /g, '_');

        tags.push({
            tag: tagName,
            category: 0,  // General category
            count: 0,
            isAlias: false,
            isCustom: true
        });
    }

    return tags;
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

	// Create array of all check promises
	const checks = Object.keys(dataMap[type]).map(async (name) => {
		try {
			const response = await fetch(
				`${endpoint}${encodeName(name)}`,
				{ method: 'HEAD' }  // Use HEAD for faster checks
			);
			return { name, exists: response.ok };
		} catch (e) {
			return { name, exists: false };
		}
	});

	// Wait for all checks to complete in parallel
	const results = await Promise.all(checks);
	
	// Update state with results
	results.forEach(({ name, exists }) => {
		imageMap[type][name] = exists;
	});
}



export function getImageUrl(name, type = 'character') {
	const endpoint = type === 'character' ? 
		'/character_editor/image/' : '/style_editor/image/';
	// Remove timestamp to allow browser caching
	return `${endpoint}${encodeName(name)}`;
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

export async function loadLoraTriggerWords(name) {
	try {
		// Encode the path but preserve slashes so aiohttp's {name:.*}
		// route pattern matches correctly.
		const encoded = name.split('/').map(encodeURIComponent).join('/');
		const response = await fetch(`/lora_trigger_words/${encoded}`);
		if (!response.ok) return [];
		const words = await response.json();
		return Array.isArray(words) ? words : [];
	} catch (error) {
		console.error('Error loading LoRA trigger words:', error);
		return [];
	}
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

export async function loadTagUsage() {
	try {
		const response = await fetch('/tag_usage');
		if (!response.ok) {
			console.log('No tag usage data available');
			return {};
		}
		const usage = await response.json();
		console.log(`Loaded usage data for ${Object.keys(usage).length} tags`);
		return usage;
	} catch (error) {
		console.error('Error loading tag usage:', error);
		return {};
	}
}

export async function resetTagUsage() {
	try {
		const response = await fetch('/tag_usage/reset', {
			method: 'POST'
		});
		if (!response.ok) {
			throw new Error('Failed to reset tag usage');
		}
		return true;
	} catch (error) {
		console.error('Error resetting tag usage:', error);
		return false;
	}
}

export async function updateTagUsageCounts(tags, usageMultiplier = 1) {
    try {
        const tagUsage = await loadTagUsage();
        if (Object.keys(tagUsage).length === 0) {
            return tags;
        }

        const applyUsage = localStorage.getItem(
            "Comfy.Settings.Mudknight Utils.Autocomplete.ApplyUsage"
        ) !== 'false';

        if (!applyUsage) {
            console.log('Tag usage boost disabled');
            return tags;
        }

        const onlyExistingTags = localStorage.getItem(
            "Comfy.Settings.Mudknight Utils.Autocomplete" +
            ".UsageOnlyExisting"
        ) === 'true';

        console.log(
            `Updating usage counts for ${Object.keys(tagUsage).length}` +
            ` tags...`
        );

        // Create usage map
        let filteredUsage = tagUsage;
        if (onlyExistingTags) {
            const existingTags = new Set(
                tags.map(t => t.tag.toLowerCase())
            );
            filteredUsage = {};
            for (const [key, usage] of Object.entries(tagUsage)) {
                if (existingTags.has(key)) {
                    filteredUsage[key] = usage;
                }
            }
        }

        // Update counts in place
        let updatedCount = 0;
        tags.forEach(tag => {
            const usage = filteredUsage[tag.tag.toLowerCase()] || 0;
            if (usage > 0) {
                tag.count = (tag.count || 0) + (usage * usageMultiplier);
                updatedCount++;
            }
        });

        console.log(`Updated usage for ${updatedCount} tags`);
        return tags;
    } catch (error) {
        console.error('Error updating tag usage:', error);
        return tags;
    }
}

export async function loadAutocompleteSettings() {
	try {
		const response = await fetch('/autocomplete_settings');
		if (!response.ok) {
			return { collect_tag_usage: true };
		}
		return await response.json();
	} catch (error) {
		console.error('Error loading autocomplete settings:', error);
		return { collect_tag_usage: true };
	}
}

export async function saveAutocompleteSettings(settings) {
	try {
		const response = await fetch('/autocomplete_settings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(settings)
		});
		return response.ok;
	} catch (error) {
		console.error('Error saving autocomplete settings:', error);
		return false;
	}
}

export async function loadWildcards() {
    const response = await fetch('/wildcard_editor');
    if (response.ok) {
        return await response.json();
    }
    throw new Error('Failed to load wildcards');
}

export async function saveWildcards(wildcards) {
    const response = await fetch('/wildcard_editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wildcards)
    });
    if (!response.ok) {
        throw new Error('Failed to save wildcards');
    }
}

export async function loadWildcardPresets() {
    try {
        const response = await fetch('/wildcard_editor');
        if (!response.ok) {
            return [];
        }
        const wildcards = await response.json();
        
        const presets = Object.keys(wildcards).map(name => ({
            tag: name.toLowerCase().replace(/ /g, '_'),
            category: 5,  // meta category
            count: 0,
            isAlias: false,
            isPreset: true,
            presetType: 'wildcard'
        }));
        
        return presets;
    } catch (error) {
        console.error('Error loading wildcard presets:', error);
        return [];
    }
}
