/**
 * Every OAuth2 scope Discord supports, with human-readable descriptions for
 * rendering a consent screen.
 *
 * @see {@link https://docs.discord.com/developers/topics/oauth2#shared-resources-oauth2-scopes}
 * @see {@link https://docs.discord.com/developers/discord-social-sdk/core-concepts/oauth2-scopes}
 *
 * Scopes are added only when you need them: requesting capabilities a feature
 * does not use measurably increases the number of users who abandon the link
 * flow.
 */

/**
 * The scope registry. Use the values (not the keys) when building an
 * authorization URL, and pass them to `OAuth2Builder.addScopes`.
 *
 * ```ts
 * new OAuth2Builder({ clientId })
 *   .addScopes(OAuth2Scope.Identify, OAuth2Scope.Email)
 *   .toURL();
 * ```
 */
export const OAuth2Scope = {
	/**
	 * `identify` — read the user's basic profile through `/users/@me` (id,
	 * username, avatar, flags) **without** email.
	 *
	 * The safest baseline: every user-facing flow should request at least this.
	 */
	Identify: "identify",
	/**
	 * `identify.premium` — read the user's Nitro subscription type (`premium_type`
	 * on the user object).
	 *
	 * Only available to approved partners.
	 */
	IdentifyPremium: "identify.premium",
	/** `email` — makes `/users/@me` return the user's verified email address. */
	Email: "email",
	/** `connections` — read the user's linked third-party accounts via `/users/@me/connections`. */
	Connections: "connections",
	/** `guilds` — list the user's servers (`/users/@me/guilds`), names and icons included. */
	Guilds: "guilds",
	/**
	 * `guilds.join` — add the user to a server with
	 * `PUT /guilds/{guild.id}/members/{user.id}`.
	 *
	 * Your bot must already be in that server.
	 */
	GuildsJoin: "guilds.join",
	/** `guilds.members.read` — read the user's own member record in a guild (nickname, roles, join date). */
	GuildsMembersRead: "guilds.members.read",
	/** `applications.builds.read` — read build data for the user's applications. */
	ApplicationsBuildsRead: "applications.builds.read",
	/**
	 * `applications.builds.upload` — upload or update builds for the user's
	 * applications. Only available to approved partners.
	 */
	ApplicationsBuildsUpload: "applications.builds.upload",
	/**
	 * `applications.commands` — add application commands to a guild.
	 *
	 * Included automatically when the `bot` scope is requested; list it
	 * explicitly only for a command-only install with no bot user.
	 */
	ApplicationsCommands: "applications.commands",
	/**
	 * `applications.commands.update` — let the app update its own commands with a
	 * Bearer token.
	 *
	 * Client-credentials grant only. Also one of the two scopes a **team-owned**
	 * application may request without a user context.
	 */
	ApplicationsCommandsUpdate: "applications.commands.update",
	/**
	 * `applications.commands.permissions.update` — update command permissions in
	 * a guild the user is allowed to manage.
	 */
	ApplicationsCommandsPermissionsUpdate: "applications.commands.permissions.update",
	/** `applications.entitlements` — read the user's entitlements (SKU grants, purchases). */
	ApplicationsEntitlements: "applications.entitlements",
	/** `applications.store.update` — read and update store data (SKUs, listings, achievements) for the user's applications. */
	ApplicationsStoreUpdate: "applications.store.update",
	/**
	 * `bot` — the bot-authorization flow: puts the bot in the user's selected
	 * server by default and implicitly grants `applications.commands`.
	 *
	 * A passthrough scope, so authorization is always re-confirmed even when
	 * `prompt=none`.
	 */
	Bot: "bot",
	/**
	 * `webhook.incoming` — creates a webhook in a channel the user picks, returned
	 * in the token response.
	 *
	 * A passthrough scope, so authorization is always re-confirmed even when
	 * `prompt=none`. Still needs a `redirect_uri` to receive the code back.
	 */
	WebhookIncoming: "webhook.incoming",
	/** `messages.read` — read messages from all client channels through the local RPC server. */
	MessagesRead: "messages.read",
	/**
	 * `dm_channels.read` — see the user's DMs and group DMs.
	 *
	 * Only available to approved partners.
	 */
	DmChannelsRead: "dm_channels.read",
	/** `gdm.join` — add the user to a group DM. */
	GdmJoin: "gdm.join",
	/**
	 * `relationships.read` — read the user's friends list, pending requests and
	 * blocks.
	 *
	 * Part of the Social SDK; requires an access request, and the Social SDK
	 * terms apply to the data you receive. Pair it with
	 * {@link OAuth2Scope.SdkSocialLayerPresence} for a friends list.
	 */
	RelationshipsRead: "relationships.read",
	/**
	 * `rpc` — control the user's local Discord client over the RPC server.
	 *
	 * Only available to approved partners.
	 */
	Rpc: "rpc",
	/** `rpc.activities.write` — update the user's activity over RPC. Approved partners only. */
	RpcActivitiesWrite: "rpc.activities.write",
	/** `rpc.notifications.read` — receive the user's pushed notifications over RPC. Approved partners only. */
	RpcNotificationsRead: "rpc.notifications.read",
	/** `rpc.voice.read` — read voice settings and listen to voice events over RPC. Approved partners only. */
	RpcVoiceRead: "rpc.voice.read",
	/** `rpc.voice.write` — update voice settings over RPC. Approved partners only. */
	RpcVoiceWrite: "rpc.voice.write",
	/**
	 * `voice` — connect to voice on the user's behalf and see every voice member.
	 *
	 * Only available to approved partners.
	 */
	Voice: "voice",
	/**
	 * `activities.read` — read the user's "Now Playing / Recently Played" list.
	 *
	 * Not currently available to applications.
	 */
	ActivitiesRead: "activities.read",
	/**
	 * `activities.write` — update the user's activity.
	 *
	 * Not currently available to applications, and **not** required for the Game
	 * SDK activity manager.
	 */
	ActivitiesWrite: "activities.write",
	/**
	 * `openid` — the OpenID Connect identifier claim.
	 *
	 * Always part of the Social SDK's default scope sets; request it alongside
	 * {@link OAuth2Scope.SdkSocialLayer} or
	 * {@link OAuth2Scope.SdkSocialLayerPresence} rather than on its own.
	 */
	OpenId: "openid",
	/**
	 * `sdk.social_layer` — full Discord Social SDK access: account linking,
	 * provisional accounts, relationships, presence **and** the limited-access
	 * communication features (messaging, lobbies and in-game chat, and
	 * **[Linked Channels]**).
	 *
	 * Implies {@link OAuth2Scope.SdkSocialLayerPresence}. Subject to limited
	 * access; see {@link RestrictedOAuth2Scopes}.
	 *
	 * [Linked Channels]: https://docs.discord.com/developers/discord-social-sdk/development-guides/linked-channels
	 */
	SdkSocialLayer: "sdk.social_layer",
	/**
	 * `sdk.social_layer_presence` — the Social SDK's default presence set:
	 * account linking, provisional accounts, the friend system and rich presence.
	 *
	 * Does **not** unlock any communication or Linked Channel feature.
	 */
	SdkSocialLayerPresence: "sdk.social_layer_presence",
	/**
	 * `role_connections.write` — update a user's connection and metadata for your
	 * app, i.e. the platform that renders a linked role on their profile.
	 *
	 * **Only usable with the authorization code grant** — Discord rejects it on
	 * the implicit grant.
	 */
	RoleConnectionsWrite: "role_connections.write",
} as const;

