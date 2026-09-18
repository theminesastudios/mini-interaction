# Changelog

## Unreleased

### Added
- **Lobbies & Linked Channels**: `DiscordRestClient.createLobby`, `createOrJoinLobby`, `getLobby`, `modifyLobby`, `deleteLobby`, `addLobbyMember`, `bulkUpdateLobbyMembers`, `removeLobbyMember`, `linkChannelToLobby`, `unlinkChannelFromLobby`, `sendLobbyMessage`, `getLobbyMessages`, `createLobbyChannelInviteForSelf` and `createLobbyChannelInviteForUser`. User-scoped calls (channel linking, lobby messages, self-invites, create-or-join) take a Bearer user token with the `sdk.social_layer` scope instead of the bot token.
- `src/lobby/Lobby.ts` with lobby/member/message types, `LobbyMemberFlags.CanLinkLobby`, `LOBBY_LIMITS`, the documented `LOBBY_DEVELOPMENT_RATE_LIMITS` (channel linking is capped at 20 calls per 2 hours in development), and `canLinkLobby` / `linkedChannelId` / `metadataLength` helpers.
- **Webhook Events** support: `WebhookEventRouter` (per-event handlers with a typed `event.data`, `onAny` fallback, middleware and an error hook), `WebhookEventEndpoint` implementing Discord's documented ack contract (`204` acked, `401` bad signature, `400` unparseable, `500` handler failure) with a Fetch-API `handleFetch` helper and an optional `waitUntil` hand-off, `verifyWebhookEventRequest` for Ed25519 verification, and typed payloads for all 12 event names — `APPLICATION_*`, `ENTITLEMENT_*`, `LOBBY_MESSAGE_*` and `GAME_DIRECT_MESSAGE_*`, including the Social SDK lobby message and provisional-DM message shapes.
- **Game Stats Widgets** support via the Application Identity Profile API: `DiscordRestClient.updateIdentityProfile`, `getIdentityProfile`, `listIdentitiesByUserId`, `listIdentitiesByExternalId`, `deleteIdentity`, plus a validating `sendGameStats` helper whose `mode: 'merge'` reads first so stats you omit survive Discord's replace-on-PATCH semantics.
- `src/identity/ApplicationIdentityProfile.ts`: typed primary and dynamic profile fields, Discord's documented limits (10 KB serialized `data`, 30 dynamic fields, 100-character string values), client-side validation that throws `ApplicationIdentityProfileError` with a machine-readable `code`, and `isPublicMediaUrl` for widget media the unfurler cannot reach.
- **OAuth2Builder** with a fully typed, JSDoc'd scope registry: all 32 Discord scopes as `OAuth2Scope`, per-scope `OAuth2ScopeMetadata`/`OAuth2ScopeDescriptions` copy for rendering a consent screen, `OAuth2ScopeCategories`, `OAuth2ScopePresets` (including the Social SDK's presence and communication sets), `RestrictedOAuth2Scopes`, and a fluent builder that validates the scope/grant combination before a user ever sees a broken consent screen. Token operations (`exchangeCode`, `refresh`, `clientCredentials`, `revokeToken`, `getAuthorizationInfo`) are typed (`OAuth2TokenResponse`, `OAuth2AuthorizationInfo`) and throw `OAuth2BuilderError` / `OAuth2RequestError` with machine-readable `code`/`error` fields.

### Fixed
- `DiscordRestClient` throws `DiscordRestApiError` for non-2xx responses, exposing `status`, `method`, `path` and `body`. The message format is unchanged, so existing logging keeps working while callers can branch on the status.
- `sendGameStats` no longer issues any request when there is no `username`, `primary` or `dynamic` — an empty PATCH previously created the Application Identity record as a side effect, and merge mode spent an extra GET.
- `DiscordRestClient` no longer sends `Content-Type: application/json` on requests without a body, which some strict servers and proxies reject.
- `isPublicMediaUrl` rejects trailing-dot FQDNs (`localhost.`) and IPv6 link-local/unique-local literals (`[fe80::…]`, `[fd00::…]`) that Discord's unfurler cannot reach.

### Removed
- The `template/` starter app.

