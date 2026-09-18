import type {
	APIApplication,
	APIAttachment,
	APIChannel,
	APIEntitlement,
	APIGuild,
	APIMessageActivity,
	APIUser,
} from "discord-api-types/v10";

/**
 * Webhook Events ("outgoing webhooks") are one-way HTTP events Discord posts to
 * an app's **Webhook Event URL** when something happens in Discord — as opposed
 * to incoming webhooks, which an external service triggers.
 *
 * Unlike Gateway events they are **not realtime and not guaranteed to be in
 * order**, so handlers must be idempotent and reconcile state rather than
 * assume sequencing.
 *
 * @see {@link https://docs.discord.com/developers/events/webhook-events}
 */

/** Outer payload `type`. */
export const WebhookEventPayloadType = {
	/** Sent when Discord validates your endpoint URL. Answer with an empty `204`. */
	Ping: 0,
	/** A real event; the details live in `event`. */
	Event: 1,
} as const;

export type WebhookEventPayloadType =
	(typeof WebhookEventPayloadType)[keyof typeof WebhookEventPayloadType];

/** Installation context of an authorization: `0` = server, `1` = user account. */
export const WebhookEventIntegrationType = {
	GuildInstall: 0,
	UserInstall: 1,
} as const;

export type WebhookEventIntegrationType =
	(typeof WebhookEventIntegrationType)[keyof typeof WebhookEventIntegrationType];

/**
 * Every event name an app can subscribe to.
 *
 * `ENTITLEMENT_UPDATE` and `ENTITLEMENT_DELETE` are included here even though
 * `discord-interactions`' own `WebhookEventType` enum predates them.
 */
export const WebhookEventType = {
	/** The app was authorized by a user to a server or to their account. */
	ApplicationAuthorized: "APPLICATION_AUTHORIZED",
	/** The app was deauthorized by a user. */
	ApplicationDeauthorized: "APPLICATION_DEAUTHORIZED",
	/** An entitlement was created. */
	EntitlementCreate: "ENTITLEMENT_CREATE",
	/** An entitlement was updated. */
	EntitlementUpdate: "ENTITLEMENT_UPDATE",
	/** An entitlement was deleted. */
	EntitlementDelete: "ENTITLEMENT_DELETE",
	/** A user was added to a Quest. Documented, but currently unavailable to apps. */
	QuestUserEnrollment: "QUEST_USER_ENROLLMENT",
	/** A message was created in a lobby. */
	LobbyMessageCreate: "LOBBY_MESSAGE_CREATE",
	/** A message was updated in a lobby. */
	LobbyMessageUpdate: "LOBBY_MESSAGE_UPDATE",
	/** A message was deleted from a lobby. */
	LobbyMessageDelete: "LOBBY_MESSAGE_DELETE",
	/** A direct message was created during an active Social SDK session. */
	GameDirectMessageCreate: "GAME_DIRECT_MESSAGE_CREATE",
	/** A direct message was updated during an active Social SDK session. */
	GameDirectMessageUpdate: "GAME_DIRECT_MESSAGE_UPDATE",
	/** A direct message was deleted during an active Social SDK session. */
	GameDirectMessageDelete: "GAME_DIRECT_MESSAGE_DELETE",
} as const;

export type WebhookEventType = (typeof WebhookEventType)[keyof typeof WebhookEventType];

/** `APPLICATION_AUTHORIZED` — the app was added to a server or a user's account. */
export type ApplicationAuthorizedEventData = {
	/** `0` when installed to a server, `1` when installed to a user's account. */
	integration_type?: WebhookEventIntegrationType;
	/** The user who authorized the app. */
	user: APIUser;
	/** OAuth2 scopes the user granted. */
	scopes: string[];
	/** Present when `integration_type` is `0`. */
	guild?: APIGuild;
};

/**
 * `APPLICATION_DEAUTHORIZED` — the app was deauthorized by a user.
 *
 * For Social SDK apps this is the **only out-of-game signal that a user's link
 * state changed**. Every revocation is mechanically an unmerge: the Discord
 * account reverts to a provisional account and that user's OAuth2 tokens become
 * invalid, so you must fall back to the provisional account flow. Missing this
 * event means the next token use fails instead.
 */
export type ApplicationDeauthorizedEventData = {
	/** The user who deauthorized the app. */
	user: APIUser;
};

/**
 * A message sent in a lobby or in a
 * [Linked Channel](https://docs.discord.com/developers/discord-social-sdk/development-guides/linked-channels).
 */
export type LobbyMessageEventData = {
	id: string;
	/** Message type. */
	type: number;
	content: string;
	/** The lobby the message belongs to. */
	lobby_id: string;
	/** The channel the message was sent in. */
	channel_id: string;
	author: APIUser;
	/** Arbitrary key/value metadata attached to the message. */
	metadata?: Record<string, unknown>;
	/** Message flags, combined as a bitfield. */
	flags: number;
	/** Only present during an active Social SDK session. */
	application_id?: string;
};

/** `LOBBY_MESSAGE_UPDATE` adds the original and edited timestamps. */
export type LobbyMessageUpdateEventData = LobbyMessageEventData & {
	/** ISO8601 timestamp of the edit. */
	edited_timestamp?: string;
	/** ISO8601 timestamp of the original message. */
	timestamp?: string;
};

