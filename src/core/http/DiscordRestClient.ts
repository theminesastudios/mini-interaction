import { setTimeout as sleep } from 'node:timers/promises';
import type {
  APIBan,
  APIChannel,
  APIEmoji,
  APIEntitlement,
  APIGuild,
  APIGuildMember,
  APIMessage,
  APIRole,
  APISKU,
  APISticker,
  APIUser,
  APIWebhook,
  ApplicationCommandPermissionType,
  RESTPutAPIApplicationCommandPermissionsJSONBody,
  RESTPutAPIApplicationRoleConnectionMetadataJSONBody,
  RESTPutAPIApplicationRoleConnectionMetadataResult,
} from 'discord-api-types/v10';

import {
  assertProfileDataWithinLimits,
  assertUsernameLength,
  buildProfileData,
  mergeProfileData,
  type APIApplicationIdentity,
  type ApplicationIdentityProfile,
  type DynamicProfileField,
  type PrimaryProfileData,
  type UpdateIdentityProfileBody,
} from '../../identity/ApplicationIdentityProfile.js';
import type {
  APILobby,
  APILobbyInvite,
  APILobbyMember,
  APILobbyMessage,
  LobbyMemberInput,
  LobbyMemberUpdateInput,
  LobbyMetadata,
} from '../../lobby/Lobby.js';
import { DiscordSentMessage } from '../messages/DiscordSentMessage.js';
import {
  createMessageRequestInit,
  type BaseDiscordMessageOptions,
  type DiscordCreateThreadOptions,
  type DiscordReaction,
  type DiscordSendMessageOptions,
  type DiscordStartThreadOptions,
  type DiscordWebhookSendOptions,
} from '../messages/message-payloads.js';
import { DiscordWebhook } from '../webhooks/DiscordWebhook.js';

import type { DiscordChannelEditOptions } from '../messages/message-payloads.js';

export type DiscordMemberEditOptions = {
	nick?: string | null;
	roles?: string[];
	/** Timeout until this ISO timestamp (max 28 days); null clears it. */
	communicationDisabledUntil?: string | null;
};

export type DiscordRoleOptions = {
	name?: string;
	permissions?: string;
	color?: number;
	hoist?: boolean;
	mentionable?: boolean;
	unicodeEmoji?: string;
};

export type SendGameStatsOptions = {
	/** The player's Discord user ID. */
	userId: string;
	/** The player's ID in *your* system (row id, UUID, username) — not a snowflake. */
	providerIssuedUserId: string;
	/** The player's username in your system (max 1024 chars). */
	username?: string;
	/** Pre-configured Discord stat keys (rank, playtime, wins, …). */
	primary?: PrimaryProfileData;
	/** Custom stats (max 30). */
	dynamic?: DynamicProfileField[];
	/**
	 * `"replace"` (default) stores exactly the stats you pass — Discord's native
	 * behaviour, where any omitted stat is deleted.
	 * `"merge"` reads the profile first and merges by key, preserving stats you
	 * omit. Costs one extra request.
	 */
	mode?: 'replace' | 'merge';
	/** Skip the client-side check that media URLs are reachable from Discord. */
	allowPrivateMediaUrls?: boolean;
};

export type LobbyCreateOptions = {
	metadata?: LobbyMetadata;
	/** Up to 25 users to add on creation. Set `CanLinkLobby` here for the owner. */
	members?: LobbyMemberInput[];
	/** Seconds to wait before an idle lobby shuts down (5–604800). */
	idleTimeoutSeconds?: number;
};

export type LobbyModifyOptions = {
	metadata?: LobbyMetadata;
	/** Replaces the member list; members not listed are removed. Up to 25. */
	members?: LobbyMemberInput[];
	idleTimeoutSeconds?: number;
};

export type LobbyCreateOrJoinOptions = {
	/** Identifies the lobby. Max 250 characters. */
	secret: string;
	idleTimeoutSeconds?: number;
	lobbyMetadata?: LobbyMetadata;
	memberMetadata?: LobbyMetadata;
};

export type LobbyMessageSendOptions = {
	/** Message content. Must be non-empty. */
	content: string;
	/**
	 * Delivered alongside the message to active Social SDK clients. Not persisted
	 * on the linked channel message.
	 */
	metadata?: LobbyMetadata;
	/** Only flags creatable by the Social SDK are accepted. */
	flags?: number;
};

type FetchLike = typeof fetch;

export type DiscordRestClientOptions = {
  token: string;
  applicationId: string;
  apiBaseUrl?: string;
  maxRetries?: number;
  fetchImplementation?: FetchLike;
};

/**
 * Thrown when Discord answers a REST call with a non-2xx status.
 *
 * `message` deliberately keeps the historical
 * `[DiscordRestClient] <METHOD> <path> failed: <status>` shape so existing
 * logging and `instanceof Error` checks keep working, while `status` lets
 * callers branch on the code without parsing that string.
 */
export class DiscordRestApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: string,
  ) {
    super(
      `[DiscordRestClient] ${method} ${path} failed: ${status}${body ? ` ${body}` : ''}`,
    );
    this.name = 'DiscordRestApiError';
  }
}

export class DiscordRestClient {
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly maxRetries: number;

  /** Bucket id -> observed remaining/reset state. */
  private readonly buckets = new Map<
    string,
    { remaining: number | null; resetAt: number }
  >();
  /** Normalised route -> bucket id, learned from X-RateLimit headers. */
  private readonly routeBuckets = new Map<string, string>();

  constructor(private readonly options: DiscordRestClientOptions) {
    this.fetchImpl = options.fetchImplementation ?? fetch;
    this.baseUrl = options.apiBaseUrl ?? 'https://discord.com/api/v10';
    this.maxRetries = options.maxRetries ?? 3;
  }

