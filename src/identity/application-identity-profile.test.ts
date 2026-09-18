import { test } from "node:test";
import assert from "node:assert/strict";

import { DiscordRestClient, DiscordRestApiError } from "../core/http/DiscordRestClient.js";
import {
	APPLICATION_IDENTITY_LIMITS,
	ApplicationIdentityProfileError,
	assertProfileDataWithinLimits,
	assertUsernameLength,
	buildProfileData,
	isPublicMediaUrl,
	mergeProfileData,
	type ApplicationIdentityProfile,
	type ApplicationIdentityProfileData,
	type DynamicProfileField,
} from "./ApplicationIdentityProfile.js";

const BASE = "https://discord.com/api/v10";

type CapturedCall = { path: string; method?: string; body?: unknown };

function makeRest(responses: Array<unknown> = []) {
	const calls: CapturedCall[] = [];

	const rest = new DiscordRestClient({
		token: "bot-token",
		applicationId: "app-1",
		fetchImplementation: (async (_url: RequestInfo | URL, init?: RequestInit) => {
			calls.push({
				path: String(_url).replace(BASE, ""),
				method: init?.method,
				body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
			});
			const next = responses.shift();
			if (next instanceof Response) return next;
			return new Response(JSON.stringify(next ?? {}), { status: 200 });
		}) as typeof fetch,
	});

	return { rest, calls };
}

function codeOf(fn: () => unknown): string {
	try {
		fn();
	} catch (error) {
		assert.ok(error instanceof ApplicationIdentityProfileError);
		return error.code;
	}
	throw new Error("expected the call to throw");
}

test("isPublicMediaUrl rejects hosts Discord cannot fetch", () => {
	assert.equal(isPublicMediaUrl("https://cdn.example.com/rank.png"), true);
	assert.equal(isPublicMediaUrl("http://example.com/a.png"), true);

	for (const url of [
		"http://localhost:3000/rank.png",
		"http://127.0.0.1/rank.png",
		"http://0.0.0.0/rank.png",
		"http://192.168.1.10/rank.png",
		"http://10.1.2.3/rank.png",
		"http://172.16.0.5/rank.png",
		"http://169.254.1.1/rank.png",
		"http://rank.internal/a.png",
		"ftp://example.com/a.png",
		"not a url",
		// trailing-dot FQDN and IPv6 literals must not slip through
		"http://localhost./rank.png",
		"http://[::1]/rank.png",
		"http://[fe80::1]/rank.png",
		"http://[febf::1]/rank.png",
		"http://[fc00::1]/rank.png",
		"http://[fd12:3456::1]/rank.png",
		"http://[::ffff:127.0.0.1]/rank.png",
	]) {
		assert.equal(isPublicMediaUrl(url), false, `expected ${url} to be rejected`);
	}
});

test("isPublicMediaUrl keeps hosts just outside the private ranges", () => {
	// 172.16.0.0/12 is private; .15 and .32 are not.
	assert.equal(isPublicMediaUrl("http://172.15.0.1/a.png"), true);
	assert.equal(isPublicMediaUrl("http://172.32.0.1/a.png"), true);
	assert.equal(isPublicMediaUrl("http://11.0.0.1/a.png"), true);
	assert.equal(isPublicMediaUrl("http://192.169.0.1/a.png"), true);
});

test("assertProfileDataWithinLimits enforces field-count and length limits", () => {
	const tooManyDynamic = {
		dynamic: Array.from(
			{ length: APPLICATION_IDENTITY_LIMITS.MaxDynamicFields + 1 },
			(_, i) => ({ type: 2, name: `stat_${i}`, value: i }) as DynamicProfileField,
		),
	};
	assert.equal(codeOf(() => assertProfileDataWithinLimits(tooManyDynamic)), "too_many_dynamic_fields");

	assert.equal(
		codeOf(() =>
			assertProfileDataWithinLimits({
				primary: { rank_name: "x".repeat(APPLICATION_IDENTITY_LIMITS.MaxStringValueLength + 1) },
			}),
		),
		"string_value_too_long",
	);

	assert.equal(
		codeOf(() =>
			assertProfileDataWithinLimits({
				dynamic: [
					{
						type: 1,
						name: "n".repeat(APPLICATION_IDENTITY_LIMITS.MaxDynamicFieldNameLength + 1),
						value: "ok",
					},
				],
			}),
		),
		"dynamic_field_name_too_long",
	);
});