/** `LOBBY_MESSAGE_DELETE` is deliberately thin — just enough to reconcile state. */
export type LobbyMessageDeleteEventData = {
	/** ID of the deleted message. */
	id: string;
	/** ID of the lobby the message was deleted from. */
	lobby_id: string;
};

/**
 * Standard Discord message body as it appears inside a webhook event.
 *
 * Deliberately looser than `discord-api-types`' `APIMessage`: the documented
 * webhook payloads omit fields that are required on a full message object.
 */
export type WebhookEventMessageBody = {
	id: string;
	type?: number;
	content?: string;
	channel_id?: string;
	author?: APIUser;
	timestamp?: string;
	edited_timestamp?: string | null;
	flags?: number;
	attachments?: APIAttachment[];
	/** Channel object with recipient information. */
	channel?: APIChannel;
	application_id?: string;
};

/** A standard message object; Linked Channel messages additionally carry `lobby_id`. */
export type WebhookEventMessage = WebhookEventMessageBody & {
	/** Only present in Linked Channel messages. */
	lobby_id?: string;
};

/**
 * A direct message between two **provisional** accounts. It exists only in-game
 * and is never delivered to the Discord client.
 */
export type WebhookEventSdkDirectMessage = {
	id: string;
	type: number;
	content: string;
	author: APIUser;
	/** Message flags, combined as a bitfield. */
	flags: number;
	/** The application that created the message. */
	application_id: string;
	/** Channel object with recipient information. */
	channel: APIChannel;
	/** Sent with Rich Presence-related chat embeds. */
	activity?: APIMessageActivity;
	/** Partial application object, sent with Rich Presence-related chat embeds. */
	application?: Partial<APIApplication>;
	/** Present when the message also targetted a standard Discord channel. */
	recipient_id?: string;
};

/**
 * `GAME_DIRECT_MESSAGE_*` data.
 *
 * Which shape arrives depends on the session: a standard
 * {@link WebhookEventMessage} when a linked Discord account is involved, or a
 * {@link WebhookEventSdkDirectMessage} when both participants are provisional.
 */
export type GameDirectMessageEventData =
	| WebhookEventMessage
	| WebhookEventSdkDirectMessage;

/** Maps every event name to the shape of its `event.data`. */
export type WebhookEventDataMap = {
	APPLICATION_AUTHORIZED: ApplicationAuthorizedEventData;
	APPLICATION_DEAUTHORIZED: ApplicationDeauthorizedEventData;
	ENTITLEMENT_CREATE: APIEntitlement;
	ENTITLEMENT_UPDATE: APIEntitlement;
	ENTITLEMENT_DELETE: APIEntitlement;
	QUEST_USER_ENROLLMENT: Record<string, unknown>;
	LOBBY_MESSAGE_CREATE: LobbyMessageEventData;
	LOBBY_MESSAGE_UPDATE: LobbyMessageUpdateEventData;
	LOBBY_MESSAGE_DELETE: LobbyMessageDeleteEventData;
	GAME_DIRECT_MESSAGE_CREATE: GameDirectMessageEventData;
	GAME_DIRECT_MESSAGE_UPDATE: GameDirectMessageEventData;
	GAME_DIRECT_MESSAGE_DELETE: GameDirectMessageEventData;
};

/** High-level data about a single event: what happened, and when. */
export type WebhookEventBody<TName extends WebhookEventType> = {
	type: TName;
	/** ISO8601 timestamp of when the event occurred. */
	timestamp: string;
	/** Event-specific payload; the shape is tied to `type`. */
	data?: WebhookEventDataMap[TName];
};

/** Outer envelope for a single event, as delivered to your endpoint. */
export type WebhookEventPayloadOf<TName extends WebhookEventType> = {
	/** Always `1`. */
	version: 1;
	/** ID of the app the event belongs to. */
	application_id: string;
	type: typeof WebhookEventPayloadType.Event;
	event: WebhookEventBody<TName>;
};

/**
 * Discriminated union of every event payload.
 *
 * Narrowing on `payload.event.type` narrows `payload.event.data` with it:
 *
 * ```ts
 * if (payload.event.type === WebhookEventType.ApplicationDeauthorized) {
 *   payload.event.data?.user.id; // typed
 * }
 * ```
 */
export type WebhookEventPayload = {
	[TName in WebhookEventType]: WebhookEventPayloadOf<TName>;
}[WebhookEventType];

/** The `PING` Discord sends when validating your Webhook Event URL. */
export type WebhookEventPingPayload = {
	version: 1;
	application_id: string;
	type: typeof WebhookEventPayloadType.Ping;
};

/** Anything Discord can deliver to your Webhook Event URL. */
export type WebhookEventRequest = WebhookEventPingPayload | WebhookEventPayload;

/** Narrows a request to an actual event (i.e. not a `PING`). */
export function isWebhookEventPayload(
	request: WebhookEventRequest,
): request is WebhookEventPayload {
	return request.type === WebhookEventPayloadType.Event;
}
