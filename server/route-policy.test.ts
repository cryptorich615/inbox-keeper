import { describe, expect, it } from "vitest";
import { isOAuthCallback, isPublicFrontendRequest } from "./route-policy.js";

describe("production route policy", () => {
  it("keeps the SPA and static assets public", () => {
    expect(isPublicFrontendRequest("GET", "/")).toBe(true);
    expect(isPublicFrontendRequest("GET", "/protected")).toBe(true);
    expect(isPublicFrontendRequest("GET", "/assets/app.js")).toBe(true);
  });

  it("never treats API or internal routes as SPA fallbacks", () => {
    expect(isPublicFrontendRequest("GET", "/api/status")).toBe(false);
    expect(isPublicFrontendRequest("POST", "/api/session")).toBe(false);
    expect(isPublicFrontendRequest("GET", "/internal/tasks/reconcile")).toBe(false);
  });

  it("recognizes only the exact OAuth callback pathname", () => {
    expect(isOAuthCallback("/api/oauth/callback?state=x&code=y")).toBe(true);
    expect(isOAuthCallback("/api/oauth/callback/extra")).toBe(false);
    expect(isOAuthCallback("/api/oauth/start")).toBe(false);
  });
});
