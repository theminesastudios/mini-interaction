/**
 * Application Identity profiles power **Game Stats Widgets** — the rank,
 * playtime and win panel a *claimed* game can render on a Discord user profile.
 *
 * Everything here is plain HTTP authenticated with the application's **bot
 * token**, so it works in stateless/serverless deployments with no gateway.
 *
 * Prerequisites (configured outside this library):
 * - The game must be **claimed on Discord** and a widget configured under
 *   Developer Portal → Games → Widget.
 * - The player must have linked their Discord account via OAuth2 with the
 *   `application_identities.write` scope.
 * - Media URLs must be reachable from the public internet: Discord's unfurler
 *   fetches them server-side, so `localhost`/LAN URLs never resolve.
 *
 * @see {@link https://docs.discord.com/developers/resources/application-identity-profile}
 * @see {@link https://docs.discord.com/developers/social-layer/game-stats-widgets/overview}
 */

/**
 * Discriminator for a dynamic (custom) profile field.
 *
 * - `String` (1) — a text value
 * - `Number` (2) — a numeric value
 * - `Media` (3) — a media object (public image URL)
 */
export const DynamicFieldType = {
	String: 1,
	Number: 2,
	Media: 3,
} as const;

export type DynamicFieldType = (typeof DynamicFieldType)[keyof typeof DynamicFieldType];

/** Provider type of an {@link APIApplicationIdentity}. */
export type ApplicationIdentityProviderType = "NONE" | (string & {});

/** A media value: a publicly reachable URL Discord's unfurler can fetch. */
export type ProfileMedia = {
	url: string;
};

/**
 * A custom stat. The `name` is the data key referenced from the widget editor
 * (its `User Data` value type) — it is never shown to players.
 */
export type DynamicProfileField =
	| { type: typeof DynamicFieldType.String; name: string; value: string }
	| { type: typeof DynamicFieldType.Number; name: string; value: number }
	| { type: typeof DynamicFieldType.Media; name: string; value: ProfileMedia };

/**
 * Pre-configured stat keys defined by Discord. All fields are optional —
 * populate the ones that fit your game. Every value is fully replaced on write.
 */
export type PrimaryProfileData = {
	/** Current season name, e.g. `"Season 3"`. */
	season?: string;
	/** Current rank name, e.g. `"Silver"`. */
	rank_name?: string;
	/** Image representing the current rank. */
	rank_image?: ProfileMedia;
	/** Highest rank ever achieved. */
	highest_rank?: string;
	/** Image representing the highest rank achieved. */
	highest_rank_image?: ProfileMedia;
	/** Name of the featured played character. */
	featured_played_character?: string;
	/** Image of the featured played character. */
	featured_played_character_image?: ProfileMedia;
	/** Total playtime in hours; decimals allowed (e.g. `69.41`). */
	playtime_hours?: number;
	total_wins?: number;
	current_period_wins?: number;
	total_games?: number;
	current_period_games?: number;
	total_kills?: number;
	current_period_kills?: number;
	total_assists?: number;
	current_period_assists?: number;
	total_deaths?: number;
	current_period_deaths?: number;
};

/** The `data` payload of a profile: pre-configured primary stats + custom dynamic stats. */
export type ApplicationIdentityProfileData = {
	primary?: PrimaryProfileData;
	/** Custom stats. Maximum {@link APPLICATION_IDENTITY_LIMITS.MaxDynamicFields} entries. */
	dynamic?: DynamicProfileField[];
};

/** An Application Identity record returned by the list endpoints. */
export type APIApplicationIdentity = {
	user_id: string;
	provider_type: ApplicationIdentityProviderType;
	/** Omitted when absent or empty. */
	provider_id?: string;
	/** The user's ID *in your system* — not a Discord snowflake. */
	provider_issued_user_id: string;
};

/** A player's stored profile, as returned by the get/update endpoints. */
export type ApplicationIdentityProfile = {
	/** The user's username in *your* system. */
	username?: string;
	/** Arbitrary app-owned data; Discord stores it but never consumes it. */
	metadata?: Record<string, unknown> | null;
	data?: ApplicationIdentityProfileData;
};

/**
 * Body of {@link UpdateIdentityProfileBody}.
 *
 * **`data` is fully replaced whenever it is present.** Any field you omit is
 * deleted. Omit `data` entirely to leave the stored stats untouched.
 */