/** Any Discord OAuth2 scope name. */
export type OAuth2Scope = (typeof OAuth2Scope)[keyof typeof OAuth2Scope];

/** Grouping used to lay out a consent screen; not a Discord concept. */
export type OAuth2ScopeCategory =
	| "identity"
	| "applications"
	| "bot"
	| "messaging"
	| "rpc"
	| "social-sdk"
	| "verification";

export type OAuth2ScopeMetadata = {
	/** One-sentence explanation of what the scope lets the app do. */
	description: string;
	/** Suggested consent-screen grouping. */
	category: OAuth2ScopeCategory;
	/**
	 * Requires explicit approval from Discord (or a Social SDK access request)
	 * before the flow works. Requesting these without approval causes errors or
	 * undocumented behaviour.
	 */
	restricted?: boolean;
};

/**
 * Runtime metadata for every scope: the same descriptions as the JSDoc above,
 * so a UI can render a real consent screen without duplicating the copy.
 */
export const OAuth2ScopeMetadata: Record<OAuth2Scope, OAuth2ScopeMetadata> = {
	[OAuth2Scope.Identify]: {
		description: "Read your basic Discord profile, without your email address.",
		category: "identity",
	},
	[OAuth2Scope.IdentifyPremium]: {
		description: "Read your Discord Nitro subscription type.",
		category: "identity",
		restricted: true,
	},
	[OAuth2Scope.Email]: {
		description: "Read your email address.",
		category: "identity",
	},
	[OAuth2Scope.Connections]: {
		description: "See your linked third-party accounts.",
		category: "identity",
	},
	[OAuth2Scope.Guilds]: {
		description: "See the servers you are in.",
		category: "identity",
	},
	[OAuth2Scope.GuildsJoin]: {
		description: "Add you to a server.",
		category: "identity",
	},
	[OAuth2Scope.GuildsMembersRead]: {
		description: "See your member profile in a server, including your roles.",
		category: "identity",
	},
	[OAuth2Scope.ApplicationsBuildsRead]: {
		description: "Read build data for your applications.",
		category: "applications",
	},
	[OAuth2Scope.ApplicationsBuildsUpload]: {
		description: "Upload and update builds for your applications.",
		category: "applications",
		restricted: true,
	},
	[OAuth2Scope.ApplicationsCommands]: {
		description: "Add this app's commands to a server.",
		category: "applications",
	},
	[OAuth2Scope.ApplicationsCommandsUpdate]: {
		description: "Update this app's commands using a Bearer token.",
		category: "applications",
	},
	[OAuth2Scope.ApplicationsCommandsPermissionsUpdate]: {
		description: "Update command permissions in servers you manage.",
		category: "applications",
	},
	[OAuth2Scope.ApplicationsEntitlements]: {
		description: "Read your entitlements for this app.",
		category: "applications",
	},
	[OAuth2Scope.ApplicationsStoreUpdate]: {
		description: "Read and update store data for your applications.",
		category: "applications",
	},
	[OAuth2Scope.Bot]: {
		description: "Add this app's bot to a server.",
		category: "bot",
	},
	[OAuth2Scope.WebhookIncoming]: {
		description: "Create a webhook in a channel you choose.",
		category: "bot",
	},
	[OAuth2Scope.MessagesRead]: {
		description: "Read messages from all your client channels.",
		category: "messaging",
	},
	[OAuth2Scope.DmChannelsRead]: {
		description: "See information about your direct messages and group DMs.",
		category: "messaging",
		restricted: true,
	},
	[OAuth2Scope.GdmJoin]: {
		description: "Add you to a group direct message.",
		category: "messaging",
	},
	[OAuth2Scope.RelationshipsRead]: {
		description: "See your friends, pending requests and blocked users.",
		category: "social-sdk",
		restricted: true,
	},
	[OAuth2Scope.Rpc]: {
		description: "Control your local Discord client.",
		category: "rpc",
		restricted: true,
	},
	[OAuth2Scope.RpcActivitiesWrite]: {
		description: "Update your activity on the local Discord client.",
		category: "rpc",
		restricted: true,
	},
	[OAuth2Scope.RpcNotificationsRead]: {
		description: "Receive your notifications from the local Discord client.",
		category: "rpc",
		restricted: true,
	},
	[OAuth2Scope.RpcVoiceRead]: {
		description: "Read your voice settings and listen for voice events.",
		category: "rpc",
		restricted: true,
	},
	[OAuth2Scope.RpcVoiceWrite]: {
		description: "Update your voice settings.",
		category: "rpc",
		restricted: true,
	},
	[OAuth2Scope.Voice]: {
		description: "Connect to voice on your behalf and see all voice members.",
		category: "rpc",
		restricted: true,
	},
	[OAuth2Scope.ActivitiesRead]: {
		description: "Read your Now Playing / Recently Played list.",
		category: "rpc",
		restricted: true,
	},
	[OAuth2Scope.ActivitiesWrite]: {
		description: "Update your activity.",
		category: "rpc",
		restricted: true,
	},
	[OAuth2Scope.OpenId]: {
		description: "Confirm your Discord identity to the app.",
		category: "social-sdk",
	},
	[OAuth2Scope.SdkSocialLayer]: {
		description:
			"Use Discord Social features: account linking, friends, presence, messaging, lobbies and linked channels.",
		category: "social-sdk",
		restricted: true,
	},
	[OAuth2Scope.SdkSocialLayerPresence]: {
		description:
			"Use Discord Social presence features: account linking, friends and rich presence.",
		category: "social-sdk",
		restricted: true,
	},
	[OAuth2Scope.RoleConnectionsWrite]: {
		description: "Update your connection and metadata for this app on your profile.",
		category: "verification",
	},
};