## 0.9.0 - 2026-08-24
### Added
- Bucket-aware rate limiting in `DiscordRestClient`: learns `X-RateLimit-*` budgets per route, waits for bucket resets before spending calls, and honours `retry_after` from 429 bodies.
- Snowflake utilities: `snowflakeToTimestamp`, `snowflakeToDate`, `isValidSnowflake`, `DISCORD_EPOCH`.
- Localisation helpers: `createLocalizationMap` (fully typed against Discord locales), `mergeLocalizationMaps`, and `resolveLocalization` with exact → base-language → default fallback.
- CI workflow (typecheck + tests + build on Node 20/22) and an npm publish workflow triggered by version tags.
### Added
- Guild basics: `fetchGuild` (with counts), `listGuildChannels`.
- Members & moderation: `fetchMember`, `listMembers`, `kickMember`, `banMember`/`unbanMember`, `listBans`, `editMember`, `timeoutMember`.
- Roles: `listRoles`, `createRole`, `editRole`, `deleteRole`, `reorderRoles`, `addRoleToMember`, `removeRoleFromMember`.
- Emoji & stickers: `listGuildEmojis`, `fetchGuildEmoji`, `createGuildEmoji`, `editGuildEmoji`, `deleteGuildEmoji`, `listGuildStickers`, `fetchSticker`, `deleteGuildSticker`.
- Webhooks management: `listChannelWebhooks`, `listGuildWebhooks`, `createWebhook`, `fetchWebhook`, `fetchWebhookWithToken`, `editWebhook`, `deleteWebhook`.
- Monetization: `listSKUs`, `listEntitlements`, `consumeEntitlement`.
- Command permissions: `getCommandPermissions`, `setCommandPermissions`.
### Added
- Message reads & bulk operations: `fetchMessage`, `fetchMessages` (before/after/around pagination), `bulkDeleteMessages` (2–100).
- Typing & reaction management: `triggerTyping`, `fetchReactors`, `removeOwnReaction`, `removeUserReaction`, `removeAllReactions`, `removeAllReactionsForEmoji`.
- Channel endpoints: `fetchChannel`, `editChannel` (incl. thread archive/lock), `deleteChannel`, `followAnnouncementChannel`.
- Polls: `poll` option on all message sends, `endPoll`, and `fetchPollAnswerVoters`.
- CDN URL builders: `avatarURL`, `defaultAvatarURL`, `userBannerURL`, `guildIconURL`, `guildBannerURL`, `guildSplashURL`, `emojiURL`, `stickerURL`, `attachmentURL`.
### Added
- **Router v2** (`InteractionRouter`): handlers now receive wrapped interactions with option resolvers and reply helpers; context menus and Primary Entry Point commands route via `onUserCommand`, `onMessageCommand` and `onEntryPointCommand`.
- Autocomplete support: `router.onAutocomplete()` with `AutocompleteContext` (`getFocusedOption()`, `respond(choices)` producing the `type: 8` response).
- Pattern-based component custom ids: glob prefixes (`config:*`, longest match wins) and regex matchers, with exact ids taking priority.
- Router middleware (`router.use`) and error hooks (`router.onError`), plus a fallback handler (`router.onFallback`).
- Modal submit getters for new form components: `getRadioGroupValue`, `getCheckboxGroupValues`, `getCheckboxValue`, `getFileUploadValues`.
- Follow-up deletion: `rest.deleteOriginal`/`deleteFollowup` and `ctx.deleteOriginal()`/`ctx.deleteFollowup()`.
- `MIGRATION.md` covering legacy-to-modern stack migration and v0.5+ breaking changes.

## 0.5.0 - 2026-08-24

### Breaking changes

- Reworked interaction architecture around `core/http`, `core/interactions`, `router`, and `compat` modules.
- Builder validation now throws hard `ValidationError` for out-of-spec payloads.
- `ModalBuilder` no longer auto-wraps arbitrary components into action rows; top-level components must be ActionRow, TextDisplay or Label.
- Radio/checkbox contracts now match Discord's real components: RadioGroup (type 21), CheckboxGroup (type 22) and Checkbox (type 23). The previous `2001`/`2002` type values were invalid and rejected by the API.
- `CheckboxBuilder` now builds the single-checkbox component (`custom_id` + `default` only). The former options-array model moved to the new `CheckboxGroupBuilder` (options 2-10, `min_values`/`max_values`).

### Added

- Discord markdown helpers: `bold`, `italic`, `underline`, `strikethrough`, `inlineCode`, `codeBlock`, `blockQuote`, `multilineBlockQuote`, `spoiler`, `subtext`, `heading`, `bulletList`, `numberedList`, `maskLink`, `timestamp`, `userMention`, `roleMention`, `channelMention`, `slashCommandMention` and `escapeMarkdown`.
- `DiscordRestClient.createThread` for creating threads directly in a channel (forum/standalone threads) alongside the existing message-based `startThread`.
- `DiscordRestClient.editMessage`, `deleteMessage`, `pinMessage`, `unpinMessage`, `crosspostMessage` and `sendWebhookMessage` convenience methods.
- `DiscordSentMessage.edit`, `delete`, `reply` (with `message_reference` support), `pin`, `unpin` and `crosspost` helpers.
- `DiscordWebhook.edit` and `DiscordWebhook.delete` for webhook-sent messages.
- Reply support via `messageReference` on all message send options.
- `DiscordRestClient` with retry + rate-limit behavior.
- `InteractionContext` lifecycle helpers for reply/defer/showModal/edit/followUp.
- `InteractionRouter` command/component/modal dispatch.
- Architecture docs.

### Fixed

- `RadioBuilder` now enforces Discord's 2-10 option limit and no longer serialises `disabled`, which is not accepted on modal radio groups. Option emoji was dropped per the component spec.
- Modal select menus (`Modal*SelectMenuBuilder`) no longer serialise `disabled` (not valid in modals) and validate `placeholder` against the 150-character limit; message-side select builders gained the same placeholder check.
- `COMPONENTS_V2_TYPES` detection now only contains real message Components V2 types (Section, TextDisplay, Thumbnail, MediaGallery, File, Separator, Container); modal-only Label/FileUpload/RadioGroup/CheckboxGroup were removed from message V2 detection.
- Sending a Components V2 message with `content`, `embeds` or `sticker_ids` now throws instead of producing an API error.
