import type { WebClient } from "@slack/web-api";
import { describe, expect, it, vi } from "vitest";
import { createWebApiResolvers } from "./resolvers";

/** A minimal mock of the slice of WebClient this package calls. */
function mockClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    users: { info: vi.fn() },
    conversations: { info: vi.fn() },
    usergroups: { list: vi.fn() },
    ...overrides,
  } as unknown as WebClient;
}

/** Waits past the (tiny, test-only) batch window so queued lookups have flushed. */
function flushed() {
  return new Promise((r) => setTimeout(r, 5));
}

describe("createWebApiResolvers", () => {
  it("returns undefined synchronously and resolves the name once the lookup completes", async () => {
    const client = mockClient();
    (client.users.info as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      user: { id: "U1", name: "alice", real_name: "Alice", profile: {} },
    });
    const resolvers = createWebApiResolvers(client, { batchWindowMs: 0 });

    expect(resolvers.user?.("U1")).toBeUndefined();
    await flushed();
    expect(resolvers.user?.("U1")).toBe("Alice");
  });

  it("caches: a resolved id is never looked up twice", async () => {
    const client = mockClient();
    const info = client.users.info as ReturnType<typeof vi.fn>;
    info.mockResolvedValue({ ok: true, user: { id: "U1", name: "alice", profile: {} } });
    const resolvers = createWebApiResolvers(client, { batchWindowMs: 0 });

    resolvers.user?.("U1");
    await flushed();
    expect(resolvers.user?.("U1")).toBe("alice");
    resolvers.user?.("U1");
    resolvers.user?.("U1");
    await flushed();
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent lookups for the same id fired before the batch flushes", async () => {
    const client = mockClient();
    const info = client.users.info as ReturnType<typeof vi.fn>;
    info.mockResolvedValue({ ok: true, user: { id: "U1", name: "alice", profile: {} } });
    const resolvers = createWebApiResolvers(client, { batchWindowMs: 10 });

    resolvers.user?.("U1");
    resolvers.user?.("U1");
    resolvers.user?.("U1");
    await flushed();
    await new Promise((r) => setTimeout(r, 10));
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("batches distinct ids requested in the same window into concurrent requests", async () => {
    const client = mockClient();
    const info = client.users.info as ReturnType<typeof vi.fn>;
    info.mockImplementation(async ({ user }: { user: string }) => ({
      ok: true,
      user: { id: user, name: user.toLowerCase() },
    }));
    const resolvers = createWebApiResolvers(client, { batchWindowMs: 10 });

    resolvers.user?.("U1");
    resolvers.user?.("U2");
    resolvers.user?.("U3");
    await new Promise((r) => setTimeout(r, 20));

    expect(info).toHaveBeenCalledTimes(3);
    expect(resolvers.user?.("U1")).toBe("u1");
    expect(resolvers.user?.("U2")).toBe("u2");
    expect(resolvers.user?.("U3")).toBe("u3");
  });

  it("resolves channels with a leading #", async () => {
    const client = mockClient();
    (client.conversations.info as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      channel: { id: "C1", name: "general" },
    });
    const resolvers = createWebApiResolvers(client, { batchWindowMs: 0 });

    resolvers.channel?.("C1");
    await flushed();
    expect(resolvers.channel?.("C1")).toBe("#general");
  });

  it("treats an unknown id as permanently undefined without throwing", async () => {
    const client = mockClient();
    (client.users.info as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("user_not_found"));
    const resolvers = createWebApiResolvers(client, { batchWindowMs: 0 });

    resolvers.user?.("UNKNOWN");
    await flushed();
    expect(resolvers.user?.("UNKNOWN")).toBeUndefined();
  });

  it("tolerates conversations.info errors the same way", async () => {
    const client = mockClient();
    (client.conversations.info as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("channel_not_found"),
    );
    const resolvers = createWebApiResolvers(client, { batchWindowMs: 0 });

    resolvers.channel?.("CBAD");
    await flushed();
    expect(resolvers.channel?.("CBAD")).toBeUndefined();
  });

  it("resolves usergroups from a single usergroups.list call, reused for every id", async () => {
    const client = mockClient();
    const list = client.usergroups.list as ReturnType<typeof vi.fn>;
    list.mockResolvedValue({
      ok: true,
      usergroups: [
        { id: "S1", handle: "eng", name: "Engineering" },
        { id: "S2", name: "Design" },
      ],
    });
    const resolvers = createWebApiResolvers(client, { batchWindowMs: 0 });

    expect(resolvers.usergroup?.("S1")).toBeUndefined();
    resolvers.usergroup?.("S2");
    await flushed();

    expect(resolvers.usergroup?.("S1")).toBe("@eng");
    expect(resolvers.usergroup?.("S2")).toBe("Design");
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("doesn't throw when usergroups.list is unsupported (e.g. by an emulator)", async () => {
    const client = mockClient();
    (client.usergroups.list as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("not_implemented"),
    );
    const resolvers = createWebApiResolvers(client, { batchWindowMs: 0 });

    expect(() => resolvers.usergroup?.("S1")).not.toThrow();
    await flushed();
    expect(resolvers.usergroup?.("S1")).toBeUndefined();
  });

  it("notifies subscribers once a lookup completes", async () => {
    const client = mockClient();
    (client.users.info as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      user: { id: "U1", name: "alice" },
    });
    const resolvers = createWebApiResolvers(client, { batchWindowMs: 0 });
    const listener = vi.fn();
    const unsubscribe = resolvers.subscribe(listener);

    resolvers.user?.("U1");
    await flushed();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    resolvers.user?.("U2");
    await flushed();
    expect(listener).not.toHaveBeenCalled();
  });
});
