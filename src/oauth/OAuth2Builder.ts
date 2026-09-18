import type { APIApplication, APIGuild, APIUser, APIWebhook } from "discord-api-types/v10";

import {
	OAUTH2_AUTHORIZE_URL,
	OAUTH2_ME_URL,
	OAUTH2_REVOKE_URL,
	OAUTH2_TOKEN_URL,
	OAuth2Scope,
	OAuth2ScopeMetadata,
	OAuth2ScopePresets,
	describeOAuth2Scopes,
	isOAuth2Scope,
	requiresOAuth2ScopeApproval,
} from "./OAuth2Scopes.js";
import type { OAuth2ScopeCategory } from "./OAuth2Scopes.js";

/**
 * A fluent builder for Discord's OAuth2 flows, plus typed clients for the token
 * endpoints.
 *
 * ```ts
 * const oauth = new OAuth2Builder({
 *   clientId: process.env.DISCORD_CLIENT_ID!,
 *   clientSecret: process.env.DISCORD_CLIENT_SECRET!,
 *   redirectUri: "https://example.com/api/discord-oauth-callback",
 * }).addScopes(...OAuth2ScopePresets.SignIn);
 *
 * const { url, state } = oauth.build();          // send the user here
 * const tokens = await oauth.exchangeCode(code); // in the callback
 * ```
 *
 * Everything here is Fetch-API only — no Node built-ins — so the same instance
 * works in a Vercel function, a Cloudflare Worker or a long-lived server.
 *
 * @see {@link https://docs.discord.com/developers/topics/oauth2}
 */
export class OAuth2Builder {
	private readonly clientId: string;
	private readonly clientSecret: string | undefined;
	private readonly fetchImpl: typeof fetch;
	private scopes: string[];
	private redirectUri: string | undefined;
	private state: string | undefined;
	private responseType: OAuth2ResponseType | undefined = "code";
	private prompt: OAuth2Prompt = "consent";
	private permissions: string | undefined;
	private guildId: string | undefined;
	private disableGuildSelect = false;
	private integrationType: OAuth2IntegrationType | undefined;
	private teamApplication = false;

	constructor(options: OAuth2BuilderOptions) {
		if (!options.clientId) throw new TypeError("[OAuth2Builder] clientId is required.");
		this.clientId = options.clientId;
		this.clientSecret = options.clientSecret;
		this.fetchImpl = options.fetch ?? fetch;
		this.redirectUri = options.redirectUri;
		this.scopes = options.scopes ? normalizeScopes(options.scopes) : [];
	}

	/**
	 * Starts from the Social SDK's `GetDefaultCommunicationScopes`, i.e. the set
	 * **Linked Channels** requires: `openid sdk.social_layer`.
	 *
	 * ```ts
	 * OAuth2Builder.communication({ clientId, clientSecret, redirectUri })
	 * ```
	 */
	static communication(options: OAuth2BuilderOptions): OAuth2Builder {
		return new OAuth2Builder({
			...options,
			scopes: [...OAuth2ScopePresets.SocialCommunication],
		});
	}

	/**
	 * Starts from the Social SDK's `GetDefaultPresenceScopes`
	 * (`openid sdk.social_layer_presence`) — account linking, friends and rich
	 * presence, but no messaging or Linked Channels.
	 */
	static presence(options: OAuth2BuilderOptions): OAuth2Builder {
		return new OAuth2Builder({ ...options, scopes: [...OAuth2ScopePresets.SocialPresence] });
	}

	/**
	 * Starts from the plain user-install sign-in set (`identify email`), the
	 * usual starting point for a dashboard that reads `/users/@me`.
	 */
	static signIn(options: OAuth2BuilderOptions): OAuth2Builder {
		return new OAuth2Builder({ ...options, scopes: [...OAuth2ScopePresets.SignIn] });
	}

	/**
	 * A bot-invite URL: no `response_type`, no `redirect_uri` — Discord adds the
	 * bot to the selected server and redirects nowhere.
	 *
	 * Pass `permissions` for the bot's permission integer and `guildId` to
	 * preselect a server, optionally locking the picker with
	 * `disableGuildSelect`.
	 */
	static bot(
		options: OAuth2BuilderOptions & {
			permissions?: string | number | bigint;
			guildId?: string;
			disableGuildSelect?: boolean;
			integrationType?: OAuth2IntegrationType;
		},
	): OAuth2Builder {
		const builder = new OAuth2Builder({
			...options,
			scopes: [OAuth2Scope.Bot, OAuth2Scope.ApplicationsCommands],
		}).setResponseType(undefined);
		if (options.permissions !== undefined) builder.setPermissions(options.permissions);
		if (options.guildId) builder.setGuildId(options.guildId);
		if (options.disableGuildSelect) builder.setDisableGuildSelect(true);
		if (options.integrationType !== undefined) {
			builder.setIntegrationType(options.integrationType);
		}
		return builder;
	}

