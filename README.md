# 🌌 Mini Interaction

> **Sleek, Modular, and Type-Safe Discord Interactions Framework.**

Mini Interaction is a high-performance framework designed for building Discord HTTP/Webhook-based bots. It provides a modular architecture that separates concerns, making your bot easier to maintain, test, and scale.

---

## ✨ Features

- **🚀 Modular Router**: Easily map commands, components, and modals to handlers.
- **⚡ Core V10 Engine**: Native support for Discord API v10 payloads.
- **🛡️ Type Safety**: Full TypeScript support with rich autocompletion.
- **🧩 Fluent Builders**: Construct complex messages and components with a premium API.
- **🔐 Integrated OAuth**: Simple handlers for Discord OAuth2 flows, plus an `OAuth2Builder` with a typed, documented scope registry.
- **🔗 Linked Channels**: Bind lobbies to guild text channels, relay messages both ways, and mint server invites.
- **🎮 Game Stats Widgets**: Push player stats onto Discord profiles via the Application Identity Profile API.
- **📨 Webhook Events**: Typed, signature-verified HTTP events with an ack-correct endpoint.
- **🗃️ Mini Database**: Lightweight, document-based storage integration.

---

## 📦 Installation

```bash
npm install @minesa-org/mini-interaction
```

---

## 🛠️ Quick Start

Mini Interaction uses a modular approach with a dedicated Router and Context.

### 1. Define your Router
```ts
import { InteractionRouter } from '@minesa-org/mini-interaction';

const router = new InteractionRouter();

// Register a slash command
router.onCommand('ping', async (interaction, ctx) => {
  return ctx.reply({ content: '🏓 Pong!' });
});

// Register a component handler
router.onComponent('my_button', async (interaction, ctx) => {
  return ctx.reply({ content: 'Button clicked!', ephemeral: true });
});
```

### 2. Handle Interactions
```ts
import { 
  verifyAndParseInteraction, 
  InteractionContext, 
  DiscordRestClient 
} from '@minesa-org/mini-interaction';

const rest = new DiscordRestClient({ 
  applicationId: process.env.DISCORD_APP_ID, 
  token: process.env.DISCORD_TOKEN 
});

// In your web server (e.g., Next.js, Vercel, Express)
export async function POST(req) {
  const body = await req.text();
  const signature = req.headers.get('x-signature-ed25519');
  const timestamp = req.headers.get('x-signature-timestamp');

  // Verify and parse the interaction
  const interaction = await verifyAndParseInteraction({
    body,
    signature,
    timestamp,
    publicKey: process.env.DISCORD_PUBLIC_KEY
  });

  if (interaction.type === 1) return Response.json({ type: 1 });

  const ctx = new InteractionContext({ interaction, rest });
  const response = await router.dispatch(interaction, ctx);

  return Response.json(response ?? ctx.deferReply());
}
```

---

## 🎨 Message Builders

Mini Interaction provides a rich set of builders to create beautiful Discord content.

```ts
import { ModalBuilder, TextInputBuilder, TextInputStyle } from '@minesa-org/mini-interaction';

const modal = new ModalBuilder()
  .setCustomId('feedback_form')
  .setTitle('Send us Feedback')
  .addComponents(
    new TextInputBuilder()
      .setCustomId('feedback_text')
      .setLabel('Your Message')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Tell us what you think...')
  );
```

---

## 📡 Advanced Routing

You can organize your handlers into separate modules for better scalability.

```ts
// components/modals.ts
router.onModal('feedback_submit', async (interaction, ctx) => {
  const feedback = interaction.getTextFieldValue('feedback_text');
  // Process feedback...
  return ctx.reply({ content: 'Thank you for your feedback!' });
});
```

---

## 🛡️ Error Handling

Mini Interaction includes built-in validation to ensure your payloads follow Discord's requirements.

```ts
import { ValidationError } from '@minesa-org/mini-interaction';

try {
  const builder = new TextInputBuilder().setCustomId(''); // Too short!
  builder.toJSON();
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(`Validation failed for ${error.component}: ${error.message}`);
  }
}
```

---

## 🔗 Linked Role Metadata

Register application role connection metadata with `mini.registerMetadata(...)`.

```ts
import {
  MiniInteraction,
  RoleConnectionMetadataTypes,
} from '@minesa-org/mini-interaction';

const mini = new MiniInteraction({
  applicationId: process.env.DISCORD_APPLICATION_ID,
});

await mini.registerMetadata(process.env.DISCORD_BOT_TOKEN!, [
  {
    key: 'is_miniapp',
    name: 'Is Mini App?',
    description: 'Is the user an assistant?',
    type: RoleConnectionMetadataTypes.BooleanEqual,
  },
]);
```

Localization maps use `locale -> string` objects for `name_localizations` and `description_localizations`.

```ts
await mini.registerMetadata(process.env.DISCORD_BOT_TOKEN!, [
  {
    key: 'is_miniapp',
    name: 'Is Mini App?',
    description: 'Is the user an assistant?',
    type: RoleConnectionMetadataTypes.BooleanEqual,
    name_localizations: {
      tr: 'Mini Uygulama mi?',
      de: 'Ist Mini-App?',
    },
    description_localizations: {
      tr: 'Kullanici bir assistant mi?',
      de: 'Benutzer ist ein Assistent?',
    },
  },
]);
```

