import type { APIChannel, APIUser } from "discord-api-types/v10";

/**
 * Discord lobbies and **Linked Channels**: binding an in-game lobby to a guild
 * text channel so messages flow both ways, and minting on-demand invites so a
 * lobby's players can join the server.
 *
 * @see {@link https://docs.discord.com/developers/resources/lobby}
 * @see {@link https://docs.discord.com/developers/discord-social-sdk/development-guides/linked-channels}
 *
 * ## Two things the HTTP API does *not* give you
 *
 * 1. **`isLinkable` and `isViewableAndWriteableByAllMembers` are Social SDK
 *    fields, not HTTP fields.** The C++/Unity SDK computes them client-side from
 *    channel validity (text channel? age-restricted? already linked?) and the
 *    user's permissions. Over HTTP you get the raw channel list and must derive
 *    the same answer yourself — or let the `PATCH .../channel-linking` call fail.
 * 2. **Private channels can be linked.** Discord allows any channel the user can
 *    access, including a private `#admins`. Read/write permissions are enforced
 *    only in the Discord client, so **every lobby member** can read and post in
 *    the linked channel in-game. Warn the player performing the link; the
 *    library cannot tell you which channel is private.
 *
 * ## Tokens
 *
 * Lobby endpoints acting *on behalf of a user* (channel linking, lobby
 * messages, self-invites, create-or-join) need a **Bearer** user token with the
 * `sdk.social_layer` scope — not the bot token. Application-scoped calls
 * (create/modify/delete lobby, member administration, invites for another user)
 * use the bot token, which the client applies by default.
 *
 * ## Rate limits
 *
 * Unapproved apps get per-application development limits. Channel linking is
 * capped at **20 per 2 hours**, so a tight test loop will exhaust it — see
 * {@link LOBBY_DEVELOPMENT_RATE_LIMITS}.
 */

/** Lobby member flags, combined as a bitfield. */
export const LobbyMemberFlags = {
	/** The user can link a text channel to a lobby. Required to link *and* unlink. */
	CanLinkLobby: 1 << 0,
} as const;

export type LobbyMemberFlags = (typeof LobbyMemberFlags)[keyof typeof LobbyMemberFlags];

/** Arbitrary string key/value pairs; combined length capped at 1000 characters. */
export type LobbyMetadata = Record<string, string>;

/** A lobby member. */
export type APILobbyMember = {
	/** Discord user ID. */
	id: string;
	metadata?: LobbyMetadata | null;
	/** Lobby member flags, combined as a bitfield. */
	flags?: number;
	/**
	 * 1–80 character display name such as an in-game character name. Settable
	 * over HTTP only; expose it via `MessageHandle::AdditionalName` in the SDK.
	 */
	additional_name?: string;
};

/** A lobby. */
export type APILobby = {
	id: string;
	/** The application that created the lobby. */
	application_id: string;
	metadata?: LobbyMetadata | null;
	members: APILobbyMember[];
	/** The guild channel linked to the lobby, when one is. */
	linked_channel?: APIChannel;
};

/** A message sent to a lobby, forwarded to the linked channel when one exists. */
export type APILobbyMessage = {
	id: string;
	/** Message type. */
	type: number;
	content: string;
	/** ID of the lobby this message was sent to. */
	lobby_id: string;
	/** Included for compatibility with the messages interface; equal to `lobby_id`. */
	channel_id: string;
	author: APIUser;
	/** The author's `additional_name`, captured when the message was sent. */
	lobby_member?: { additional_name: string };
	/** Dispatch-only metadata; not persisted on the linked channel message. */
	metadata?: LobbyMetadata | null;
	moderation_metadata?: LobbyMetadata | null;
	flags: number;
	application_id: string;
};

/** A single-use invite to a lobby's linked channel; expires after one hour. */
export type APILobbyInvite = {
	/** The invite code for the lobby's linked channel. */
	code: string;
};

/** Payload for creating or modifying a lobby member. */
export type LobbyMemberInput = {
	/** Discord user ID. */
	id: string;
	metadata?: LobbyMetadata | null;
	/** Lobby member flags, combined as a bitfield. Set `CanLinkLobby` here. */
	flags?: number;
	/** 1–80 characters. Omit to preserve the current value, or send `null` to clear. */
	additional_name?: string | null;
};

/** A member entry for {@link bulkUpdateLobbyMembers}; may also remove. */
export type LobbyMemberUpdateInput = LobbyMemberInput & {
	/** When `true` the member is removed instead of upserted. Defaults to `false`. */
	remove_member?: boolean;
};

/** Documented limits, encoded so callers fail fast instead of at the API. */
export const LOBBY_LIMITS = {
	/** Combined length of a `metadata` dictionary. */
	MaxMetadataLength: 1000,
	/** Members accepted per create/modify request. */
	MaxMembersPerRequest: 25,
	MinAdditionalNameLength: 1,
	MaxAdditionalNameLength: 80,
	/** Length of the `secret` used by create-or-join. */
	MaxSecretLength: 250,
	/** `idle_timeout_seconds` bounds, in seconds. */
	MinIdleTimeoutSeconds: 5,
	MaxIdleTimeoutSeconds: 604_800,
	/** Messages returned per read. */
	MaxMessagesPerPage: 200,
} as const;

/**
 * Default per-application development rate limits, each per **2 hour** window.
 * They apply application-wide (not per user), and production apps can request
 * higher ceilings.
 */
export const LOBBY_DEVELOPMENT_RATE_LIMITS = {
	/** `POST|PUT /lobbies` and `PATCH|DELETE /lobbies/{id}`. */
	LobbyMutation: 100,
	/** `PUT|DELETE /lobbies/{id}/members/{user.id}` and `.../members/bulk`. */
	MemberMutation: 100,
	/** `PATCH /lobbies/{id}/channel-linking` — the tightest limit of the set. */
	ChannelLinking: 20,
	/** `POST /lobbies/{id}/messages`. */
	MessageSend: 100,
	/** `POST /lobbies/{id}/members/{@me|user.id}/invites`. */
	Invite: 100,
} as const;

/** Whether a lobby member may link (or unlink) a channel to the lobby. */
export function canLinkLobby(member: Pick<APILobbyMember, "flags">): boolean {
	return ((member.flags ?? 0) & LobbyMemberFlags.CanLinkLobby) === LobbyMemberFlags.CanLinkLobby;
}

/** The ID of the channel linked to a lobby, if any. */
export function linkedChannelId(lobby: Pick<APILobby, "linked_channel">): string | undefined {
	return lobby.linked_channel?.id;
}

/**
 * Combined character length of a metadata dictionary, for checking against
 * {@link LOBBY_LIMITS.MaxMetadataLength} before the request.
 */
export function metadataLength(metadata: LobbyMetadata | null | undefined): number {
	if (!metadata) return 0;
	return Object.entries(metadata).reduce(
		(total, [key, value]) => total + key.length + value.length,
		0,
	);
}
