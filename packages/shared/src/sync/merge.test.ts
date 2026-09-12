import { describe, expect, it } from "vitest";
import { mergeFields } from "./merge";

describe("mergeFields", () => {
  it("applies every field for a brand-new offline record (no base)", () => {
    const result = mergeFields(null, { notes: "hello", priority: "high" }, {});
    expect(result.merged).toEqual({ notes: "hello", priority: "high" });
    expect(result.conflicts).toHaveLength(0);
  });

  it("ignores a field the client didn't actually change", () => {
    const base = { notes: "same", priority: "low" };
    const client = { notes: "same", priority: "high" };
    const server = { notes: "same edited on server", priority: "low" };
    const result = mergeFields(base, client, server);
    // client didn't touch notes -> leave alone even though server changed it
    expect(result.merged).toEqual({ priority: "high" });
    expect(result.conflicts).toHaveLength(0);
  });

  it("applies a field only the client changed (server untouched since base)", () => {
    const base = { notes: "same" };
    const client = { notes: "client edit" };
    const server = { notes: "same" };
    const result = mergeFields(base, client, server);
    expect(result.merged).toEqual({ notes: "client edit" });
    expect(result.conflicts).toHaveLength(0);
  });

  it("converges silently when both sides made the identical change", () => {
    const base = { notes: "same" };
    const client = { notes: "converged" };
    const server = { notes: "converged" };
    const result = mergeFields(base, client, server);
    expect(result.merged).toEqual({ notes: "converged" });
    expect(result.conflicts).toHaveLength(0);
  });

  it("flags a genuine conflict when both sides changed the same field differently, and does not apply it", () => {
    const base = { notes: "original" };
    const client = { notes: "client version" };
    const server = { notes: "server version" };
    const result = mergeFields(base, client, server);
    expect(result.merged).toEqual({});
    expect(result.conflicts).toEqual([
      { field: "notes", base: "original", server: "server version", client: "client version" },
    ]);
  });

  it("handles mixed fields: one applies cleanly, one conflicts", () => {
    const base = { notes: "original", priority: "low" };
    const client = { notes: "client version", priority: "high" };
    const server = { notes: "server version", priority: "low" };
    const result = mergeFields(base, client, server);
    expect(result.merged).toEqual({ priority: "high" });
    expect(result.conflicts).toEqual([
      { field: "notes", base: "original", server: "server version", client: "client version" },
    ]);
  });

  it("compares Date values by their time, not reference/string identity", () => {
    const base = { dueDate: new Date("2026-01-01T00:00:00Z") };
    const client = { dueDate: new Date("2026-01-02T00:00:00Z") };
    const server = { dueDate: new Date("2026-01-01T00:00:00.000Z") };
    const result = mergeFields(base, client, server);
    expect(result.merged).toEqual({ dueDate: client.dueDate });
    expect(result.conflicts).toHaveLength(0);
  });
});