/**
 * Scope name to description, for a consent screen that only needs the copy:
 *
 * ```ts
 * OAuth2ScopeDescriptions[OAuth2Scope.GuildsJoin];
 * // "Add you to a server."
 * ```
 *
 * Prefer {@link OAuth2ScopeMetadata} when you also want the category or the
 * restricted flag.
 */
export const OAuth2ScopeDescriptions: Record<OAuth2Scope, string> = Object.fromEntries(
	Object.entries(OAuth2ScopeMetadata).map(([scope, metadata]) => [
		scope,
		metadata.description,
	]),
) as Record<OAuth2Scope, string>;

/**
 * Scopes Discord only grants after an approval request (or, for the Social SDK,
 * an access request). Requesting them without approval can fail the flow or
 * behave unpredictably.
 */
export const RestrictedOAuth2Scopes: ReadonlySet<OAuth2Scope> = new Set(
	(Object.entries(OAuth2ScopeMetadata) as [OAuth2Scope, OAuth2ScopeMetadata][])
		.filter(([, metadata]) => metadata.restricted)
		.map(([scope]) => scope),
);

/** Scopes grouped by category, in a stable order, for rendering a consent screen. */
export const OAuth2ScopeCategories: Record<OAuth2ScopeCategory, OAuth2Scope[]> = {
	identity: [],
	applications: [],
	bot: [],
	messaging: [],
	rpc: [],
	"social-sdk": [],
	verification: [],
};