---

## ✍️ Text Formatting

Compose Discord markdown with pure helper functions:

```ts
import {
  bold, italic, heading, codeBlock, spoiler, timestamp,
  userMention, bulletList, maskLink,
} from '@minesa-org/mini-interaction';

const content = [
  heading(`Welcome ${userMention(userId)}!`, 2),
  italic(bold('Enjoy your stay.')),
  bulletList([spoiler('secret tip'), maskLink('Docs', 'https://example.com')]),
  `Event starts ${timestamp(eventDate, 'R')}`,
].join('\n');
```

---

## 🧵 Messaging Helpers

```ts
// Create a thread directly in a channel (e.g. forum posts)
await rest.createThread({ channelId, name: 'Weekly discussion', type: ChannelType.PublicThread });

// Send, then chain follow-up actions
const msg = await rest.sendMessage({ channelId, content: 'Hello!' });
await msg.react('🎉');
await msg.reply('Hi back!');
await msg.pin();
await msg.edit({ content: 'Edited!' });

// Webhook messages
await rest.sendWebhookMessage(webhookId, webhookToken, { content: 'Via webhook' });
```

---

## 🔗 Lobbies & Linked Channels

Link a lobby to a guild text channel so in-game messages show up in Discord and
Discord replies show up in the game. Players can also mint an invite to the
server straight from the lobby.

```ts
import { LobbyMemberFlags } from '@minesa-org/mini-interaction';

// 1. Create the lobby and grant the owner the right to configure the link.
const lobby = await rest.createLobby({
  metadata: { mode: 'raid' },
  members: [{ id: ownerId, flags: LobbyMemberFlags.CanLinkLobby }],
});

// 2. Link a channel. The acting user needs the CanLinkLobby flag, so this
//    call takes their OAuth2 **user** token (scope `sdk.social_layer`), not the
//    bot token.
await rest.linkChannelToLobby(lobby.id, selectedChannelId, userAccessToken);

// 3. Chat both ways.
await rest.sendLobbyMessage(lobby.id, { content: 'gg' }, userAccessToken);
const messages = await rest.getLobbyMessages(lobby.id, userAccessToken, { limit: 50 });

// 4. Unlink, or hand the player an invite to the server.
await rest.unlinkChannelFromLobby(lobby.id, userAccessToken);
const { code } = await rest.createLobbyChannelInviteForSelf(lobby.id, userAccessToken);
```

`linkChannelToLobby`, `unlinkChannelFromLobby`, `sendLobbyMessage`,
`getLobbyMessages`, `createLobbyChannelInviteForSelf` and `createOrJoinLobby`
all send a **Bearer** user token instead of `Authorization: Bot …`, because the
lobby acts on behalf of that user.

Before you ship this, two things are easy to get wrong:

- **Private channels can be linked.** Discord allows any channel the user can
  access, and its read/write permissions are only enforced *in the Discord
  client* — so every lobby member can read and post in a linked `#admins`
  channel from inside the game. In the Social SDK you can gate this with
  `isViewableAndWriteableByAllMembers`;
  the HTTP API does not expose that flag, so ask the user to confirm before
  linking a channel you cannot verify.
- **Invites cannot be restricted.** Any member of a linked lobby can generate a
  server invite through `createLobbyChannelInviteForSelf`, regardless of their
  lobby permissions.

Channel linking is also rate limited hard while your app is unapproved: **20
calls per 2 hours per application** (`LOBBY_DEVELOPMENT_RATE_LIMITS`), so a
retry loop in development will exhaust it quickly.

---

## 🎮 Game Stats Widgets

Push player stats — rank, playtime, wins, or your own custom stats — onto a
Discord profile with the Application Identity Profile API. Everything is plain
HTTP with the bot token, so it works in serverless deployments.

```ts
await rest.sendGameStats({
  userId,                  // the player's Discord id
  providerIssuedUserId,    // the player's id in *your* system (not a snowflake)
  username: 'johndoe123',
  primary: {
    season: 'Season 3',
    rank_name: 'Silver',
    playtime_hours: 69.41,
    total_wins: 57,
  },
  dynamic: [{ type: 2, name: 'win_streak', value: 5 }],
});
```

`data` is **fully replaced** on every write, so any stat you omit is deleted.
Pass `mode: 'merge'` to read the stored profile first and keep everything you
did not touch:

```ts
await rest.sendGameStats({ userId, providerIssuedUserId, primary: { rank_name: 'Gold' }, mode: 'merge' });

const profile = await rest.getIdentityProfile(userId, providerIssuedUserId);
```

Requirements:

- The game must be **claimed on Discord** and its widget configured in the
  Developer Portal under **Games → Widget**.
- The player must link their account with the `application_identities.write`
  OAuth2 scope (included automatically in Social SDK scopes).
