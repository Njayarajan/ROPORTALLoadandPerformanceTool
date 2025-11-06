/**
 * Converts a camelCase or PascalCase string into a human-readable Title Case string.
 * @param str The input string (e.g., "formDataDto").
 * @returns The converted string (e.g., "Form Data Dto").
 */
export const toTitleCase = (str: string): string => {
    if (!str) return '';
    // Add a space before capital letters, then capitalize the first letter of the string.
    return str.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
};

/**
 * Converts a File object to a Base64 encoded string, stripping the data URL prefix.
 * @param file The File object to convert.
 * @returns A promise that resolves with the Base64 string.
 */
export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // The result includes a prefix like 'data:image/png;base64,'. We need to remove it.
            const base64Data = result.split(',')[1];
            resolve(base64Data);
        };
        reader.onerror = (error) => reject(error);
    });
};