for (const scope of Object.values(OAuth2Scope)) {
	OAuth2ScopeCategories[OAuth2ScopeMetadata[scope].category].push(scope);
}

/**
 * Ready-made scope sets for the common flows.
 *
 * `Communication` is the one Linked Channels needs — see
 * {@link https://docs.discord.com/developers/discord-social-sdk/core-concepts/oauth2-scopes}
 */
export const OAuth2ScopePresets = {
	/** `identify` only: the smallest request that still identifies the user. */
	Minimal: [OAuth2Scope.Identify],
	/** `identify email`: the usual "sign in with Discord". */
	SignIn: [OAuth2Scope.Identify, OAuth2Scope.Email],
	/** `identify guilds`: sign-in plus the user's server list. */
	SignInWithGuilds: [OAuth2Scope.Identify, OAuth2Scope.Email, OAuth2Scope.Guilds],
	/**
	 * The Social SDK's default `Client::GetDefaultPresenceScopes` — account
	 * linking, provisional accounts, friends and rich presence. No messaging.
	 */
	SocialPresence: [OAuth2Scope.OpenId, OAuth2Scope.SdkSocialLayerPresence],
	/**
	 * The Social SDK's `Client::GetDefaultCommunicationScopes` — required for
	 * lobbies, in-game chat and **Linked Channels**.
	 */
	SocialCommunication: [OAuth2Scope.OpenId, OAuth2Scope.SdkSocialLayer],
	/** Add the bot, with its commands. */
	Bot: [OAuth2Scope.Bot, OAuth2Scope.ApplicationsCommands],
	/** Create an incoming webhook in a channel the user picks. */
	Webhook: [OAuth2Scope.WebhookIncoming],
	/** Linked roles: read the profile and write the connection metadata. */
	RoleConnection: [OAuth2Scope.Identify, OAuth2Scope.RoleConnectionsWrite],
} as const satisfies Record<string, readonly OAuth2Scope[]>;

/** The authorization URL Discord serves the consent screen from. */
export const OAUTH2_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
/** The token endpoint, used by the authorization code, refresh and client credentials grants. */
export const OAUTH2_TOKEN_URL = "https://discord.com/api/oauth2/token";
/** The token revocation endpoint. */
export const OAUTH2_REVOKE_URL = "https://discord.com/api/oauth2/token/revoke";
/** `GET` this with a Bearer token to learn what the token may actually do. */
export const OAUTH2_ME_URL = "https://discord.com/api/oauth2/@me";

/** Whether a string is a scope Discord documents support for. */
export function isOAuth2Scope(value: string): value is OAuth2Scope {
	return Object.hasOwn(OAuth2ScopeMetadata, value);
}

/**
 * Descriptions for a set of scopes, ready to render as a consent list:
 *
 * ```ts
 * describeOAuth2Scopes(OAuth2ScopePresets.SignIn);
 * // [{ scope: "identify", description: "…" }, …]
 * ```
 *
 * Unknown scope names are included with a `undefined` description rather than
 * dropped, so a typo stays visible.
 */
export function describeOAuth2Scopes(
	scopes: Iterable<string>,
): { scope: string; description: string | undefined; restricted: boolean }[] {
	return Array.from(scopes, (scope) => ({
		scope,
		description: isOAuth2Scope(scope) ? OAuth2ScopeDescriptions[scope] : undefined,
		restricted: isOAuth2Scope(scope) && RestrictedOAuth2Scopes.has(scope),
	}));
}

/** Whether any of the given scopes needs Discord's approval before use. */
export function requiresOAuth2ScopeApproval(scopes: Iterable<string>): boolean {
	for (const scope of scopes) {
		if (isOAuth2Scope(scope) && RestrictedOAuth2Scopes.has(scope)) return true;
	}
	return false;
}