  async request<T>(
    path: string,
    init: RequestInit & { authenticated?: boolean } = {},
  ): Promise<T> {
    let lastError: unknown;
    const { authenticated = true, ...requestInit } = init;
    const routeKey = this.routeKey(path, requestInit);

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      // Respect the last observed per-bucket budget before spending a call.
      await this.waitForBucket(routeKey);

      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          ...requestInit,
          headers: {
            ...(authenticated ? { Authorization: `Bot ${this.options.token}` } : {}),
            ...getDefaultContentTypeHeader(requestInit.body),
            ...(requestInit.headers ?? {}),
          },
        });
      } catch (error) {
        lastError = this.createRequestError(path, requestInit.method, error);
        if (attempt < this.maxRetries) {
          await sleep(150 * (attempt + 1));
          continue;
        }
        break;
      }

      // Learn/refresh the bucket budget from every response.
      this.updateRateLimitState(routeKey, response);

      if (response.status === 429) {
        const retryAfterSeconds = await this.readRetryAfter(response);
        if (attempt < this.maxRetries) {
          await sleep(Math.ceil(retryAfterSeconds * 1000));
          continue;
        }

        lastError = new DiscordRestApiError(
          429,
          requestInit.method ?? 'GET',
          path,
          '',
        );
        break;
      }

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        const responseText = await response.text();
        if (!responseText) return undefined as T;
        return JSON.parse(responseText) as T;
      }

      if (response.status >= 500 && attempt < this.maxRetries) {
        await sleep(150 * (attempt + 1));
        continue;
      }

      const errorBody = await response.text();
      lastError = new DiscordRestApiError(
        response.status,
        requestInit.method ?? 'GET',
        path,
        errorBody,
      );
      break;
    }
    throw lastError instanceof Error ? lastError : new Error('[DiscordRestClient] unknown request failure');
  }

  /**
   * Normalises a path into a stable route key: numeric ids become `:id`
   * except for major parameters (channel/guild/webhook roots).
   */
  private routeKey(path: string, init: RequestInit): string {
    const method = (init.method ?? 'GET').toUpperCase();
    const parts = path.split('?')[0].split('/').filter(Boolean);

    const masked = parts.map((part, index) => {
      const previous = parts[index - 1];
      if (previous === 'channels' || previous === 'guilds' || previous === 'webhooks') {
        return part; // major parameter — kept verbatim
      }
      if (part === '@me' || part === '@original') return part;
      return /^\d{15,}$/.test(part) ? ':id' : part;
    });

    return `${method} ${masked.join('/')}`;
  }

  private async waitForBucket(routeKey: string): Promise<void> {
    const bucketId = this.routeBuckets.get(routeKey);
    if (!bucketId) return;

    const bucket = this.buckets.get(bucketId);
    if (!bucket || bucket.remaining === null || bucket.remaining > 0) return;

    const waitMs = bucket.resetAt - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs + 5); // small buffer for clock skew
    } else {
      bucket.remaining = null; // stale entry — let it refresh
    }
  }

  private updateRateLimitState(routeKey: string, response: Response): void {
    const bucketId = response.headers.get('x-ratelimit-bucket');
    if (!bucketId) return;

    this.routeBuckets.set(routeKey, bucketId);

    const bucket = this.buckets.get(bucketId) ?? { remaining: null, resetAt: 0 };
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resetAfter = response.headers.get('x-ratelimit-reset-after');

    if (remaining !== null) bucket.remaining = Number(remaining);
    if (resetAfter !== null) bucket.resetAt = Date.now() + Number(resetAfter) * 1000;

    this.buckets.set(bucketId, bucket);
  }

  /** Reads retry_after from the 429 body first (float seconds), then headers. */
  private async readRetryAfter(response: Response): Promise<number> {
    try {
      const bodyText = await response.clone().text();
      if (bodyText) {
        const parsed = JSON.parse(bodyText) as { retry_after?: number };
        if (typeof parsed.retry_after === 'number') return parsed.retry_after;
      }
    } catch {
      // fall through to header parsing
    }

    const headerValue = response.headers.get('retry-after');
    return headerValue !== null ? Number(headerValue) : 1;
  }

  private createRequestError(path: string, method: string | undefined, error: unknown): Error {
    const message =
      error instanceof Error ? error.message : String(error);

    return new Error(
      `[DiscordRestClient] ${method ?? 'GET'} ${path} failed: ${message}`,
      { cause: error instanceof Error ? error : undefined },
    );
  }

  createFollowup(interactionToken: string, body: unknown): Promise<unknown> {
    return this.request(`/webhooks/${this.options.applicationId}/${interactionToken}`, {
      method: 'POST',
      body: JSON.stringify(body),
      authenticated: false,
    });
  }

  editOriginal(interactionToken: string, body: unknown): Promise<unknown> {
    return this.request(`/webhooks/${this.options.applicationId}/${interactionToken}/messages/@original`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      authenticated: false,
    });
  }

  /** Deletes the original interaction response. */
  async deleteOriginal(interactionToken: string): Promise<void> {
    await this.request(`/webhooks/${this.options.applicationId}/${interactionToken}/messages/@original`, {
      method: 'DELETE',
      authenticated: false,
    });
  }

  /** Deletes a follow-up message previously sent for this interaction. */
  async deleteFollowup(interactionToken: string, messageId: string): Promise<void> {
    await this.request(
      `/webhooks/${this.options.applicationId}/${interactionToken}/messages/${messageId}`,
      { method: 'DELETE', authenticated: false },
    );
  }

  async createFollowupMessage(
    interactionToken: string,
    options: BaseDiscordMessageOptions,
  ): Promise<DiscordSentMessage> {
    const requestInit = createMessageRequestInit(options);
    const message = await this.request<APIMessage>(
      `/webhooks/${this.options.applicationId}/${interactionToken}`,
      {
        method: 'POST',
        ...requestInit,
        authenticated: false,
      },
    );

    return new DiscordSentMessage(this, message);
  }

  async editOriginalMessage(
    interactionToken: string,
    options: BaseDiscordMessageOptions,
  ): Promise<DiscordSentMessage> {
    const requestInit = createMessageRequestInit(options);
    const message = await this.request<APIMessage>(
      `/webhooks/${this.options.applicationId}/${interactionToken}/messages/@original`,
      {
        method: 'PATCH',
        ...requestInit,
        authenticated: false,
      },
    );

    return new DiscordSentMessage(this, message);
  }

  async sendMessage(options: DiscordSendMessageOptions): Promise<DiscordSentMessage> {
    const { channelId, ...messageOptions } = options;
    const requestInit = createMessageRequestInit(messageOptions);
    const message = await this.request<APIMessage>(`/channels/${channelId}/messages`, {
      method: 'POST',
      ...requestInit,
    });

    return new DiscordSentMessage(this, message);
  }

  send(options: DiscordSendMessageOptions): Promise<DiscordSentMessage> {
    return this.sendMessage(options);
  }

  async startThread(options: DiscordStartThreadOptions): Promise<APIChannel> {
    const { channelId, messageId, reason, ...body } = options;

    return this.request<APIChannel>(`/channels/${channelId}/messages/${messageId}/threads`, {
      method: 'POST',
      body: JSON.stringify({
        auto_archive_duration: body.autoArchiveDuration,
        rate_limit_per_user: body.rateLimitPerUser,
        name: body.name,
      }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  /**
   * Creates a thread directly in a channel (no source message), e.g. for
   * forum channels or standalone public/private threads.
   */
  async createThread(options: DiscordCreateThreadOptions): Promise<APIChannel> {
    const { channelId, reason, autoArchiveDuration, rateLimitPerUser, type, invitable, name } = options;

    return this.request<APIChannel>(`/channels/${channelId}/threads`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        ...(autoArchiveDuration !== undefined ? { auto_archive_duration: autoArchiveDuration } : {}),
        ...(rateLimitPerUser !== undefined ? { rate_limit_per_user: rateLimitPerUser } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(invitable !== undefined ? { invitable } : {}),
      }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async editMessage(
    channelId: string,
    messageId: string,
    options: BaseDiscordMessageOptions,
  ): Promise<DiscordSentMessage> {
    const requestInit = createMessageRequestInit(options);
    const message = await this.request<APIMessage>(`/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      ...requestInit,
    });

    return new DiscordSentMessage(this, message);
  }

  async deleteMessage(channelId: string, messageId: string, reason?: string): Promise<void> {
    await this.request(`/channels/${channelId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async pinMessage(channelId: string, messageId: string, reason?: string): Promise<void> {
    await this.request(`/channels/${channelId}/pins/${messageId}`, {
      method: 'PUT',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async unpinMessage(channelId: string, messageId: string, reason?: string): Promise<void> {
    await this.request(`/channels/${channelId}/pins/${messageId}`, {
      method: 'DELETE',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async crosspostMessage(channelId: string, messageId: string): Promise<APIMessage> {
    return this.request<APIMessage>(`/channels/${channelId}/messages/${messageId}/crosspost`, {
      method: 'POST',
    });
  }

  /** Sends a message through an existing webhook without instantiating {@link DiscordWebhook}. */
  async sendWebhookMessage(
    webhookId: string,
    webhookToken: string,
    options: DiscordWebhookSendOptions,
  ): Promise<DiscordSentMessage> {
    return this.webhook(webhookId, webhookToken).send(options);
  }

  // ---- Message reads & bulk operations (v0.7) ----

  async fetchMessage(channelId: string, messageId: string): Promise<DiscordSentMessage> {
    const message = await this.request<APIMessage>(`/channels/${channelId}/messages/${messageId}`);
    return new DiscordSentMessage(this, message);
  }

  /** Lists channel messages; at most one of before/after/around per call. */
  async fetchMessages(
    channelId: string,
    options: { limit?: number; before?: string; after?: string; around?: string } = {},
  ): Promise<APIMessage[]> {
    const { limit, before, after, around } = options;
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    if (before) params.set('before', before);
    if (after) params.set('after', after);
    if (around) params.set('around', around);

    const query = params.size > 0 ? `?${params.toString()}` : '';
    return this.request<APIMessage[]>(`/channels/${channelId}/messages${query}`);
  }

  /** Bulk-deletes 2–100 messages (all must be younger than 14 days). */
  async bulkDeleteMessages(channelId: string, messageIds: readonly string[], reason?: string): Promise<void> {
    if (messageIds.length < 2 || messageIds.length > 100) {
      throw new Error('[DiscordRestClient] bulk delete accepts between 2 and 100 messages');
    }

    await this.request(`/channels/${channelId}/messages/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ messages: [...messageIds] }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  // ---- Typing & reactions (v0.7) ----

  async triggerTyping(channelId: string): Promise<void> {
    await this.request(`/channels/${channelId}/typing`, { method: 'POST' });
  }

  /** Lists the users who reacted with the given emoji (paginated). */
  async fetchReactors(
    channelId: string,
    messageId: string,
    reaction: DiscordReaction,
    options: { limit?: number; after?: string; type?: number } = {},
  ): Promise<APIUser[]> {
    const { limit, after, type } = options;
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    if (after) params.set('after', after);
    if (type !== undefined) params.set('type', String(type));

    const query = params.size > 0 ? `?${params.toString()}` : '';
    return this.request<APIUser>(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeDiscordReaction(reaction)}${query}`,
    ).then((result) => result as unknown as APIUser[]);
  }

  async removeOwnReaction(channelId: string, messageId: string, reaction: DiscordReaction): Promise<void> {
    await this.request(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeDiscordReaction(reaction)}/@me`,
      { method: 'DELETE' },
    );
  }

  async removeUserReaction(
    channelId: string,
    messageId: string,
    userId: string,
    reaction: DiscordReaction,
    reason?: string,
  ): Promise<void> {
    await this.request(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeDiscordReaction(reaction)}/${userId}`,
      { method: 'DELETE', headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined },
    );
  }

  async removeAllReactions(channelId: string, messageId: string, reason?: string): Promise<void> {
    await this.request(`/channels/${channelId}/messages/${messageId}/reactions`, {
      method: 'DELETE',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async removeAllReactionsForEmoji(
    channelId: string,
    messageId: string,
    reaction: DiscordReaction,
    reason?: string,
  ): Promise<void> {
    await this.request(`/channels/${channelId}/messages/${messageId}/reactions/${encodeDiscordReaction(reaction)}`, {
      method: 'DELETE',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  // ---- Channels (v0.7) ----

  async fetchChannel(channelId: string): Promise<APIChannel> {
    return this.request<APIChannel>(`/channels/${channelId}`);
  }

  /** Edits channel fields; thread-only options are sent only when provided. */
  async editChannel(
    channelId: string,
    options: DiscordChannelEditOptions,
    reason?: string,
  ): Promise<APIChannel> {
    return this.request<APIChannel>(`/channels/${channelId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(options.name !== undefined ? { name: options.name } : {}),
        ...(options.topic !== undefined ? { topic: options.topic } : {}),
        ...(options.nsfw !== undefined ? { nsfw: options.nsfw } : {}),
        ...(options.rateLimitPerUser !== undefined
          ? { rate_limit_per_user: options.rateLimitPerUser }
          : {}),
        ...(options.archived !== undefined ? { archived: options.archived } : {}),
        ...(options.locked !== undefined ? { locked: options.locked } : {}),
        ...(options.autoArchiveDuration !== undefined
          ? { auto_archive_duration: options.autoArchiveDuration }
          : {}),
      }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async deleteChannel(channelId: string, reason?: string): Promise<void> {
    await this.request(`/channels/${channelId}`, {
      method: 'DELETE',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  /** Follows an announcement channel into the target channel. */
  async followAnnouncementChannel(
    sourceChannelId: string,
    targetChannelId: string,
    reason?: string,
  ): Promise<void> {
    await this.request(`/channels/${sourceChannelId}/followers`, {
      method: 'POST',
      body: JSON.stringify({ webhook_channel_id: targetChannelId }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  // ---- Polls (v0.7) ----

  /** Immediately ends a poll the app authored. */
  async endPoll(channelId: string, messageId: string): Promise<APIMessage> {
    return this.request<APIMessage>(`/channels/${channelId}/polls/${messageId}/expire`, {
      method: 'POST',
    });
  }

  /** Lists users who voted for a poll answer (up to 100 per call). */
  async fetchPollAnswerVoters(
    channelId: string,
    messageId: string,
    answerId: number,
  ): Promise<APIUser[]> {
    return this.request<APIUser[]>(
      `/channels/${channelId}/polls/${messageId}/answers/${answerId}/voters`,
    );
  }

  // ---- Guild basics (v0.8) ----

  async fetchGuild(guildId: string, withCounts = false): Promise<APIGuild> {
    return this.request<APIGuild>(
      `/guilds/${guildId}${withCounts ? '?with_counts=true' : ''}`,
    );
  }

  async listGuildChannels(guildId: string): Promise<APIChannel[]> {
    return this.request<APIChannel[]>(`/guilds/${guildId}/channels`);
  }

  // ---- Members & moderation (v0.8) ----

  async fetchMember(guildId: string, userId: string): Promise<APIGuildMember> {
    return this.request<APIGuildMember>(`/guilds/${guildId}/members/${userId}`);
  }

  async listMembers(
    guildId: string,
    options: { limit?: number; after?: string } = {},
  ): Promise<APIGuildMember[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.after) params.set('after', options.after);
    const query = params.size > 0 ? `?${params.toString()}` : '';

    return this.request<APIGuildMember[]>(`/guilds/${guildId}/members${query}`);
  }

  async kickMember(guildId: string, userId: string, reason?: string): Promise<void> {
    await this.request(`/guilds/${guildId}/members/${userId}`, {
      method: 'DELETE',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  /** Bans a member; `deleteMessageSeconds` removes up to 7 days of messages. */
  async banMember(
    guildId: string,
    userId: string,
    options: { deleteMessageSeconds?: number; reason?: string } = {},
  ): Promise<void> {
    const { deleteMessageSeconds, reason } = options;
    await this.request(`/guilds/${guildId}/bans/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...(deleteMessageSeconds !== undefined
          ? { delete_message_seconds: deleteMessageSeconds }
          : {}),
      }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async unbanMember(guildId: string, userId: string, reason?: string): Promise<void> {
    await this.request(`/guilds/${guildId}/bans/${userId}`, {
      method: 'DELETE',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async listBans(guildId: string): Promise<APIBan[]> {
    return this.request<APIBan[]>(`/guilds/${guildId}/bans`);
  }

  async editMember(
    guildId: string,
    userId: string,
    options: DiscordMemberEditOptions,
    reason?: string,
  ): Promise<APIGuildMember> {
    return this.request<APIGuildMember>(`/guilds/${guildId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(options.nick !== undefined ? { nick: options.nick } : {}),
        ...(options.roles !== undefined ? { roles: options.roles } : {}),
        ...(options.communicationDisabledUntil !== undefined
          ? { communication_disabled_until: options.communicationDisabledUntil }
          : {}),
      }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  /** Times out a member for the given duration (ms); null clears the timeout. */
  timeoutMember(
    guildId: string,
    userId: string,
    durationMs: number | null,
    reason?: string,
  ): Promise<APIGuildMember> {
    const communicationDisabledUntil =
      durationMs === null ? null : new Date(Date.now() + durationMs).toISOString();

    return this.editMember(
      guildId,
      userId,
      { communicationDisabledUntil },
      reason,
    );
  }

  // ---- Roles (v0.8) ----

  async listRoles(guildId: string): Promise<APIRole[]> {
    return this.request<APIRole[]>(`/guilds/${guildId}/roles`);
  }

  async createRole(
    guildId: string,
    options: DiscordRoleOptions,
    reason?: string,
  ): Promise<APIRole> {
    return this.request<APIRole>(`/guilds/${guildId}/roles`, {
      method: 'POST',
      body: JSON.stringify({
        ...(options.name !== undefined ? { name: options.name } : {}),
        ...(options.permissions !== undefined ? { permissions: options.permissions } : {}),
        ...(options.color !== undefined ? { color: options.color } : {}),
        ...(options.hoist !== undefined ? { hoist: options.hoist } : {}),
        ...(options.mentionable !== undefined ? { mentionable: options.mentionable } : {}),
        ...(options.unicodeEmoji !== undefined ? { unicode_emoji: options.unicodeEmoji } : {}),
      }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async editRole(
    guildId: string,
    roleId: string,
    options: DiscordRoleOptions,
    reason?: string,
  ): Promise<APIRole> {
    return this.request<APIRole>(`/guilds/${guildId}/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(options.name !== undefined ? { name: options.name } : {}),
        ...(options.permissions !== undefined ? { permissions: options.permissions } : {}),
        ...(options.color !== undefined ? { color: options.color } : {}),
        ...(options.hoist !== undefined ? { hoist: options.hoist } : {}),
        ...(options.mentionable !== undefined ? { mentionable: options.mentionable } : {}),
        ...(options.unicodeEmoji !== undefined ? { unicode_emoji: options.unicodeEmoji } : {}),
      }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async deleteRole(guildId: string, roleId: string, reason?: string): Promise<void> {
    await this.request(`/guilds/${guildId}/roles/${roleId}`, {
      method: 'DELETE',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  /** Reorders roles; entries are `{ id, position }` pairs. */
  async reorderRoles(
    guildId: string,
    positions: ReadonlyArray<{ id: string; position: number }>,
    reason?: string,
  ): Promise<APIRole[]> {
    return this.request<APIRole[]>(`/guilds/${guildId}/roles`, {
      method: 'PATCH',
      body: JSON.stringify(positions),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async addRoleToMember(
    guildId: string,
    userId: string,
    roleId: string,
    reason?: string,
  ): Promise<void> {
    await this.request(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      method: 'PUT',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async removeRoleFromMember(
    guildId: string,
    userId: string,
    roleId: string,
    reason?: string,
  ): Promise<void> {
    await this.request(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      method: 'DELETE',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  // ---- Emoji & stickers (v0.8) ----

  async listGuildEmojis(guildId: string): Promise<APIEmoji[]> {
    return this.request<APIEmoji[]>(`/guilds/${guildId}/emojis`);
  }

  async fetchGuildEmoji(guildId: string, emojiId: string): Promise<APIEmoji> {
    return this.request<APIEmoji>(`/guilds/${guildId}/emojis/${emojiId}`);
  }

  /** Creates an emoji; `imageData` must be a data URI (base64). */
  async createGuildEmoji(
    guildId: string,
    options: { name: string; imageData: string; roles?: string[] },
    reason?: string,
  ): Promise<APIEmoji> {
    return this.request<APIEmoji>(`/guilds/${guildId}/emojis`, {
      method: 'POST',
      body: JSON.stringify({
        name: options.name,
        image: options.imageData,
        ...(options.roles ? { roles: options.roles } : {}),
      }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async editGuildEmoji(
    guildId: string,
    emojiId: string,
    options: { name?: string; roles?: string[] },
    reason?: string,
  ): Promise<APIEmoji> {
    return this.request<APIEmoji>(`/guilds/${guildId}/emojis/${emojiId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(options.name !== undefined ? { name: options.name } : {}),
        ...(options.roles !== undefined ? { roles: options.roles } : {}),
      }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async deleteGuildEmoji(guildId: string, emojiId: string, reason?: string): Promise<void> {
    await this.request(`/guilds/${guildId}/emojis/${emojiId}`, {
      method: 'DELETE',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async listGuildStickers(guildId: string): Promise<APISticker[]> {
    return this.request<APISticker[]>(`/guilds/${guildId}/stickers`);
  }

  async fetchSticker(stickerId: string): Promise<APISticker> {
    return this.request<APISticker>(`/stickers/${stickerId}`);
  }

  async deleteGuildSticker(guildId: string, stickerId: string, reason?: string): Promise<void> {
    await this.request(`/guilds/${guildId}/stickers/${stickerId}`, {
      method: 'DELETE',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  // ---- Webhooks (v0.8) ----

  async listChannelWebhooks(channelId: string): Promise<APIWebhook[]> {
    return this.request<APIWebhook[]>(`/channels/${channelId}/webhooks`);
  }

  async listGuildWebhooks(guildId: string): Promise<APIWebhook[]> {
    return this.request<APIWebhook[]>(`/guilds/${guildId}/webhooks`);
  }

  async createWebhook(
    channelId: string,
    options: { name: string; avatar?: string },
    reason?: string,
  ): Promise<APIWebhook> {
    return this.request<APIWebhook>(`/channels/${channelId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify({
        name: options.name,
        ...(options.avatar ? { avatar: options.avatar } : {}),
      }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async fetchWebhook(webhookId: string): Promise<APIWebhook> {
    return this.request<APIWebhook>(`/webhooks/${webhookId}`);
  }

  /** Fetches a webhook using only its token — no bot auth required. */
  async fetchWebhookWithToken(webhookId: string, webhookToken: string): Promise<APIWebhook> {
    return this.request<APIWebhook>(`/webhooks/${webhookId}/${webhookToken}`, {
      authenticated: false,
    });
  }

  async editWebhook(
    webhookId: string,
    options: { name?: string; avatar?: string | null; channelId?: string },
    reason?: string,
  ): Promise<APIWebhook> {
    return this.request<APIWebhook>(`/webhooks/${webhookId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(options.name !== undefined ? { name: options.name } : {}),
        ...(options.avatar !== undefined ? { avatar: options.avatar } : {}),
        ...(options.channelId !== undefined ? { channel_id: options.channelId } : {}),
      }),
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  async deleteWebhook(webhookId: string, reason?: string): Promise<void> {
    await this.request(`/webhooks/${webhookId}`, {
      method: 'DELETE',
      headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
    });
  }

  // ---- Entitlements & SKUs (v0.8) ----

  async listSKUs(): Promise<APISKU[]> {
    return this.request<APISKU[]>(`/applications/${this.options.applicationId}/skus`);
  }

  async listEntitlements(
    options: {
      userId?: string;
      skuIds?: readonly string[];
      guildId?: string;
      before?: string;
      after?: string;
      limit?: number;
      excludeEnded?: boolean;
    } = {},
  ): Promise<APIEntitlement[]> {
    const params = new URLSearchParams();
    if (options.userId) params.set('user_id', options.userId);
    if (options.skuIds?.length) params.set('sku_ids', options.skuIds.join(','));
    if (options.guildId) params.set('guild_id', options.guildId);
    if (options.before) params.set('before', options.before);
    if (options.after) params.set('after', options.after);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.excludeEnded !== undefined)
      params.set('exclude_ended', String(options.excludeEnded));

    const query = params.size > 0 ? `?${params.toString()}` : '';
    return this.request<APIEntitlement[]>(
      `/applications/${this.options.applicationId}/entitlements${query}`,
    );
  }

  /** Consumes a one-time-purchase entitlement. */
  async consumeEntitlement(entitlementId: string): Promise<void> {
    await this.request(`/applications/${this.options.applicationId}/entitlements/${entitlementId}/consume`, {
      method: 'POST',
    });
  }

  // ---- Application command permissions (v0.8) ----

  async getCommandPermissions(
    guildId: string,
    commandId: string,
  ): Promise<RESTPutAPIApplicationCommandPermissionsJSONBody> {
    return this.request(
      `/applications/${this.options.applicationId}/guilds/${guildId}/commands/${commandId}/permissions`,
    );
  }

  /** Fully replaces a command's permission overrides for a guild. */
  async setCommandPermissions(
    guildId: string,
    commandId: string,
    permissions: ReadonlyArray<{
      id: string;
      type: ApplicationCommandPermissionType;
      permission: boolean;
    }>,
    reason?: string,
  ): Promise<void> {
    await this.request(
      `/applications/${this.options.applicationId}/guilds/${guildId}/commands/${commandId}/permissions`,
      {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
        headers: reason ? { 'X-Audit-Log-Reason': reason } : undefined,
      },
    );
  }

  addReaction(
    channelId: string,
    messageId: string,
    reaction: DiscordReaction,
  ): Promise<void> {
    return this.request<void>(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeDiscordReaction(reaction)}/@me`,
      {
        method: 'PUT',
      },
    );
  }

  webhook(id: string, token: string): DiscordWebhook {
    return new DiscordWebhook(this, id, token);
  }

  putApplicationRoleConnectionMetadata(
    body: RESTPutAPIApplicationRoleConnectionMetadataJSONBody,
  ): Promise<RESTPutAPIApplicationRoleConnectionMetadataResult> {
    return this.request(`/applications/${this.options.applicationId}/role-connections/metadata`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  // ---- Application Identity profiles / Game Stats Widgets ----

  /**
   * Writes a player's Game Stats profile.
   *
   * `data` is **fully replaced** whenever it is present, so omitting a stat
   * deletes it; omit `data` entirely to leave stored stats untouched. Prefer
   * {@link sendGameStats} with `mode: "merge"` when patching individual stats.
   *
   * Requires a bot token, the `application_identities.write` OAuth2 scope on
   * the target user, and a *claimed* game with a configured widget.
   *
   * @returns the created profile on the first write (201), `undefined` on
   * subsequent updates (204).
   * @see {@link https://docs.discord.com/developers/resources/application-identity-profile}
   */
  updateIdentityProfile(
    userId: string,
    providerIssuedUserId: string,
    body: UpdateIdentityProfileBody,
  ): Promise<ApplicationIdentityProfile | undefined> {
    return this.request<ApplicationIdentityProfile | undefined>(
      `${this.identityPath(userId, providerIssuedUserId)}/profile`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  /**
   * Reads a player's stored Game Stats profile.
   *
   * `metadata` is returned by reads; the documented update parameters are only
   * `username` and `data`.
   */
  getIdentityProfile(
    userId: string,
    providerIssuedUserId: string,
  ): Promise<ApplicationIdentityProfile> {
    return this.request<ApplicationIdentityProfile>(
      `${this.identityPath(userId, providerIssuedUserId)}/profile`,
    );
  }

  /** Lists a user's application identities for this application (no profile data). */
  listIdentitiesByUserId(userId: string): Promise<APIApplicationIdentity[]> {
    return this.request<{ identities?: APIApplicationIdentity[] }>(
      `/applications/${this.options.applicationId}/users/${userId}/identities`,
    ).then((result) => result.identities ?? []);
  }

  /** Resolves the Discord user behind one of your external IDs (no profile data). */
  listIdentitiesByExternalId(
    providerType: string,
    providerIssuedUserId: string,
    providerId?: string,
  ): Promise<APIApplicationIdentity[]> {
    const params = new URLSearchParams();
    if (providerId !== undefined) params.set('provider_id', providerId);
    const query = params.size > 0 ? `?${params.toString()}` : '';

    return this.request<{ identities?: APIApplicationIdentity[] }>(
      `/applications/${this.options.applicationId}/identities/${encodeURIComponent(providerType)}/${encodeURIComponent(providerIssuedUserId)}${query}`,
    ).then((result) => result.identities ?? []);
  }

  /**
   * Deletes one application identity and its profile data.
   *
   * Blocked when it would remove the user's last account-linking identity.
   * Useful when a stale `provider_issued_user_id` prevents writing stats.
   */
  async deleteIdentity(
    userId: string,
    providerType: string,
    providerIssuedUserId: string,
    providerId?: string,
  ): Promise<void> {
    await this.request(
      `/applications/${this.options.applicationId}/users/${userId}/identities/${encodeURIComponent(providerType)}/${encodeURIComponent(providerIssuedUserId)}`,
      {
        method: 'DELETE',
        body: providerId !== undefined ? JSON.stringify({ provider_id: providerId }) : undefined,
      },
    );
  }

  /**
   * Sends Game Stats for a player, validating Discord's limits client-side.
   *
   * ```ts
   * await rest.sendGameStats({
   *   userId,                     // Discord user id
   *   providerIssuedUserId,       // your own player id
   *   primary: { season: 'Season 3', rank_name: 'Silver', playtime_hours: 69.41 },
   *   dynamic: [{ type: 2, name: 'win_streak', value: 5 }],
   * });
   * ```
   *
   * Resolves with `undefined` **without issuing any request** when there is
   * nothing to write — no `username`, `primary` or `dynamic`. An empty PATCH
   * would otherwise still create the Application Identity record.
   *
   * @throws {ApplicationIdentityProfileError} when the payload would exceed the
   * 10 KB / 30-field / length limits, or references a media URL Discord cannot fetch.
   */
  async sendGameStats(
    options: SendGameStatsOptions,
  ): Promise<ApplicationIdentityProfile | undefined> {
    const {
      userId,
      providerIssuedUserId,
      username,
      primary,
      dynamic,
      mode = 'replace',
      allowPrivateMediaUrls,
    } = options;

    // Nothing to write: skip every request. A PATCH with an empty body would
    // still create the Application Identity record on Discord's side, and merge
    // mode would additionally spend a GET discovering there is nothing to merge.
    if (username === undefined && primary === undefined && dynamic === undefined) {
      return undefined;
    }

    if (username !== undefined) assertUsernameLength(username);

    const data =
      mode === 'merge'
        ? mergeProfileData(
            (await this.readIdentityProfileOrUndefined(userId, providerIssuedUserId))?.data,
            { primary, dynamic },
          )
        : buildProfileData({ primary, dynamic });

    if (data) assertProfileDataWithinLimits(data, { allowPrivateMediaUrls });

    const body: UpdateIdentityProfileBody = {};
    if (username !== undefined) body.username = username;
    if (data !== undefined) body.data = data;

    return this.updateIdentityProfile(userId, providerIssuedUserId, body);
  }

  /**
   * Reads a profile for merge mode, treating a missing identity (404) as empty
   * rather than surfacing an error. Branches on the typed status instead of the
   * error message so a message-format change cannot break merge mode.
   */
  private async readIdentityProfileOrUndefined(
    userId: string,
    providerIssuedUserId: string,
  ): Promise<ApplicationIdentityProfile | undefined> {
    try {
      return await this.getIdentityProfile(userId, providerIssuedUserId);
    } catch (error) {
      if (error instanceof DiscordRestApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  private identityPath(userId: string, providerIssuedUserId: string): string {
    return `/applications/${this.options.applicationId}/users/${userId}/identities/${encodeURIComponent(providerIssuedUserId)}`;
  }

  // ---- Lobbies & Linked Channels ----

  /**
   * Creates a lobby. Social SDK clients cannot join a lobby created this way —
   * see {@link createOrJoinLobby} for the SDK-compatible flow.
   *
   * @see {@link https://docs.discord.com/developers/resources/lobby}
   */
  createLobby(options: LobbyCreateOptions = {}): Promise<APILobby> {
    return this.request<APILobby>('/lobbies', {
      method: 'POST',
      body: JSON.stringify({
        ...(options.metadata ? { metadata: options.metadata } : {}),
        ...(options.members ? { members: options.members } : {}),
        ...(options.idleTimeoutSeconds !== undefined
          ? { idle_timeout_seconds: options.idleTimeoutSeconds }
          : {}),
      }),
    });
  }

  /**
   * Creates a lobby for a `secret`, or joins the caller to the existing one.
   *
   * Needs a **Bearer** user token with the `sdk.social_layer` scope, not the bot
   * token — pass it as `userToken`.
   */
  createOrJoinLobby(userToken: string, options: LobbyCreateOrJoinOptions): Promise<APILobby> {
    return this.request<APILobby>('/lobbies', {
      method: 'PUT',
      body: JSON.stringify({
        secret: options.secret,
        ...(options.idleTimeoutSeconds !== undefined
          ? { idle_timeout_seconds: options.idleTimeoutSeconds }
          : {}),
        ...(options.lobbyMetadata ? { lobby_metadata: options.lobbyMetadata } : {}),
        ...(options.memberMetadata ? { member_metadata: options.memberMetadata } : {}),
      }),
      ...this.asUser(userToken),
    });
  }

  /** Reads a lobby, including its `linked_channel` when one is linked. */
  getLobby(lobbyId: string): Promise<APILobby> {
    return this.request<APILobby>(`/lobbies/${lobbyId}`);
  }

  /** Replaces lobby metadata, its member list and/or its idle timeout. */
  modifyLobby(lobbyId: string, options: LobbyModifyOptions = {}): Promise<APILobby> {
    return this.request<APILobby>(`/lobbies/${lobbyId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(options.metadata ? { metadata: options.metadata } : {}),
        ...(options.members ? { members: options.members } : {}),
        ...(options.idleTimeoutSeconds !== undefined
          ? { idle_timeout_seconds: options.idleTimeoutSeconds }
          : {}),
      }),
    });
  }

  /** Deletes a lobby. Safe to call when it is already gone. */
  async deleteLobby(lobbyId: string): Promise<void> {
    await this.request(`/lobbies/${lobbyId}`, { method: 'DELETE' });
  }

  /**
   * Adds a user to a lobby, or updates them when they are already a member.
   *
   * Pass `flags: LobbyMemberFlags.CanLinkLobby` to let that user configure the
   * lobby's linked channel — grant it only to the lobby owner/administrator.
   */
  addLobbyMember(
    lobbyId: string,
    userId: string,
    options: Omit<LobbyMemberInput, 'id'> = {},
  ): Promise<APILobbyMember> {
    return this.request<APILobbyMember>(`/lobbies/${lobbyId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
        ...(options.flags !== undefined ? { flags: options.flags } : {}),
        ...(options.additional_name !== undefined
          ? { additional_name: options.additional_name }
          : {}),
      }),
    });
  }

  /**
   * Upserts or removes up to 25 members in one request.
   *
   * Members are upserted unless `remove_member: true`. Users failing permission
   * checks — or already at the per-application lobby cap and not already a
   * member — are **silently dropped**, so treat the response as authoritative.
   */
  bulkUpdateLobbyMembers(
    lobbyId: string,
    members: LobbyMemberUpdateInput[],
  ): Promise<APILobbyMember[]> {
    return this.request<APILobbyMember[]>(`/lobbies/${lobbyId}/members/bulk`, {
      method: 'POST',
      body: JSON.stringify(members),
    });
  }

  /** Removes a member. Safe when they already left, but fails if the lobby is gone. */
  async removeLobbyMember(lobbyId: string, userId: string): Promise<void> {
    await this.request(`/lobbies/${lobbyId}/members/${userId}`, { method: 'DELETE' });
  }

  /**
   * Links a guild text channel to a lobby.
   *
   * - Needs a **Bearer** user token: the acting user must be a lobby member with
   *   {@link LobbyMemberFlags.CanLinkLobby}.
   * - The channel must be a guild text channel, not age-restricted, and not
   *   already linked to another lobby.
   * - **Every lobby member can read and post** in the linked channel in-game,
   *   even when it is private in Discord. Warn the user performing the link.
   * - Capped at 20 calls per 2 hours per application in development.
   *
   * @returns the lobby, with `linked_channel` populated.
   */
  linkChannelToLobby(lobbyId: string, channelId: string, userToken: string): Promise<APILobby> {
    return this.request<APILobby>(`/lobbies/${lobbyId}/channel-linking`, {
      method: 'PATCH',
      body: JSON.stringify({ channel_id: channelId }),
      ...this.asUser(userToken),
    });
  }

  /**
   * Unlinks the lobby's channel by sending the same endpoint an empty body.
   *
   * Needs a **Bearer** user token whose user has the `CanLinkLobby` flag — but
   * **no** Discord-side channel permissions.
   */
  unlinkChannelFromLobby(lobbyId: string, userToken: string): Promise<APILobby> {
    return this.request<APILobby>(`/lobbies/${lobbyId}/channel-linking`, {
      method: 'PATCH',
      body: JSON.stringify({}),
      ...this.asUser(userToken),
    });
  }

  /**
   * Sends a message to a lobby. Forwarded to the linked channel when one is
   * linked; if forwarding fails (e.g. AutoMod) the lobby message is still
   * delivered to other members.
   *
   * Needs a **Bearer** user token — the caller must be a lobby member.
   */
  sendLobbyMessage(
    lobbyId: string,
    options: LobbyMessageSendOptions,
    userToken: string,
  ): Promise<APILobbyMessage> {
    return this.request<APILobbyMessage>(`/lobbies/${lobbyId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: options.content,
        ...(options.metadata ? { metadata: options.metadata } : {}),
        ...(options.flags !== undefined ? { flags: options.flags } : {}),
      }),
      ...this.asUser(userToken),
    });
  }

  /** Lists recent lobby messages (1–200, default 50) for a member of the lobby. */
  getLobbyMessages(
    lobbyId: string,
    userToken: string,
    options: { limit?: number } = {},
  ): Promise<APILobbyMessage[]> {
    const query = options.limit !== undefined ? `?limit=${options.limit}` : '';
    return this.request<APILobbyMessage[]>(`/lobbies/${lobbyId}/messages${query}`, {
      ...this.asUser(userToken),
    });
  }

  /**
   * Creates a single-use invite to the lobby's linked channel for the calling
   * user — the equivalent of the SDK's `JoinLinkedLobbyGuild`.
   *
   * Needs a **Bearer** user token and a linked channel. Expires after one hour.
   * Only users with a real linked Discord account can join; provisional accounts
   * must link first. Note that server admins cannot restrict who may join this
   * way — any lobby member can mint an invite.
   */
  createLobbyChannelInviteForSelf(
    lobbyId: string,
    userToken: string,
  ): Promise<APILobbyInvite> {
    return this.request<APILobbyInvite>(`/lobbies/${lobbyId}/members/@me/invites`, {
      method: 'POST',
      ...this.asUser(userToken),
    });
  }

  /** Creates a linked-channel invite on behalf of the application, for one user. */
  createLobbyChannelInviteForUser(lobbyId: string, userId: string): Promise<APILobbyInvite> {
    return this.request<APILobbyInvite>(`/lobbies/${lobbyId}/members/${userId}/invites`, {
      method: 'POST',
    });
  }

  /**
   * Switches authenticated requests to a **Bearer** user token.
   *
   * Lobby operations acting on behalf of a user need the user's token with the
   * `sdk.social_layer` scope; the default bot token is rejected. `authenticated:
   * false` suppresses the `Authorization: Bot …` header, and the explicit header
   * is merged last so it wins.
   */
  private asUser(userToken: string): Pick<RequestInit, 'headers'> & { authenticated: false } {
    return { authenticated: false, headers: { Authorization: `Bearer ${userToken}` } };
  }
}

function getDefaultContentTypeHeader(body: RequestInit['body']): HeadersInit {
  // A body-less request (DELETE, a GET with no payload) must not claim to be
  // JSON: strict servers reject a Content-Type that does not match the body.
  if (body === undefined || body === null) return {};
  return body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
}

function encodeDiscordReaction(reaction: DiscordReaction): string {
  if (typeof reaction !== 'string') {
    return encodeURIComponent(reaction.id ? `${reaction.name}:${reaction.id}` : reaction.name);
  }

  const trimmed = reaction.trim();

  const customEmojiMatch = trimmed.match(/^<a?:([^:>]+):(\d+)>$/);
  if (customEmojiMatch) {
    const [, name, id] = customEmojiMatch;
    return encodeURIComponent(`${name}:${id}`);
  }

  if (/^[^:\s]+:\d+$/.test(trimmed)) {
    return encodeURIComponent(trimmed);
  }

  return encodeURIComponent(trimmed);
}
