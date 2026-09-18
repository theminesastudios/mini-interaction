import { test } from "node:test";
import assert from "node:assert/strict";

import {
	OAuth2Builder,
	OAuth2BuilderError,
	OAuth2RequestError,
} from "./OAuth2Builder.js";
import {
	OAUTH2_ME_URL,
	OAuth2Scope,
	OAuth2ScopeDescriptions,
	OAuth2ScopeMetadata,
	OAuth2ScopePresets,
	RestrictedOAuth2Scopes,
	describeOAuth2Scopes,
	isOAuth2Scope,
	requiresOAuth2ScopeApproval,
} from "./OAuth2Scopes.js";

type Captured = {
	url: string;
	method?: string;
	form?: Record<string, string>;
	authorization?: string;
	contentType?: string;
};

function makeBuilder(overrides: Partial<{ clientSecret: string }> = {}) {
	const calls: Captured[] = [];
	let responseBody = "{}";
	let responseStatus = 200;

	const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
		const headers = (init?.headers ?? {}) as Record<string, string>;
		calls.push({
			url: String(url),
			method: init?.method,
			form:
				init?.body instanceof URLSearchParams
					? Object.fromEntries(init.body.entries())
					: undefined,
			authorization: headers.Authorization,
			contentType: headers["Content-Type"],
		});
		// 204/205/304 are null-body statuses; Response throws if given a body.
		const nullBody = responseStatus === 204 || responseStatus === 205 || responseStatus === 304;
		return new Response(nullBody ? null : responseBody, { status: responseStatus });
	}) as typeof fetch;

	const builder = new OAuth2Builder({
		clientId: "client-id",
		clientSecret: overrides.clientSecret ?? "client-secret",
		redirectUri: "https://example.com/api/discord-oauth-callback",
		fetch: fetchImpl,
	});

	return {
		builder,
		calls,
		respond(body: unknown, status = 200) {
			responseBody = typeof body === "string" ? body : JSON.stringify(body);
			responseStatus = status;
		},
	};
}

test("the scope registry describes every scope it exposes", () => {
	const scopes = Object.values(OAuth2Scope);

	for (const scope of scopes) {
		assert.equal(typeof OAuth2ScopeDescriptions[scope], "string");
		assert.ok(OAuth2ScopeDescriptions[scope].length > 0);
		assert.ok(OAuth2ScopeMetadata[scope].description.length > 0);
		assert.ok(OAuth2ScopeDescriptions[scope].endsWith("."));
	}

	// The registry must not silently drop scopes: `metadata` and the enum agree.
	assert.equal(Object.keys(OAuth2ScopeMetadata).length, scopes.length);
	assert.equal(new Set(scopes).size, scopes.length, "scope values must be unique");
});

test("presets only contain documented scopes and cover Linked Channels", () => {
	for (const [name, preset] of Object.entries(OAuth2ScopePresets)) {
		for (const scope of preset) {
			assert.ok(isOAuth2Scope(scope), `${name} contains an unknown scope: ${scope}`);
		}
	}

	// Social SDK's GetDefaultCommunicationScopes — required for Linked Channels.
	assert.deepEqual([...OAuth2ScopePresets.SocialCommunication], ["openid", "sdk.social_layer"]);
	assert.deepEqual([...OAuth2ScopePresets.SocialPresence], ["openid", "sdk.social_layer_presence"]);
	// Presence alone unlocks no communication feature, so it cannot link channels.
	const presence = OAuth2ScopePresets.SocialPresence as readonly string[];
	assert.ok(!presence.includes(OAuth2Scope.SdkSocialLayer));
});