	/** Replaces the requested scopes. Duplicates and blanks are dropped; order is preserved. */
	setScopes(scopes: Iterable<string>): this {
		this.scopes = normalizeScopes(scopes);
		return this;
	}

	/** Appends scopes, ignoring ones already requested. */
	addScopes(...scopes: (OAuth2Scope | string)[]): this {
		return this.setScopes([...this.scopes, ...scopes]);
	}

	/** Removes scopes; names that are not currently requested are ignored. */
	removeScopes(...scopes: string[]): this {
		const drop = new Set(scopes);
		return this.setScopes(this.scopes.filter((scope) => !drop.has(scope)));
	}

	/** The scopes requested so far, in request order. */
	getScopes(): string[] {
		return [...this.scopes];
	}

	/** Where Discord sends the user after they approve. */
	setRedirectUri(redirectUri: string | null | undefined): this {
		this.redirectUri = redirectUri ?? undefined;
		return this;
	}

	/**
	 * Pins the CSRF `state`. Discord returns it untouched on the redirect and you
	 * **must** compare it against the value bound to the user's session.
	 *
	 * When unset, {@link build} generates a cryptographically random one.
	 */
	setState(state: string | null | undefined): this {
		this.state = state ?? undefined;
		return this;
	}

	/**
	 * `code` (authorization code grant, the default) or `token` (implicit grant,
	 * for browser-only clients that cannot keep a secret).
	 *
	 * Pass `undefined` for the bot flow, which has no response type at all.
	 */
	setResponseType(responseType: OAuth2ResponseType | undefined): this {
		this.responseType = responseType;
		return this;
	}

	/**
	 * `consent` forces the approval screen even for an existing authorization;
	 * `none` skips it. Passthrough scopes (`bot`, `webhook.incoming`) always ask.
	 */
	setPrompt(prompt: OAuth2Prompt): this {
		this.prompt = prompt;
		return this;
	}

	/** Bot permissions as an integer; bigints are serialised exactly. */
	setPermissions(permissions: string | number | bigint): this {
		this.permissions =
			typeof permissions === "bigint" ? permissions.toString() : String(permissions);
		return this;
	}

	/** Preselects a server in the bot-invite picker. */
	setGuildId(guildId: string | null | undefined): this {
		this.guildId = guildId ?? undefined;
		return this;
	}

	/** Locks the bot-invite picker to {@link setGuildId}'s server. */
	setDisableGuildSelect(disableGuildSelect = true): this {
		this.disableGuildSelect = disableGuildSelect;
		return this;
	}

	/**
	 * Where the app installs: `0` for a server, `1` for the user's account.
	 *
	 * Only meaningful when the scopes include `applications.commands`, and the app
	 * must be configured in the Developer Portal to support the context.
	 */
	setIntegrationType(integrationType: OAuth2IntegrationType | null | undefined): this {
		this.integrationType = integrationType ?? undefined;
		return this;
	}

	/**
	 * Marks the application as team-owned, which restricts the client credentials
	 * grant to `identify` and `applications.commands.update`.
	 */
	setTeamApplication(teamApplication = true): this {
		this.teamApplication = teamApplication;
		return this;
	}

	/**
	 * Builds the authorization URL. Generates a `state` when none was set, and
	 * validates the scope/grant combination first — see {@link OAuth2BuilderError}.
	 */
	build(): OAuth2AuthorizationUrl {
		this.validate();

		const url = new URL(OAUTH2_AUTHORIZE_URL);
		url.searchParams.set("client_id", this.clientId);
		if (this.responseType) {
			url.searchParams.set("response_type", this.responseType);
			url.searchParams.set("prompt", this.prompt);
		}
		url.searchParams.set("scope", this.scopes.join(" "));
		if (this.redirectUri) url.searchParams.set("redirect_uri", this.redirectUri);
		if (this.permissions) url.searchParams.set("permissions", this.permissions);
		if (this.guildId) url.searchParams.set("guild_id", this.guildId);
		if (this.disableGuildSelect) url.searchParams.set("disable_guild_select", "true");
		if (this.integrationType !== undefined) {
			url.searchParams.set("integration_type", String(this.integrationType));
		}

		const state = this.state ?? randomState();
		this.state = state;
		url.searchParams.set("state", state);

		return {
			url: url.toString(),
			state,
			scopes: [...this.scopes],
			responseType: this.responseType,
			/** Scopes that need Discord's approval before this flow will work. */
			requiresApproval: requiresOAuth2ScopeApproval(this.scopes),
			/** Ready-to-render consent copy for the requested scopes. */
			consent: describeOAuth2Scopes(this.scopes),
		};
	}

