import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Guards the package entrypoint.
 *
 * `tsc --noEmit` on the library itself cannot catch a broken barrel export —
 * only a consumer importing from the published entrypoint can. This file is
 * that consumer, so a missing or renamed export fails here instead of in
 * someone's app.
 */
import {
	ApplicationIdentityProfileError,
	DiscordRestApiError,
	DiscordRestClient,
	DynamicFieldType,
	InvalidWebhookEventSignatureError,
	WebhookEventEndpoint,
	WebhookEventPayloadType,
	WebhookEventRouter,
	WebhookEventType,
	isPublicMediaUrl,
	isWebhookEventPayload,
	verifyWebhookEventRequest,
	type ApplicationIdentityProfile,
	type DynamicFieldType as DynamicFieldTypeAlias,
	type DynamicProfileField,
	type SendGameStatsOptions,
	type WebhookEventPayloadOf,
	type WebhookEventRequest,
} from "./index.js";

test("the package barrel re-exports the Game Stats surface", () => {
	assert.equal(typeof DiscordRestClient, "function");
	assert.equal(typeof DiscordRestApiError, "function");
	assert.equal(typeof ApplicationIdentityProfileError, "function");
	assert.equal(typeof isPublicMediaUrl, "function");
	assert.equal(DynamicFieldType.Media, 3);

	// Types must resolve through the barrel too, not just the values.
	const field: DynamicProfileField = {
		type: DynamicFieldType.Number,
		name: "wins",
		value: 3,
	};
	const kind: DynamicFieldTypeAlias = DynamicFieldType.String;
	const options: SendGameStatsOptions = {
		userId: "1",
		providerIssuedUserId: "2",
		mode: "merge",
	};
	const profile: ApplicationIdentityProfile = { username: "ada" };

	assert.equal(field.type, 2);
	assert.equal(kind, 1);
	assert.equal(options.mode, "merge");
	assert.equal(profile.username, "ada");
});

test("the package barrel re-exports the Webhook Events surface", () => {
	assert.equal(typeof WebhookEventRouter, "function");
	assert.equal(typeof WebhookEventEndpoint, "function");
	assert.equal(typeof verifyWebhookEventRequest, "function");
	assert.equal(typeof InvalidWebhookEventSignatureError, "function");
	assert.equal(typeof isWebhookEventPayload, "function");
	assert.equal(WebhookEventPayloadType.Ping, 0);
	assert.equal(WebhookEventType.ApplicationDeauthorized, "APPLICATION_DEAUTHORIZED");

	// The per-event payload type must narrow through the barrel as well.
	const payload: WebhookEventPayloadOf<"APPLICATION_AUTHORIZED"> = {
		version: 1,
		application_id: "app-1",
		type: WebhookEventPayloadType.Event,
		event: {
			type: WebhookEventType.ApplicationAuthorized,
			timestamp: "2026-09-18T00:00:00.000000",
			data: {
			user: {
				id: "u1",
				username: "ada",
				discriminator: "0",
				global_name: null,
				avatar: null,
			},
			scopes: ["identify"],
		},
		},
	};
	const request: WebhookEventRequest = payload;

	assert.equal(request.application_id, "app-1");
});