- Media URLs must be publicly reachable — Discord's unfurler fetches them
  server-side, so `localhost`/LAN URLs render as nothing. `sendGameStats`
  rejects them unless you pass `allowPrivateMediaUrls: true`.

Payloads are validated client-side against Discord's documented limits and
throw an `ApplicationIdentityProfileError` carrying a machine-readable `code`
(`payload_too_large`, `too_many_dynamic_fields`, `string_value_too_long`, …).

---

## 📨 Webhook Events

Webhook Events are one-way HTTP events Discord posts to your app when something
happens — an app being authorized or deauthorized, entitlements changing, lobby
messages, game direct messages. Unlike interactions they are **not realtime and
not ordered**, and Discord retries failures, so keep handlers idempotent.

Add your URL in the app's Developer Portal under **Webhooks → Endpoint URL**,
then wire up an endpoint:

```ts
import {
  WebhookEventEndpoint,
  WebhookEventRouter,
  WebhookEventType,
} from '@minesa-org/mini-interaction';

const router = new WebhookEventRouter()
  .on(WebhookEventType.ApplicationAuthorized, (payload) => {
    // payload.event.data is typed from the event name
    console.log('authorized', payload.event.data?.user.id);
  })
  .on(WebhookEventType.ApplicationDeauthorized, (payload) => {
    // Social SDK: the only out-of-game signal that a link was revoked.
    return unlinkAccount(payload.event.data!.user.id);
  })
  .onAny((payload) => console.log('unhandled event', payload.event.type))
  .onError((error) => console.error('webhook event failed', error));

const endpoint = new WebhookEventEndpoint({
  publicKey: process.env.DISCORD_PUBLIC_KEY!,
  router,
});

// Fetch-API runtimes: Cloudflare Workers, Bun, Deno, Vercel Edge
export async function POST(request: Request) {
  return endpoint.handleFetch(request);
}
```

`handleFetch` answers with a bodiless **`204`**, **`401`** when the Ed25519
signature is missing or invalid, **`400`** for an unparseable body, and **`500`**
when a handler throws. Discord signs every delivery — including the `PING` it
sends when you save the URL — and routinely probes endpoints with deliberately
invalid signatures, so verification always runs before your handlers.

Handlers run **before** the ack. To push heavier work past it, pass `waitUntil`:

```ts
const endpoint = new WebhookEventEndpoint({
  publicKey: process.env.DISCORD_PUBLIC_KEY!,
  router,
  waitUntil: (promise) => vercelWaitUntil(promise), // ctx.waitUntil on Workers
});
```

Either way, keep the response inside Discord's **3 second** budget: it retries
with exponential backoff for up to 10 minutes, and stops sending events if you
fail too often. On non-Fetch servers,
`endpoint.handle({ body, signature, timestamp })` returns just
`{ status, body }` for you to apply yourself.

---

## 🔐 OAuth2

`OAuth2Builder` builds authorization URLs and talks to the token, revocation and
`@me` endpoints with typed responses.

```ts
import { OAuth2Builder, OAuth2Scope, OAuth2ScopePresets } from '@minesa-org/mini-interaction';

const oauth = new OAuth2Builder({
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  redirectUri: 'https://example.com/api/discord-oauth-callback',
}).addScopes(...OAuth2ScopePresets.SignIn);

const { url, state } = oauth.build();       // redirect the user here, store `state`
const tokens = await oauth.exchangeCode(code); // then: refresh, revoke, getAuthorizationInfo
```

Presets cover the flows you actually build: `Minimal`, `SignIn`,
`SignInWithGuilds`, `Bot`, `Webhook`, `RoleConnection`, plus the Social SDK's
`SocialPresence` and — for lobbies and **Linked Channels** —
`SocialCommunication` (`openid sdk.social_layer`).

Scopes are a typed registry, and every one carries copy you can render on a
consent screen instead of asking for capabilities blind:

```ts
OAuth2Scope.GuildsJoin;             // "guilds.join"
OAuth2ScopeDescriptions[OAuth2Scope.GuildsJoin];
// "Add you to a server."

OAuth2ScopeMetadata[OAuth2Scope.GuildsJoin];
// { description: "…", category: "identity", restricted: false }

requiresOAuth2ScopeApproval(OAuth2ScopePresets.SocialCommunication); // true — needs an access request
```

Use `oauth.describeScopes()` to get the requested scopes grouped by category, or
`OAuth2ScopeCategories` for the full catalogue.

Mistakes Discord would reject are caught before the user sees anything:
`role_connections.write` with the implicit grant, a missing `redirect_uri`, an
empty scope list, or a team-owned app asking for more than `identify` and
`applications.commands.update` on client credentials. Those throw
`OAuth2BuilderError` with a machine-readable `code`; anything the API itself
rejects throws `OAuth2RequestError` with `status`, `error` and
`errorDescription`.

A few behaviours worth knowing: revocation is **authorization-wide** — revoking
either token kills every token from that authorization — and users can decline
individual scopes, so read back what you actually got with
`getAuthorizationInfo(accessToken)` rather than assuming the request was granted
in full.

---

## 📜 License

MIT © [Minesa](https://github.com/minesa-org)
