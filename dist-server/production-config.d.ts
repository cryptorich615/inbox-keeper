export interface ProductionConfig {
    localTest: boolean;
    appOrigin: string;
    port: number;
    databaseUrl: string;
    googleClientId: string;
    googleClientSecretResource: string;
    googleRedirectUri: string;
    kmsKeyName: string;
    taskAudience: string;
    taskServiceAccount: string;
}
export declare function loadProductionConfig(env?: NodeJS.ProcessEnv): ProductionConfig;