test("assertProfileDataWithinLimits rejects media URLs the unfurler cannot reach", () => {
	assert.equal(
		codeOf(() =>
			assertProfileDataWithinLimits({ primary: { rank_image: { url: "http://localhost/r.png" } } }),
		),
		"media_url_not_public",
	);

	// the escape hatch is explicit and opt-in
	assert.doesNotThrow(() =>
		assertProfileDataWithinLimits(
			{ primary: { rank_image: { url: "http://localhost/r.png" } } },
			{ allowPrivateMediaUrls: true },
		),
	);
});

test("assertProfileDataWithinLimits enforces the 10KB serialized ceiling", () => {
	const longPublicUrl = `https://cdn.example.com/${"a".repeat(400)}.png`;
	const oversized: ApplicationIdentityProfileData = {
		dynamic: Array.from(
			{ length: APPLICATION_IDENTITY_LIMITS.MaxDynamicFields },
			(_, i) =>
				({ type: 3, name: `media_${i}`, value: { url: longPublicUrl } }) as DynamicProfileField,
		),
	};

	// Sanity check: the payload is long purely because of media URLs, not field counts.
	assert.ok(JSON.stringify(oversized).length > APPLICATION_IDENTITY_LIMITS.MaxSerializedDataBytes);
	assert.equal(codeOf(() => assertProfileDataWithinLimits(oversized)), "payload_too_large");
});

test("assertUsernameLength mirrors Discord's limit", () => {
	assert.doesNotThrow(() => assertUsernameLength("a".repeat(APPLICATION_IDENTITY_LIMITS.MaxUsernameLength)));
	assert.equal(
		codeOf(() => assertUsernameLength("a".repeat(APPLICATION_IDENTITY_LIMITS.MaxUsernameLength + 1))),
		"username_too_long",
	);
});

test("buildProfileData drops empty parts", () => {
	assert.equal(buildProfileData({}), undefined);

	const dynamic: DynamicProfileField[] = [{ type: 2, name: "wins", value: 3 }];
	const data = buildProfileData({ primary: { rank_name: "Silver" }, dynamic });
	assert.deepEqual(data, { primary: { rank_name: "Silver" }, dynamic });

	// the caller's array is copied, not aliased
	assert.notEqual(data?.dynamic, dynamic);
});

test("mergeProfileData keeps untouched stats and overrides matching ones", () => {
	const existing: ApplicationIdentityProfileData = {
		primary: { rank_name: "Silver", total_wins: 57 },
		dynamic: [
			{ type: 2, name: "win_streak", value: 5 },
			{ type: 1, name: "favourite", value: "Ada" },
		],
	};

	const merged = mergeProfileData(existing, {
		primary: { rank_name: "Gold" },
		dynamic: [{ type: 2, name: "win_streak", value: 6 }],
	});

	assert.deepEqual(merged?.primary, { rank_name: "Gold", total_wins: 57 });
	// existing entries keep their position; new ones are appended
	assert.deepEqual(merged?.dynamic, [
		{ type: 2, name: "win_streak", value: 6 },
		{ type: 1, name: "favourite", value: "Ada" },
	]);

	assert.equal(mergeProfileData(undefined, {}), undefined);
});

