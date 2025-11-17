import { ParsedApiData, ApiPath, ApiMethod, Header } from '../types';
import { supabase, supabaseUrl, supabaseAnonKey } from './supabaseClient';

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
 * Sends a lightweight request to a known endpoint to verify an authentication token.
 * @param token The Bearer token to verify.
 * @param baseUrl The base URL of the API.
 * @param useCorsProxy Whether to route the request through the CORS proxy.
 * @returns An object indicating success, status code, and a message.
 */
export const verifyApiToken = async (
    token: string,
    baseUrl: string,
    useCorsProxy?: boolean
): Promise<{ success: boolean; status: number; message: string }> => {
    if (!token.trim()) {
        return { success: false, status: 0, message: 'Token cannot be empty.' };
    }
    if (!baseUrl.trim()) {
        return { success: false, status: 0, message: 'Base URL must be set.' };
    }

    // A simple, harmless GET endpoint from the spec to test authentication.
    const validationEndpoint = '/api/ReferenceData';
    const targetUrl = `${baseUrl.replace(/\/$/, '')}${validationEndpoint}`;
    
    let authHeaderValue = token;
    if (!/^bearer /i.test(authHeaderValue)) {
        authHeaderValue = `Bearer ${authHeaderValue}`;
    }

    try {
        let response;
        if (useCorsProxy) {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("A user session is required to use the CORS proxy.");

            const functionsUrl = `${supabaseUrl}/functions/v1/cors-proxy`;
            response = await fetch(functionsUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                    'apikey': supabaseAnonKey,
                },
                body: JSON.stringify({
                    url: targetUrl,
                    options: { method: 'OPTIONS', headers: { 'Authorization': authHeaderValue } }
                }),
            });
        } else {
            response = await fetch(targetUrl, {
                method: 'OPTIONS',
                headers: { 'Authorization': authHeaderValue },
            });
        }

        if (response.ok) {
            return { success: true, status: response.status, message: 'Token is valid.' };
        } else {
            return { success: false, status: response.status, message: `Verification failed: ${response.statusText}` };
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown network error occurred.';
        return { success: false, status: 0, message: `Network Error: ${errorMessage}` };
    }
};