test("restricted scopes are flagged, and describeOAuth2Scopes keeps typos visible", () => {
	assert.ok(RestrictedOAuth2Scopes.has(OAuth2Scope.SdkSocialLayer));
	assert.ok(RestrictedOAuth2Scopes.has(OAuth2Scope.RelationshipsRead));
	assert.ok(!RestrictedOAuth2Scopes.has(OAuth2Scope.Identify));
	assert.equal(requiresOAuth2ScopeApproval([OAuth2Scope.Identify]), false);
	assert.equal(requiresOAuth2ScopeApproval([OAuth2Scope.SdkSocialLayer]), true);

	const [known, unknown] = describeOAuth2Scopes([OAuth2Scope.GuildsJoin, "not.a.scope"]);
	assert.equal(known.description, "Add you to a server.");
	assert.equal(known.restricted, false);
	assert.equal(unknown.description, undefined);
	assert.equal(unknown.restricted, false);
});

test("build() produces a complete authorization URL with a random state", () => {
	const { builder } = makeBuilder();
	const first = builder.addScopes(...OAuth2ScopePresets.SignIn).build();
	const second = builder.build();

	const url = new URL(first.url);
	assert.equal(url.origin + url.pathname, "https://discord.com/oauth2/authorize");
	assert.equal(url.searchParams.get("client_id"), "client-id");
	assert.equal(url.searchParams.get("response_type"), "code");
	assert.equal(url.searchParams.get("scope"), "identify email");
	assert.equal(url.searchParams.get("redirect_uri"), "https://example.com/api/discord-oauth-callback");
	assert.equal(url.searchParams.get("prompt"), "consent");

	// The nonce is generated, then pinned so a rebuild cannot invalidate a
	// session mid-flow.
	assert.ok(first.state.length > 0);
	assert.equal(first.state, second.state);
	assert.equal(first.scopes.includes(OAuth2Scope.Email), true);
	assert.equal(first.responseType, "code");
	assert.equal(first.requiresApproval, false);
	assert.deepEqual(first.consent.map((entry) => entry.scope), ["identify", "email"]);
});

test("setState pins the nonce and describeScopes groups the requested scopes", () => {
	const { builder } = makeBuilder();
	builder.setScopes([]);
	builder.addScopes(
		OAuth2Scope.Identify,
		OAuth2Scope.Email,
		OAuth2Scope.Identify, // duplicate is dropped
		OAuth2Scope.SdkSocialLayer,
	);
	builder.setState("fixed-state");

	const { url, state } = builder.build();
	assert.equal(state, "fixed-state");
	assert.equal(new URL(url).searchParams.get("state"), "fixed-state");
	assert.deepEqual(builder.getScopes(), ["identify", "email", "sdk.social_layer"]);

	assert.deepEqual(builder.describeScopes(), [
		{
			category: "identity",
			scopes: [
				{
					scope: "identify",
					description: "Read your basic Discord profile, without your email address.",
					restricted: false,
				},
				{
					scope: "email",
					description: "Read your email address.",
					restricted: false,
				},
			],
		},
		{
			category: "social-sdk",
			scopes: [
				{
					scope: "sdk.social_layer",
					description:
						"Use Discord Social features: account linking, friends, presence, messaging, lobbies and linked channels.",
					restricted: true,
				},
			],
		},
	]);

	builder.removeScopes(OAuth2Scope.Email);
	assert.deepEqual(builder.getScopes(), ["identify", "sdk.social_layer"]);
});

test("refuses contradictory requests before the user ever sees a consent screen", () => {
	const { builder } = makeBuilder();

	assert.throws(
		() => new OAuth2Builder({ clientId: "id", redirectUri: "https://e.com" }).build(),
		(error: unknown) => error instanceof OAuth2BuilderError && error.code === "missing_scope",
	);

	assert.throws(
		() =>
			new OAuth2Builder({ clientId: "id" })
				.addScopes(OAuth2Scope.Identify)
				.build(),
		(error: unknown) => error instanceof OAuth2BuilderError && error.code === "missing_redirect_uri",
	);

	// Documented: role_connections.write is rejected on the implicit grant.
	assert.throws(
		() =>
			builder
				.addScopes(...OAuth2ScopePresets.RoleConnection)
				.setResponseType("token")
				.build(),
		(error: unknown) =>
			error instanceof OAuth2BuilderError && error.code === "implicit_grant_unsupported_scope",
	);
});

