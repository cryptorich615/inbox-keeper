function required(env, name) {
    const value = env[name]?.trim();
    if (!value)
        throw new Error(`Missing required configuration reference: ${name}`);
    return value;
}
export function loadProductionConfig(env = process.env) {
    const localTest = env.GMAIL_LOCAL_TEST === "enabled";
    if (localTest ? env.NODE_ENV !== "development" : env.NODE_ENV !== "production")
        throw new Error(localTest
            ? "Local Gmail test requires NODE_ENV=development"
            : "Production entrypoint requires NODE_ENV=production");
    if (env.GMAIL_LIVE_MODE !== "enabled")
        throw new Error("Live Gmail must be explicitly enabled");
    const appOrigin = required(env, "APP_ORIGIN");
    const googleRedirectUri = required(env, "GMAIL_REDIRECT_URI");
    const origin = new URL(appOrigin);
    const callback = new URL(googleRedirectUri);
    if (localTest) {
        if (origin.origin !== "http://127.0.0.1:8080")
            throw new Error("Local Gmail test origin must be http://127.0.0.1:8080");
        if (Number(env.PORT || 8080) !== 8080)
            throw new Error("Local Gmail test port must be 8080");
    }
    else if (origin.protocol !== "https:" || callback.protocol !== "https:")
        throw new Error("Production origins must use HTTPS");
    if (callback.origin !== origin.origin ||
        callback.pathname !== "/api/oauth/callback")
        throw new Error("OAuth callback must exactly match APP_ORIGIN + /api/oauth/callback");
    const databaseUrl = required(env, "DATABASE_URL");
    if (!databaseUrl.startsWith("postgres://") &&
        !databaseUrl.startsWith("postgresql://"))
        throw new Error("DATABASE_URL must reference PostgreSQL");
    if (localTest) {
        const database = new URL(databaseUrl);
        if (database.hostname !== "127.0.0.1" || (database.port && database.port !== "5432"))
            throw new Error("Local Gmail test database must use 127.0.0.1:5432");
    }
    return {
        localTest,
        appOrigin: origin.origin,
        port: Number(env.PORT || 8080),
        databaseUrl,
        googleClientId: required(env, localTest ? "GMAIL_CLIENT_ID_FILE" : "GMAIL_CLIENT_ID"),
        googleClientSecretResource: required(env, localTest ? "GMAIL_CLIENT_SECRET_FILE" : "GMAIL_CLIENT_SECRET_RESOURCE"),
        googleRedirectUri,
        kmsKeyName: required(env, localTest ? "LOCAL_ENVELOPE_KEY_FILE" : "GCP_KMS_KEY_NAME"),
        taskAudience: localTest ? "" : required(env, "CLOUD_TASKS_AUDIENCE"),
        taskServiceAccount: localTest
            ? ""
            : required(env, "CLOUD_TASKS_SERVICE_ACCOUNT"),
    };
}