test("identity REST helpers hit the documented paths", async () => {
	const { rest, calls } = makeRest([
		{ username: "ada" },
		{},
		{ identities: [{ user_id: "u" }] },
	]);

	await rest.updateIdentityProfile("u1", "player/7", { data: { primary: { rank_name: "Silver" } } });
	assert.equal(calls[0].method, "PATCH");
	assert.equal(calls[0].path, "/applications/app-1/users/u1/identities/player%2F7/profile");
	assert.deepEqual(calls[0].body, { data: { primary: { rank_name: "Silver" } } });

	await rest.getIdentityProfile("u1", "player/7");
	assert.equal(calls[1].path, "/applications/app-1/users/u1/identities/player%2F7/profile");
	assert.equal(calls[1].method, undefined);

	assert.deepEqual(await rest.listIdentitiesByUserId("u1"), [{ user_id: "u" }]);
	assert.equal(calls[2].path, "/applications/app-1/users/u1/identities");

	await rest.deleteIdentity("u1", "steam", "7656119", "sub-1");
	assert.equal(calls[3].method, "DELETE");
	assert.equal(calls[3].path, "/applications/app-1/users/u1/identities/steam/7656119");
	assert.deepEqual(calls[3].body, { provider_id: "sub-1" });
});

test("sendGameStats replaces stats by default and validates the payload", async () => {
	const { rest, calls } = makeRest();

	await rest.sendGameStats({
		userId: "u1",
		providerIssuedUserId: "7",
		username: "ada",
		primary: { rank_name: "Silver", playtime_hours: 69.41 },
	});

	assert.equal(calls.length, 1);
	assert.equal(calls[0].method, "PATCH");
	assert.deepEqual(calls[0].body, {
		username: "ada",
		data: { primary: { rank_name: "Silver", playtime_hours: 69.41 } },
	});

	await assert.rejects(
		() =>
			rest.sendGameStats({
				userId: "u1",
				providerIssuedUserId: "7",
				primary: { rank_image: { url: "http://localhost/rank.png" } },
			}),
		/media_url_not_public|Discord cannot fetch/,
	);
});

test("sendGameStats in merge mode reads first so omitted stats survive", async () => {
	const stored: ApplicationIdentityProfile = {
		username: "ada",
		data: {
			primary: { rank_name: "Silver", total_wins: 57 },
			dynamic: [{ type: 2, name: "win_streak", value: 5 }],
		},
	};
	const { rest, calls } = makeRest([stored, {}]);

	await rest.sendGameStats({
		userId: "u1",
		providerIssuedUserId: "7",
		primary: { rank_name: "Gold" },
		mode: "merge",
	});

	assert.equal(calls[0].method, undefined); // GET first
	assert.equal(calls[1].method, "PATCH");
	assert.deepEqual(calls[1].body, {
		data: {
			primary: { rank_name: "Gold", total_wins: 57 },
			dynamic: [{ type: 2, name: "win_streak", value: 5 }],
		},
	});
});

test("REST failures carry a typed status instead of only a message", async () => {
	const { rest } = makeRest([
		new Response('{"message":"Unknown Application Identity"}', { status: 404 }),
	]);

	await assert.rejects(
		() => rest.getIdentityProfile("u1", "7"),
		(error: unknown) => {
			assert.ok(error instanceof DiscordRestApiError);
			assert.equal(error.status, 404);
			assert.equal(error.method, "GET");
			assert.equal(error.path, "/applications/app-1/users/u1/identities/7/profile");
			return true;
		},
	);
});

test("sendGameStats issues no request at all when there is nothing to write", async () => {
	const { rest, calls } = makeRest();

	assert.equal(
		await rest.sendGameStats({ userId: "u1", providerIssuedUserId: "7" }),
		undefined,
	);
	// merge mode must not even spend the GET
	assert.equal(
		await rest.sendGameStats({ userId: "u1", providerIssuedUserId: "7", mode: "merge" }),
		undefined,
	);
	assert.deepEqual(calls, []);
});

test("sendGameStats merge mode tolerates a player with no profile yet", async () => {
	const { rest, calls } = makeRest([
		new Response("{\"message\":\"Unknown Application Identity\"}", { status: 404 }),
		{},
	]);

	await rest.sendGameStats({
		userId: "u1",
		providerIssuedUserId: "7",
		primary: { rank_name: "Bronze" },
		mode: "merge",
	});

	assert.equal(calls[1].method, "PATCH");
	assert.deepEqual(calls[1].body, { data: { primary: { rank_name: "Bronze" } } });
});