export type UpdateIdentityProfileBody = {
	/** Max {@link APPLICATION_IDENTITY_LIMITS.MaxUsernameLength} characters. */
	username?: string;
	data?: ApplicationIdentityProfileData;
};

/** Hard limits enforced by Discord; validated client-side so failures are obvious. */
export const APPLICATION_IDENTITY_LIMITS = {
	/** Serialized `data` object must stay under 10 KB. */
	MaxSerializedDataBytes: 10 * 1024,
	/** Maximum number of `dynamic` fields. */
	MaxDynamicFields: 30,
	/** Maximum length of any string stat value (e.g. `rank_name`). */
	MaxStringValueLength: 100,
	/** Maximum length of a dynamic field `name` (its data key). */
	MaxDynamicFieldNameLength: 100,
	/** Maximum length of `username`. */
	MaxUsernameLength: 1024,
} as const;

/** Machine-readable reasons a Game Stats payload was rejected before hitting the API. */
export type ApplicationIdentityProfileErrorCode =
	| "payload_too_large"
	| "too_many_dynamic_fields"
	| "string_value_too_long"
	| "dynamic_field_name_too_long"
	| "username_too_long"
	| "media_url_not_public";

/**
 * Thrown when a Game Stats payload would be rejected by Discord, so callers can
 * branch on {@link code} instead of string-matching an API error.
 */
export class ApplicationIdentityProfileError extends Error {
	constructor(
		readonly code: ApplicationIdentityProfileErrorCode,
		message: string,
	) {
		super(`[ApplicationIdentityProfile] ${message}`);
		this.name = "ApplicationIdentityProfileError";
	}
}

/** Error strings the Application Identity Profile API returns that are worth branching on. */
export const APPLICATION_IDENTITY_PROFILE_ERRORS = {
	PayloadTooLarge: "Profile data is too large, must be less than 10KB",
	IdentityAlreadyExists:
		"Application identity for this external account already exists for another user",
	ProviderUserMismatch: "does not match existing identity record",
} as const;

/** Shared encoder so the size check works on both Node and Cloudflare Workers. */
const UTF8_ENCODER = new TextEncoder();

/**
 * Hosts the unfurler cannot reach. Matched against a normalised hostname
 * (brackets and any trailing dot removed, lowercased), so IPv6 literals and
 * trailing-dot FQDNs like `localhost.` are covered too.
 */
const PRIVATE_HOST_PATTERNS: RegExp[] = [
	/^localhost$/,
	/^127\./,
	/^0\.0\.0\.0$/,
	/^::1$/,
	/^10\./,
	/^192\.168\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^169\.254\./,
	// IPv6 link-local (fe80::/10) and unique-local (fc00::/7)
	/^fe[89ab][0-9a-f]:/,
	/^f[cd][0-9a-f]{2}:/,
	// IPv4-mapped IPv6 literals are rejected conservatively.
	/^::ffff:/,
	/\.local$/,
	/\.internal$/,
];

