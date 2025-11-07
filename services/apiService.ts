import { ParsedApiData, ApiPath, ApiMethod } from '../types';

/**
 * Parses a given OpenAPI specification string.
 * This is a pure function that takes content and returns parsed data.
 * @param specContent The string content of the OpenAPI/Swagger JSON file.
 * @returns An object containing both the parsed data for the UI and the raw spec for AI context.
 */
export const parseOpenApiSpec = (specContent: string): { parsedData: ParsedApiData, rawSpec: any } => {
  try {
    const spec = JSON.parse(specContent);

    if (!spec.paths || !spec.openapi) {
        throw new Error("Invalid OpenAPI v3 specification file. 'paths' or 'openapi' property is missing.");
    }
    
    const rootSecurity = spec.security || [];

    const paths: ApiPath[] = Object.entries(spec.paths).map(([path, pathItem]: [string, any]) => {
      const pathLevelParameters = pathItem.parameters || [];

      const methods: ApiMethod[] = Object.entries(pathItem)
        .map(([method, details]: [string, any]): ApiMethod | null => {
          if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
            
            const methodLevelParameters = details.parameters || [];
            const allParameters = [...pathLevelParameters, ...methodLevelParameters];

            let requestBodySchema;
            let isSubmissionEndpoint = false;
            
            const reqBody = details.requestBody || details.requestbody;

            // --- DEFINITIVE FIX ---
            // Implemented a recursive function to find the schema reference. This robustly handles
            // complex schema structures, such as those using the `allOf` composition keyword,
            // which was the unhandled edge case and root cause of the feature failing on deployment.
            const findRefRecursively = (schemaObj: any, refSuffix: string): boolean => {
                if (!schemaObj) return false;
                if (schemaObj.$ref && typeof schemaObj.$ref === 'string' && schemaObj.$ref.endsWith(refSuffix)) {
                    return true;
                }
                if (schemaObj.allOf && Array.isArray(schemaObj.allOf)) {
                    return schemaObj.allOf.some((item: any) => findRefRecursively(item, refSuffix));
                }
                // This can be extended to handle `oneOf`, `anyOf` etc. if needed in the future.
                return false;
            };

            if (reqBody?.content) {
                // Iterate over all content types to find the submission DTO.
                for (const contentType in reqBody.content) {
                    const schema = reqBody.content[contentType]?.schema;
                    if (findRefRecursively(schema, '/FullFormSubmissionDto')) {
                        isSubmissionEndpoint = true;
                        break; 
                    }
                }

                // Get the primary schema for UI/generation purposes, also using a case-insensitive key.
                requestBodySchema = reqBody.content['application/json']?.schema ||
                                    reqBody.content['application/json-patch+json']?.schema ||
                                    reqBody.content['text/json']?.schema ||
                                    reqBody.content['application/*+json']?.schema ||
                                    reqBody.content['multipart/form-data']?.schema;
            }

            if (requestBodySchema?.$ref) {
              const refPath = requestBodySchema.$ref.split('/').slice(1);
              let resolvedSchema = spec;
              try {
                  for (const p of refPath) {
                    resolvedSchema = resolvedSchema[p];
                  }
                  requestBodySchema = resolvedSchema;
              } catch (e) {
                  console.warn(`Could not resolve $ref: ${requestBodySchema.$ref}`);
              }
            }

            return {
              method: method.toUpperCase(),
              description: details.summary || details.description,
              requestBodySchema: requestBodySchema,
              isSubmissionEndpoint: isSubmissionEndpoint,
              parameters: allParameters,
              security: details.security || rootSecurity,
            };
          }
          return null;
        })
        .filter((m): m is ApiMethod => m !== null);
      
      return { path, methods };
    });

    const parsedData = { paths: paths.filter(p => p.methods.length > 0) };
    return { parsedData, rawSpec: spec };
  } catch (error) {
    console.error("Error parsing OpenAPI spec content:", error);
    if (error instanceof SyntaxError) {
        throw new Error("The provided API specification file is not valid JSON.");
    }
    throw new Error(`Could not parse the API specification file. ${error instanceof Error ? error.message : ''}`);
  }
};

/**
 * Uploads a file to the blob storage endpoint.
 * @param file The file to upload.
 * @param id The ID to pass as a query parameter (e.g., NCOS ID).
 * @param baseUrl The base URL of the API.
 * @returns The blobId returned from the server.
 */
export const uploadFileToBlobStorage = async (
    file: File,
    id: string,
    baseUrl: string
): Promise<string> => {
    const formData = new FormData();
    formData.append('File', file);

    // Ensure the URL is constructed correctly without double slashes.
    const trimmedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const url = `${trimmedBaseUrl}/api/Blob/uploadBlob?Id=${id}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`File upload failed with status ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        if (!result.blobId) {
            throw new Error("File upload response did not include a blobId.");
        }

        return result.blobId;
    } catch (error) {
        console.error("Error uploading file to blob storage:", error);
        throw error; // Re-throw to be handled by the caller
    }
};