	/** The authorization URL from {@link build}, for callers that ignore the rest. */
	toURL(): string {
		return this.build().url;
	}

	/**
	 * The requested scopes grouped for a consent screen, with the copy from
	 * `OAuth2ScopeMetadata`.
	 *
	 * ```ts
	 * oauth.describeScopes();
	 * // [{ category: "identity", scopes: [{ scope: "identify", description: "…" }] }]
	 * ```
	 */
	describeScopes(): OAuth2ConsentGroup[] {
		const grouped = new Map<OAuth2ScopeCategory, OAuth2ConsentEntry[]>();
		for (const entry of describeOAuth2Scopes(this.scopes)) {
			const category: OAuth2ScopeCategory = isOAuth2Scope(entry.scope)
				? OAuth2ScopeMetadata[entry.scope].category
				: "identity";
			const bucket = grouped.get(category) ?? [];
			bucket.push(entry);
			grouped.set(category, bucket);
		}
		return Array.from(grouped, ([category, scopes]) => ({ category, scopes }));
	}

	/**
	 * Exchanges the `code` from the redirect for tokens — the authorization code
	 * grant. Needs `clientSecret` and the same `redirect_uri` used in the
	 * authorization request.
	 *
	 * On a `webhook.incoming` flow the response also carries `webhook`; store its
	 * `id` and `token` immediately, they are the only copy you get.
	 */
	async exchangeCode(
		code: string,
		options: OAuth2RequestOptions = {},
	): Promise<OAuth2TokenResponse> {
		const body = new URLSearchParams({ grant_type: "authorization_code", code });
		if (this.redirectUri) body.set("redirect_uri", this.redirectUri);
		return this.tokenRequest(body, options);
	}

	/**
	 * Exchanges a refresh token for a fresh access token. Discord may rotate the
	 * refresh token, so always persist the one in the response.
	 */
	async refresh(
		refreshToken: string,
		options: OAuth2RequestOptions = {},
	): Promise<OAuth2TokenResponse> {
		return this.tokenRequest(
			new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
			options,
		);
	}

	/**
	 * Requests an application-level Bearer token with no user context, for testing
	 * or for the `applications.commands.update` route.
	 *
	 * Team-owned applications may only ask for `identify` and
	 * `applications.commands.update`; mark the client with
	 * {@link setTeamApplication} to have that enforced locally instead of by a
	 * confusing API error.
	 */
	async clientCredentials(
		scopes: Iterable<string> = this.scopes,
		options: OAuth2RequestOptions = {},
	): Promise<OAuth2TokenResponse> {
		const requested = normalizeScopes(scopes);
		if (this.teamApplication) {
			const allowed = new Set<string>([
				OAuth2Scope.Identify,
				OAuth2Scope.ApplicationsCommandsUpdate,
			]);
			const unexpected = requested.filter((scope) => !allowed.has(scope));
			if (unexpected.length > 0) {
				throw new OAuth2BuilderError(
					`Team applications may only request ${[...allowed].join(", ")} with the client credentials grant; got ${unexpected.join(", ")}.`,
					"team_scopes_restricted",
				);
			}
		}
		return this.tokenRequest(
			new URLSearchParams({ grant_type: "client_credentials", scope: requested.join(" ") }),
			options,
		);
	}

	/**
	 * Revokes an access **or** refresh token.
	 *
	 * Revocation is authorization-wide: every token issued from the same
	 * authorization dies, whichever token you pass and whatever hint you give.
	 * For a Social SDK game this is what triggers `APPLICATION_DEAUTHORIZED`.
	 */
	async revokeToken(
		token: string,
		tokenTypeHint?: OAuth2TokenType,
		options: OAuth2RequestOptions = {},
	): Promise<void> {
		await this.requireClientSecret();
		const body = new URLSearchParams({ token });
		if (tokenTypeHint) body.set("token_type_hint", tokenTypeHint);
		await this.formRequest(OAUTH2_REVOKE_URL, body, options);
	}

