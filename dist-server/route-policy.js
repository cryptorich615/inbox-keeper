export function isPublicFrontendRequest(method, url) {
    if (method !== "GET" && method !== "HEAD")
        return false;
    const pathname = new URL(url || "/", "http://localhost").pathname;
    return !pathname.startsWith("/api/") && !pathname.startsWith("/internal/");
}
export function isOAuthCallback(url) {
    return new URL(url || "/", "http://localhost").pathname === "/api/oauth/callback";
}
