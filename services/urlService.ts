import type { SavedUrl } from '../types';

const STORAGE_KEY = 'roportal_saved_urls';

const defaultUrls: Omit<SavedUrl, 'id'>[] = [
    {
        comment: 'Example Staging API',
        url: 'https://api.staging.example.com/'
    },
    {
        comment: 'Example Production API',
        url: 'https://api.production.example.com/'
    }
];

/**
 * Saves a complete list of URLs to local storage, overwriting any existing data.
 * @param urls The array of SavedUrl objects to save.
 */
const saveUrls = (urls: SavedUrl[]): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
    } catch (error) {
        console.error("Failed to save URLs to local storage:", error);
    }
};


/**
 * Retrieves all saved URLs from local storage.
 * If no URLs are found, it initializes local storage with a default set.
 * @returns An array of SavedUrl objects.
 */
export const getSavedUrls = (): SavedUrl[] => {
    try {
        const storedUrls = localStorage.getItem(STORAGE_KEY);
        if (!storedUrls) {
            // No URLs found, let's initialize with defaults.
            const urlsWithIds: SavedUrl[] = defaultUrls.map(u => ({
                ...u,
                id: crypto.randomUUID()
            }));
            saveUrls(urlsWithIds);
            return urlsWithIds;
        }
        return JSON.parse(storedUrls);
    } catch (error) {
        console.error("Failed to parse saved URLs from local storage:", error);
        // If data is corrupted, clear it to prevent further issues.
        localStorage.removeItem(STORAGE_KEY);
        return [];
    }
};

/**
 * Adds a new URL to the saved list.
 * @param newUrl The URL and comment for the new entry.
 * @returns The newly created SavedUrl object, including its generated ID.
 */
export const addUrl = (newUrl: Omit<SavedUrl, 'id'>): SavedUrl => {
    const urls = getSavedUrls();
    const urlToAdd: SavedUrl = {
        ...newUrl,
        id: crypto.randomUUID(),
    };
    const updatedUrls = [...urls, urlToAdd];
    saveUrls(updatedUrls);
    return urlToAdd;
};

/**
 * Updates an existing saved URL.
 * @param updatedUrl The SavedUrl object with updated information.
 */
export const updateUrl = (updatedUrl: SavedUrl): void => {
    const urls = getSavedUrls();
    const urlIndex = urls.findIndex(u => u.id === updatedUrl.id);
    if (urlIndex !== -1) {
        urls[urlIndex] = updatedUrl;
        saveUrls(urls);
    } else {
        console.warn("Attempted to update a URL that does not exist:", updatedUrl.id);
    }
};

/**
 * Deletes a saved URL by its ID.
 * @param id The ID of the URL to delete.
 */
export const deleteUrl = (id: string): void => {
    const urls = getSavedUrls();
    const updatedUrls = urls.filter(u => u.id !== id);
    saveUrls(updatedUrls);
};