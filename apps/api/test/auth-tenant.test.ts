import { describe, expect, it } from "vitest";
import { resolverTenantSlug } from "../src/auth/tenant.js";

describe("resolverTenantSlug", () => {
  it("usa publicMetadata.tenantSlug quando presente", () => {
    expect(resolverTenantSlug({ userId: "user_abc", tenantSlugMeta: "acme" })).toBe("acme");
  });

  it("fallback user_<sub> sem metadata", () => {
    expect(resolverTenantSlug({ userId: "user_abc" })).toBe("user_user_abc");
  });
});
