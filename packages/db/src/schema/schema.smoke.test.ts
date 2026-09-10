import { describe, expect, it } from "vitest";
import { companies, projects, rfis, users } from "./index";

describe("drizzle schema smoke test", () => {
  it("exports the core tables with their expected Postgres table names", () => {
    expect(companies).toBeDefined();
    expect(users).toBeDefined();
    expect(projects).toBeDefined();
    expect(rfis).toBeDefined();
  });
});
