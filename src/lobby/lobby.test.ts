import { test } from "node:test";
import assert from "node:assert/strict";

import { DiscordRestApiError, DiscordRestClient } from "../core/http/DiscordRestClient.js";
import {
	LOBBY_DEVELOPMENT_RATE_LIMITS,
	LOBBY_LIMITS,
	LobbyMemberFlags,
	canLinkLobby,
	linkedChannelId,
	metadataLength,
} from "./Lobby.js";

const BASE = "https://discord.com/api/v10";

type Captured = {
	path: string;
	method?: string;
	body?: unknown;
	authorization?: string;
};

function makeRest(response: { status?: number; body?: string } = {}) {
	const calls: Captured[] = [];

	const rest = new DiscordRestClient({
		token: "bot-token",
		applicationId: "app-1",
		maxRetries: 0,
		fetchImplementation: (async (url: RequestInfo | URL, init?: RequestInit) => {
			const headers = (init?.headers ?? {}) as Record<string, string>;
			calls.push({
				path: String(url).replace(BASE, ""),
				method: init?.method,
				body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
				authorization: headers.Authorization ?? headers.authorization,
			});
			const status = response.status ?? 200;
			// 204/205/304 are null-body statuses; Response throws if given a body.
			const nullBody = status === 204 || status === 205 || status === 304;
			return new Response(nullBody ? null : (response.body ?? "{}"), { status });
		}) as typeof fetch,
	});

	return { rest, calls };
}

test("canLinkLobby reads the CanLinkLobby bit", () => {
	assert.equal(LobbyMemberFlags.CanLinkLobby, 1);
	assert.equal(canLinkLobby({ flags: LobbyMemberFlags.CanLinkLobby }), true);
	assert.equal(canLinkLobby({ flags: 0 }), false);
	assert.equal(canLinkLobby({ flags: undefined }), false);
	// Unknown flags must not be mistaken for CanLinkLobby.
	assert.equal(canLinkLobby({ flags: 0b1111_1110 }), false);
});

test("linkedChannelId and metadataLength are defensive", () => {
	assert.equal(linkedChannelId({ linked_channel: { id: "123" } as never }), "123");
	assert.equal(linkedChannelId({}), undefined);
	assert.equal(metadataLength(undefined), 0);
	assert.equal(metadataLength({ a: "1", bb: "22" }), 1 + 1 + 2 + 2);
});

test("documented limits match Discord's docs", () => {
	assert.equal(LOBBY_LIMITS.MaxMetadataLength, 1000);
	assert.equal(LOBBY_LIMITS.MaxMembersPerRequest, 25);
	assert.equal(LOBBY_LIMITS.MaxAdditionalNameLength, 80);
	assert.equal(LOBBY_LIMITS.MaxSecretLength, 250);
	assert.equal(LOBBY_DEVELOPMENT_RATE_LIMITS.ChannelLinking, 20);
});

test("createLobby posts snake_case fields", async () => {
	const { rest, calls } = makeRest();
	await rest.createLobby({
		metadata: { mode: "raid" },
		members: [{ id: "u1", flags: LobbyMemberFlags.CanLinkLobby }],
		idleTimeoutSeconds: 300,
	});

	assert.equal(calls[0].path, "/lobbies");
	assert.equal(calls[0].method, "POST");
	assert.deepEqual(calls[0].body, {
		metadata: { mode: "raid" },
		members: [{ id: "u1", flags: 1 }],
		idle_timeout_seconds: 300,
	});
	assert.equal(calls[0].authorization, "Bot bot-token");
});

test("createOrJoinLobby uses PUT and the Bearer user token", async () => {
	const { rest, calls } = makeRest();
	await rest.createOrJoinLobby("user-token", { secret: "s".repeat(10), idleTimeoutSeconds: 60 });

	assert.equal(calls[0].path, "/lobbies");
	assert.equal(calls[0].method, "PUT");
	assert.equal(calls[0].authorization, "Bearer user-token");
	assert.deepEqual(calls[0].body, { secret: "s".repeat(10), idle_timeout_seconds: 60 });
});

test("linkChannelToLobby PATCHes channel-linking with the user's Bearer token", async () => {
	const { rest, calls } = makeRest();
	await rest.linkChannelToLobby("lobby-1", "1525905982000070780", "user-token");

	assert.equal(calls[0].path, "/lobbies/lobby-1/channel-linking");
	assert.equal(calls[0].method, "PATCH");
	assert.deepEqual(calls[0].body, { channel_id: "1525905982000070780" });
	// A bot token here is rejected by Discord, so it must not leak into the request.
	assert.equal(calls[0].authorization, "Bearer user-token");
});

test("unlinkChannelFromLobby sends an empty PATCH body", async () => {
	const { rest, calls } = makeRest();
	await rest.unlinkChannelFromLobby("lobby-1", "user-token");

	assert.equal(calls[0].path, "/lobbies/lobby-1/channel-linking");
	assert.equal(calls[0].method, "PATCH");
	assert.deepEqual(calls[0].body, {});
	assert.equal(calls[0].authorization, "Bearer user-token");
});

