/** Loads a Secret Manager resource through Workload Identity. Values are never logged. */
export declare function accessSecret(resourceName: string, client?: import("@google-cloud/secret-manager/build/src/v1/secret_manager_service_client.js").SecretManagerServiceClient): Promise<string>;