test("the bot flow omits response_type and prompt but keeps the invite parameters", () => {
	const { builder } = makeBuilder();
	const { url } = OAuth2Builder.bot({
		clientId: "client-id",
		redirectUri: "https://example.com/cb",
		permissions: 1n << 40n,
		guildId: "1525905982000070780",
		disableGuildSelect: true,
	}).build();

	const params = new URL(url).searchParams;
	assert.equal(params.get("scope"), "bot applications.commands");
	assert.equal(params.get("permissions"), "1099511627776");
	assert.equal(params.get("guild_id"), "1525905982000070780");
	assert.equal(params.get("disable_guild_select"), "true");
	assert.equal(params.get("response_type"), null);
	assert.equal(params.get("prompt"), null);
});

test("integration_type is only sent when set", () => {
	const { builder } = makeBuilder();
	builder.addScopes(...OAuth2ScopePresets.SignIn);

	assert.equal(new URL(builder.build().url).searchParams.get("integration_type"), null);
	builder.setIntegrationType(1);
	assert.equal(new URL(builder.build().url).searchParams.get("integration_type"), "1");
	builder.setIntegrationType(null);
	assert.equal(new URL(builder.build().url).searchParams.get("integration_type"), null);
});

test("exchangeCode posts grant_type, code and redirect_uri with Basic auth", async () => {
	const { builder, calls, respond } = makeBuilder();
	respond({
		access_token: "access",
		token_type: "Bearer",
		expires_in: 604800,
		refresh_token: "refresh",
		scope: "identify email",
	});

	const tokens = await builder.exchangeCode("the-code");

	assert.equal(calls[0].url, "https://discord.com/api/oauth2/token");
	assert.equal(calls[0].method, "POST");
	assert.equal(calls[0].contentType, "application/x-www-form-urlencoded");
	// client_id/secret belong in the header, not the body, when using Basic auth.
	assert.equal(Object.hasOwn(calls[0].form ?? {}, "client_secret"), false);
	assert.deepEqual(calls[0].form, {
		grant_type: "authorization_code",
		code: "the-code",
		redirect_uri: "https://example.com/api/discord-oauth-callback",
	});
	assert.equal(calls[0].authorization, `Basic ${btoa("client-id:client-secret")}`);
	assert.equal(tokens.access_token, "access");
	assert.equal(tokens.refresh_token, "refresh");
	assert.equal(tokens.expires_in, 604800);
});

test("clientCredentialsInBody moves credentials into the form instead of the header", async () => {
	const { builder, calls, respond } = makeBuilder();
	respond({ access_token: "a", token_type: "Bearer", expires_in: 10, scope: "identify" });

	await builder.exchangeCode("code", { clientCredentialsInBody: true });

	assert.equal(calls[0].authorization, undefined);
	assert.equal(calls[0].form?.client_id, "client-id");
	assert.equal(calls[0].form?.client_secret, "client-secret");
});

test("refresh and revoke use the documented grants", async () => {
	const { builder, calls, respond } = makeBuilder();
	respond({ access_token: "a2", token_type: "Bearer", expires_in: 10, scope: "identify" });
	await builder.refresh("refresh-token");
	assert.deepEqual(calls[0].form, {
		grant_type: "refresh_token",
		refresh_token: "refresh-token",
	});

	respond("", 204);
	await builder.revokeToken("access-token", "access_token");
	assert.equal(calls[1].url, "https://discord.com/api/oauth2/token/revoke");
	assert.deepEqual(calls[1].form, { token: "access-token", token_type_hint: "access_token" });
});