/** Strips IPv6 brackets and a trailing FQDN dot, then lowercases. */
function normalizeHostname(hostname: string): string {
	return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

/**
 * Whether a media URL is reachable from Discord's servers.
 *
 * The unfurler fetches media server-side, so `localhost`, loopback, link-local
 * and private-range hosts render as nothing in the widget. Expose local assets
 * through a tunnel (Cloudflare Tunnel, ngrok) during development.
 */
export function isPublicMediaUrl(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

	const hostname = normalizeHostname(parsed.hostname);
	return !PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/** Serializes `data` exactly as Discord measures it, for the 10 KB ceiling. */
export function serializeProfileData(data: ApplicationIdentityProfileData): string {
	return JSON.stringify(data);
}

/**
 * Validates a `data` payload against Discord's documented limits.
 *
 * @throws {@link ApplicationIdentityProfileError} with a specific `code`.
 */
export function assertProfileDataWithinLimits(
	data: ApplicationIdentityProfileData,
	options: { allowPrivateMediaUrls?: boolean } = {},
): void {
	const primary = data.primary;
	if (primary) {
		for (const [key, value] of Object.entries(primary)) {
			if (typeof value === "string") {
				assertStringValueLength(key, value);
			} else if (isMediaValue(value)) {
				assertMediaUrl(key, value.url, options.allowPrivateMediaUrls);
			}
		}
	}

	const dynamic = data.dynamic ?? [];
	if (dynamic.length > APPLICATION_IDENTITY_LIMITS.MaxDynamicFields) {
		throw new ApplicationIdentityProfileError(
			"too_many_dynamic_fields",
			`dynamic accepts at most ${APPLICATION_IDENTITY_LIMITS.MaxDynamicFields} fields, got ${dynamic.length}`,
		);
	}

	for (const field of dynamic) {
		if (field.name.length > APPLICATION_IDENTITY_LIMITS.MaxDynamicFieldNameLength) {
			throw new ApplicationIdentityProfileError(
				"dynamic_field_name_too_long",
				`dynamic field name "${field.name}" exceeds ${APPLICATION_IDENTITY_LIMITS.MaxDynamicFieldNameLength} characters`,
			);
		}

		if (field.type === DynamicFieldType.String) {
			assertStringValueLength(field.name, field.value);
		} else if (field.type === DynamicFieldType.Media) {
			assertMediaUrl(field.name, field.value.url, options.allowPrivateMediaUrls);
		}
	}

	const serialized = serializeProfileData(data);
	if (UTF8_ENCODER.encode(serialized).length > APPLICATION_IDENTITY_LIMITS.MaxSerializedDataBytes) {
		throw new ApplicationIdentityProfileError(
			"payload_too_large",
			`serialized data exceeds ${APPLICATION_IDENTITY_LIMITS.MaxSerializedDataBytes / 1024}KB; send fewer stats or shorten values`,
		);
	}
}

/** Validates a `username` against Discord's length limit. */
export function assertUsernameLength(username: string): void {
	if (username.length > APPLICATION_IDENTITY_LIMITS.MaxUsernameLength) {
		throw new ApplicationIdentityProfileError(
			"username_too_long",
			`username exceeds ${APPLICATION_IDENTITY_LIMITS.MaxUsernameLength} characters`,
		);
	}
}

/**
 * Builds a `data` object from optional parts, dropping undefined keys so the
 * resulting payload never contains empty `primary`/`dynamic` values.
 */
export function buildProfileData(parts: {
	primary?: PrimaryProfileData;
	dynamic?: DynamicProfileField[];
}): ApplicationIdentityProfileData | undefined {
	const data: ApplicationIdentityProfileData = {};
	if (parts.primary) data.primary = parts.primary;
	if (parts.dynamic) data.dynamic = [...parts.dynamic];
	return Object.keys(data).length > 0 ? data : undefined;
}

/**
 * Merges incoming stats into existing stats.
 *
 * `primary` is shallow-merged; `dynamic` fields are matched by `name`, so
 * updating one custom stat leaves the others intact. This is the read-then-write
 * counterpart to Discord's replace-on-PATCH behaviour.
 */
export function mergeProfileData(
	existing: ApplicationIdentityProfileData | undefined,
	incoming: { primary?: PrimaryProfileData; dynamic?: DynamicProfileField[] },
): ApplicationIdentityProfileData | undefined {
	const primary = { ...existing?.primary, ...incoming.primary };
	const byName = new Map<string, DynamicProfileField>();
	for (const field of existing?.dynamic ?? []) byName.set(field.name, field);
	for (const field of incoming.dynamic ?? []) byName.set(field.name, field);

	const dynamic = [...byName.values()];
	const merged: ApplicationIdentityProfileData = {};
	if (Object.keys(primary).length > 0) merged.primary = primary;
	if (dynamic.length > 0) merged.dynamic = dynamic;

	return Object.keys(merged).length > 0 ? merged : undefined;
}

function isMediaValue(value: unknown): value is ProfileMedia {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as ProfileMedia).url === "string"
	);
}

function assertStringValueLength(key: string, value: string): void {
	if (value.length > APPLICATION_IDENTITY_LIMITS.MaxStringValueLength) {
		throw new ApplicationIdentityProfileError(
			"string_value_too_long",
			`"${key}" exceeds ${APPLICATION_IDENTITY_LIMITS.MaxStringValueLength} characters`,
		);
	}
}

function assertMediaUrl(key: string, url: string, allowPrivateMediaUrls?: boolean): void {
	if (allowPrivateMediaUrls) return;
	if (!isPublicMediaUrl(url)) {
		throw new ApplicationIdentityProfileError(
			"media_url_not_public",
			`"${key}" points at "${url}", which Discord cannot fetch. Use a publicly reachable URL or pass allowPrivateMediaUrls.`,
		);
	}
}