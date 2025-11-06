
import type { ApiSpecMetadata } from '../types';

const METADATA_STORAGE_KEY = 'roportal_api_specs_metadata';
const CONTENT_STORAGE_PREFIX = 'roportal_api_spec_content_';

/**
 * Fetches the metadata for all API specs from localStorage.
 */
export const getApiSpecsMetadata = async (): Promise<ApiSpecMetadata[]> => {
    try {
        const storedMetadata = localStorage.getItem(METADATA_STORAGE_KEY);
        if (!storedMetadata) {
            return [];
        }
        const specs: ApiSpecMetadata[] = JSON.parse(storedMetadata);
        // Sort by creation date, newest first, with a safeguard against invalid date values.
        specs.sort((a, b) => (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0));
        return specs;
    } catch (error) {
        console.error("Failed to retrieve API specs from localStorage:", error);
        // If parsing fails, it's corrupted. Clear it.
        localStorage.removeItem(METADATA_STORAGE_KEY);
        return [];
    }
};

/**
 * Retrieves the content of a specific API spec file from localStorage.
 * @param storagePath The ID of the spec, used as part of the storage key.
 */
export const getApiSpecContent = async (storagePath: string): Promise<string> => {
    const content = localStorage.getItem(`${CONTENT_STORAGE_PREFIX}${storagePath}`);
    if (content === null) {
        throw new Error("API specification content not found in local storage.");
    }
    return content;
};

/**
 * Uploads a new API spec file and saves its metadata and content to localStorage.
 * @param file The File object to upload.
 * @param description A user-provided description for the spec version.
 * @returns The metadata of the newly created spec record.
 */
export const uploadApiSpec = async (file: File, description: string): Promise<ApiSpecMetadata> => {
    if (!description.trim()) {
        throw new Error("Description cannot be empty.");
    }

    const fileContent = await file.text();
    const specs = await getApiSpecsMetadata();

    const newSpecMetadata: ApiSpecMetadata = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        file_name: file.name,
        description,
        storage_path: '', // will be set to id
    };
    newSpecMetadata.storage_path = newSpecMetadata.id;

    // Save content
    localStorage.setItem(`${CONTENT_STORAGE_PREFIX}${newSpecMetadata.id}`, fileContent);

    // Save metadata
    const newSpecsList = [newSpecMetadata, ...specs];
    localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(newSpecsList));

    return newSpecMetadata;
};


/**
 * Deletes an API spec from localStorage.
 * @param spec The metadata object of the spec to delete.
 */
export const deleteApiSpec = async (spec: ApiSpecMetadata): Promise<void> => {
    // 1. Delete the content
    localStorage.removeItem(`${CONTENT_STORAGE_PREFIX}${spec.storage_path}`);
    
    // 2. Delete the metadata record
    const specs = await getApiSpecsMetadata();
    const updatedSpecs = specs.filter(s => s.id !== spec.id);
    localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(updatedSpecs));
};