test("sendLobbyMessage posts content, metadata and flags", async () => {
	const { rest, calls } = makeRest();
	await rest.sendLobbyMessage(
		"lobby-1",
		{ content: "hello", metadata: { k: "v" }, flags: 1 },
		"user-token",
	);

	assert.equal(calls[0].path, "/lobbies/lobby-1/messages");
	assert.equal(calls[0].method, "POST");
	assert.deepEqual(calls[0].body, { content: "hello", metadata: { k: "v" }, flags: 1 });
	assert.equal(calls[0].authorization, "Bearer user-token");
});

test("getLobbyMessages only adds a limit query when asked", async () => {
	const { rest, calls } = makeRest();
	await rest.getLobbyMessages("lobby-1", "user-token");
	await rest.getLobbyMessages("lobby-1", "user-token", { limit: 25 });

	assert.equal(calls[0].path, "/lobbies/lobby-1/messages");
	assert.equal(calls[1].path, "/lobbies/lobby-1/messages?limit=25");
	assert.equal(calls[1].method, undefined);
	assert.equal(calls[1].authorization, "Bearer user-token");
});

test("addLobbyMember forwards flags and additional_name, and clears with null", async () => {
	const { rest, calls } = makeRest();
	await rest.addLobbyMember("lobby-1", "u1", {
		flags: LobbyMemberFlags.CanLinkLobby,
		additional_name: "Ayla",
	});
	await rest.addLobbyMember("lobby-1", "u2", { additional_name: null });

	assert.equal(calls[0].path, "/lobbies/lobby-1/members/u1");
	assert.equal(calls[0].method, "PUT");
	assert.deepEqual(calls[0].body, { flags: 1, additional_name: "Ayla" });
	// `null` is meaningful (clear the name) and must survive serialisation.
	assert.deepEqual(calls[1].body, { additional_name: null });
	assert.equal(calls[0].authorization, "Bot bot-token");
});

test("bulkUpdateLobbyMembers sends the raw array, including remove_member", async () => {
	const { rest, calls } = makeRest();
	await rest.bulkUpdateLobbyMembers("lobby-1", [
		{ id: "u1", flags: LobbyMemberFlags.CanLinkLobby },
		{ id: "u2", remove_member: true },
	]);

	assert.equal(calls[0].path, "/lobbies/lobby-1/members/bulk");
	assert.equal(calls[0].method, "POST");
	assert.deepEqual(calls[0].body, [{ id: "u1", flags: 1 }, { id: "u2", remove_member: true }]);
});

test("member removal and lobby deletion use DELETE and swallow the empty body", async () => {
	const { rest, calls } = makeRest({ status: 204 });
	await rest.removeLobbyMember("lobby-1", "u1");
	await rest.deleteLobby("lobby-1");

	assert.equal(calls[0].path, "/lobbies/lobby-1/members/u1");
	assert.equal(calls[0].method, "DELETE");
	assert.equal(calls[1].path, "/lobbies/lobby-1");
	assert.equal(calls[1].method, "DELETE");
});

test("invites distinguish the self (@me, Bearer) and per-user (bot) variants", async () => {
	const { rest, calls } = makeRest({ body: JSON.stringify({ code: "abc" }) });
	await rest.createLobbyChannelInviteForSelf("lobby-1", "user-token");
	await rest.createLobbyChannelInviteForUser("lobby-1", "u9");

	assert.equal(calls[0].path, "/lobbies/lobby-1/members/@me/invites");
	assert.equal(calls[0].method, "POST");
	assert.equal(calls[0].authorization, "Bearer user-token");
	assert.equal(calls[1].path, "/lobbies/lobby-1/members/u9/invites");
	assert.equal(calls[1].authorization, "Bot bot-token");
});

test("a failed channel link surfaces the HTTP status", async () => {
	const { rest } = makeRest({
		status: 403,
		body: JSON.stringify({ message: "Missing Permissions", code: 50013 }),
	});

	// The development limit on channel linking is easy to hit; the caller needs
	// the status to tell 403 (permissions) from 429 (rate limit).
	await assert.rejects(
		() => rest.linkChannelToLobby("lobby-1", "chan", "user-token"),
		(error: unknown) => {
			assert.ok(error instanceof DiscordRestApiError);
			assert.equal(error.status, 403);
			assert.equal(error.method, "PATCH");
			assert.equal(error.path, "/lobbies/lobby-1/channel-linking");
			return true;
		},
	);
});

test("getLobby returns the linked channel when one is set", async () => {
	const { rest, calls } = makeRest({
		body: JSON.stringify({
			id: "lobby-1",
			application_id: "app-1",
			members: [],
			linked_channel: { id: "1525905982000070780", type: 0, name: "general" },
		}),
	});

	const lobby = await rest.getLobby("lobby-1");
	assert.equal(calls[0].path, "/lobbies/lobby-1");
	assert.equal(linkedChannelId(lobby), "1525905982000070780");
});