	/**
	 * Reads what the current Bearer token is actually allowed to do
	 * (`GET /oauth2/@me`) — the only reliable way to learn the granted scopes,
	 * since users may decline individual ones.
	 */
	async getAuthorizationInfo(accessToken: string): Promise<OAuth2AuthorizationInfo> {
		const response = await this.request(OAUTH2_ME_URL, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		const body = (await response.json()) as OAuth2AuthorizationInfo;
		return { ...body, scopes: (body.scopes ?? []).map((scope) => scope as OAuth2Scope) };
	}

	/** Resolves the current user from a Bearer token. Requires the `identify` scope. */
	async getUser(accessToken: string): Promise<APIUser | undefined> {
		return (await this.getAuthorizationInfo(accessToken)).user;
	}

	private validate(): void {
		if (this.scopes.length === 0) {
			throw new OAuth2BuilderError("At least one scope is required.", "missing_scope");
		}
		if (this.responseType && !this.redirectUri) {
			throw new OAuth2BuilderError(
				`The ${this.responseType === "code" ? "authorization code" : "implicit"} grant requires a redirectUri.`,
				"missing_redirect_uri",
			);
		}
		if (this.responseType === "token" && this.scopes.includes(OAuth2Scope.RoleConnectionsWrite)) {
			// Documented restriction: Discord rejects role_connections.write on implicit.
			throw new OAuth2BuilderError(
				"role_connections.write cannot be used with the implicit grant; use the authorization code grant.",
				"implicit_grant_unsupported_scope",
			);
		}
	}

	private async requireClientSecret(): Promise<string> {
		if (!this.clientSecret) {
			throw new OAuth2BuilderError(
				"This flow needs clientSecret for HTTP Basic authentication.",
				"missing_client_secret",
			);
		}
		return this.clientSecret;
	}

	private async tokenRequest(
		body: URLSearchParams,
		options: OAuth2RequestOptions,
	): Promise<OAuth2TokenResponse> {
		if (!options.clientCredentialsInBody) await this.requireClientSecret();
		const response = await this.formRequest(OAUTH2_TOKEN_URL, body, options);
		return (await response.json()) as OAuth2TokenResponse;
	}

	private async formRequest(
		url: string,
		body: URLSearchParams,
		options: OAuth2RequestOptions,
	): Promise<Response> {
		if (options.clientCredentialsInBody) {
			body.set("client_id", this.clientId);
			if (this.clientSecret) body.set("client_secret", this.clientSecret);
		}
		return this.request(url, {
			method: "POST",
			body,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				...this.basicAuthHeader(options.clientCredentialsInBody),
			},
		});
	}

	private basicAuthHeader(credentialsInBody: boolean | undefined): Record<string, string> {
		if (credentialsInBody || !this.clientSecret) return {};
		return { Authorization: `Basic ${base64(`${this.clientId}:${this.clientSecret}`)}` };
	}

	private async request(url: string, init: RequestInit): Promise<Response> {
		const response = await this.fetchImpl(url, init);
		if (!response.ok) {
			const text = await response.text();
			throw new OAuth2RequestError(response.status, text, url);
		}
		return response;
	}
}

/** Options accepted by every {@link OAuth2Builder} constructor shorthand. */
export type OAuth2BuilderOptions = {
	/** Application client ID. */
	clientId: string;
	/**
	 * Application client secret. Required for the code, refresh and client
	 * credentials grants, and for revocation; omit only for the implicit grant.
	 */
	clientSecret?: string;
	/** Must match a redirect registered in the Developer Portal, character for character. */
	redirectUri?: string;
	/** Scopes to start with. */
	scopes?: Iterable<string>;
	/** Custom fetch, for tests or a proxied runtime. */
	fetch?: typeof fetch;
};

/** Per-call overrides, mostly for tests. */
export type OAuth2RequestOptions = {
	/**
	 * Send `client_id`/`client_secret` in the form body instead of using HTTP
	 * Basic authentication. Discord accepts either.
	 */
	clientCredentialsInBody?: boolean;
};

/** The response type requesting a code, or a token straight from the browser. */
export type OAuth2ResponseType = "code" | "token";
/** Whether the approval screen is shown again. */
export type OAuth2Prompt = "consent" | "none";
/** `0` installs to a server, `1` to the user's account. */
export type OAuth2IntegrationType = 0 | 1;
/** Which kind of token a revocation request is about. */
export type OAuth2TokenType = "access_token" | "refresh_token";

/** One requested scope, ready to render. */
export type OAuth2ConsentEntry = {
	scope: string;
	/** `undefined` when the scope is not one Discord documents. */
	description: string | undefined;
	/** Whether Discord must approve the app for this scope first. */
	restricted: boolean;
};