test("clientCredentials defaults to the builder's scopes and can be restricted", async () => {
	const { builder, calls, respond } = makeBuilder();
	respond({ access_token: "a", token_type: "Bearer", expires_in: 10, scope: "identify" });
	builder.addScopes(OAuth2Scope.Identify);

	await builder.clientCredentials();
	assert.deepEqual(calls[0].form, { grant_type: "client_credentials", scope: "identify" });

	// Team applications are limited to identify + applications.commands.update.
	builder.setTeamApplication(true);
	await assert.rejects(
		() => builder.clientCredentials([OAuth2Scope.Identify, OAuth2Scope.Guilds]),
		(error: unknown) => error instanceof OAuth2BuilderError && error.code === "team_scopes_restricted",
	);
	await builder.clientCredentials([OAuth2Scope.ApplicationsCommandsUpdate]);
	assert.deepEqual(calls[1].form, {
		grant_type: "client_credentials",
		scope: "applications.commands.update",
	});
});

test("flows needing a secret fail loudly instead of sending an unauthenticated request", async () => {
	const { builder, calls } = makeBuilder({ clientSecret: "" });

	await assert.rejects(
		() => builder.addScopes(OAuth2Scope.Identify).exchangeCode("code"),
		(error: unknown) => error instanceof OAuth2BuilderError && error.code === "missing_client_secret",
	);
	await assert.rejects(
		() => builder.revokeToken("token"),
		(error: unknown) => error instanceof OAuth2BuilderError && error.code === "missing_client_secret",
	);
	assert.equal(calls.length, 0, "no request should be attempted without a secret");

	// The implicit grant is the one flow that legitimately has no secret.
	const implicit = new OAuth2Builder({
		clientId: "client-id",
		redirectUri: "https://example.com/cb",
		fetch: () => {
			throw new Error("should not fetch");
		},
	})
		.addScopes(OAuth2Scope.Identify)
		.setResponseType("token");
	assert.equal(new URL(implicit.build().url).searchParams.get("response_type"), "token");
});

test("getAuthorizationInfo types the granted scopes and forwards the Bearer token", async () => {
	const { builder, calls, respond } = makeBuilder();
	respond({
		application: { id: "app-1", name: "Mini" },
		scopes: ["identify", "sdk.social_layer"],
		expires: "2026-01-01T00:00:00.000000+00:00",
		user: { id: "u1", username: "ayla" },
	});

	const info = await builder.getAuthorizationInfo("access-token");

	assert.equal(calls[0].url, OAUTH2_ME_URL);
	assert.equal(calls[0].authorization, "Bearer access-token");
	assert.deepEqual(info.scopes, ["identify", "sdk.social_layer"]);
	assert.equal(info.user?.username, "ayla");
	assert.deepEqual(await builder.getUser("access-token"), info.user);
});

test("request failures surface Discord's error payload, JSON or not", async () => {
	const { builder, respond } = makeBuilder();
	respond({ error: "invalid_grant", error_description: "Invalid \"code\" in request." }, 400);

	await assert.rejects(
		() => builder.addScopes(OAuth2Scope.Identify).exchangeCode("bad"),
		(error: unknown) => {
			assert.ok(error instanceof OAuth2RequestError);
			assert.equal(error.status, 400);
			assert.equal(error.error, "invalid_grant");
			assert.equal(error.errorDescription, 'Invalid "code" in request.');
			return true;
		},
	);

	respond("<html>502 Bad Gateway</html>", 502);
	await assert.rejects(
		() => builder.refresh("refresh"),
		(error: unknown) => {
			assert.ok(error instanceof OAuth2RequestError);
			assert.equal(error.error, undefined);
			assert.equal(error.body, "<html>502 Bad Gateway</html>");
			return true;
		},
	);
});

test("a bot-invite builder still validates scopes", () => {
	const bot = OAuth2Builder.bot({ clientId: "client-id" });
	assert.deepEqual(bot.getScopes(), ["bot", "applications.commands"]);
	assert.equal(bot.build().requiresApproval, false);
});