/** Requested scopes for one consent-screen section. */
export type OAuth2ConsentGroup = {
	category: OAuth2ScopeCategory;
	scopes: OAuth2ConsentEntry[];
};

/** The pieces of an authorization request, ready to hand to the user. */
export type OAuth2AuthorizationUrl = {
	/** The full authorization URL. */
	url: string;
	/** The CSRF nonce, echoed back on the redirect — verify it before using the code. */
	state: string;
	/** Scopes requested, in order. */
	scopes: string[];
	/** `code`, `token`, or `undefined` for the bot flow. */
	responseType: OAuth2ResponseType | undefined;
	/** `true` when at least one scope needs Discord's approval first. */
	requiresApproval: boolean;
	/** Consent-screen copy for each requested scope. */
	consent: OAuth2ConsentEntry[];
};

/**
 * A token response. `refresh_token` is absent on the client credentials grant,
 * and `webhook`/`guild` only appear on the `webhook.incoming` and extended bot
 * flows respectively.
 */
export type OAuth2TokenResponse = {
	access_token: string;
	token_type: string;
	expires_in: number;
	scope: string;
	/** Absent for client credentials, which never issue a refresh token. */
	refresh_token?: string;
	/** Present on the `webhook.incoming` flow; store `id` and `token` immediately. */
	webhook?: APIWebhook;
	/** Present on an extended bot authorization: the server the bot was added to. */
	guild?: OAuth2AuthorizedGuild;
};

/** The server a bot was added to, echoed on an extended bot authorization. */
export type OAuth2AuthorizedGuild = Pick<APIGuild, "id" | "name"> & Partial<APIGuild>;

/** `GET /oauth2/@me` — what the current Bearer token may actually do. */
export type OAuth2AuthorizationInfo = {
	application: APIApplication;
	scopes: OAuth2Scope[];
	/** ISO8601 timestamp of when the access token expires. */
	expires: string;
	/** Only present when the `identify` scope was granted. */
	user?: APIUser;
};

/** Machine-readable reasons the builder refuses to produce a URL. */
export type OAuth2BuilderErrorCode =
	| "missing_scope"
	| "missing_redirect_uri"
	| "implicit_grant_unsupported_scope"
	| "missing_client_secret"
	| "team_scopes_restricted"
	| "missing_crypto";

/**
 * Thrown when an authorization request is contradictory — a combination Discord
 * would reject, caught before the user ever sees a broken consent screen.
 */
export class OAuth2BuilderError extends Error {
	constructor(
		message: string,
		readonly code: OAuth2BuilderErrorCode,
	) {
		super(`[OAuth2Builder] ${message}`);
		this.name = "OAuth2BuilderError";
	}
}

/**
 * Thrown when Discord rejects a token or revocation request. The request bodies
 * are form-encoded but the error payload is JSON, so `error` and
 * `errorDescription` are parsed out of `body` when possible.
 */
export class OAuth2RequestError extends Error {
	/** Discord's `error` code, e.g. `invalid_grant` or `invalid_client`. */
	readonly error: string | undefined;
	/** Discord's human-readable `error_description`, when present. */
	readonly errorDescription: string | undefined;

	constructor(
		readonly status: number,
		readonly body: string,
		readonly url: string,
	) {
		let parsed: { error?: string; error_description?: string } = {};
		try {
			parsed = JSON.parse(body);
		} catch {
			// A non-JSON body (an HTML error page, a proxy) is kept verbatim in `body`.
		}
		super(
			`[OAuth2Builder] POST ${url} failed: ${status}${parsed.error ? ` ${parsed.error}` : ""}${
				parsed.error_description ? ` (${parsed.error_description})` : ""
			}`,
		);
		this.name = "OAuth2RequestError";
		this.error = parsed.error;
		this.errorDescription = parsed.error_description;
	}
}

function normalizeScopes(scopes: Iterable<string>): string[] {
	return Array.from(new Set(Array.from(scopes, (scope) => String(scope).trim()).filter(Boolean)));
}

function randomState(): string {
	const cryptoApi = globalThis.crypto;
	if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
	if (cryptoApi?.getRandomValues) {
		const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
		return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	throw new OAuth2BuilderError(
		"No Web Crypto implementation available to generate a state nonce; pass one with setState().",
		"missing_crypto",
	);
}

/** UTF-8 safe base64, without depending on Node's Buffer. */
function base64(input: string): string {
	const bytes = new TextEncoder().encode(input);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}
