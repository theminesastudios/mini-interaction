import { verifyKey } from "discord-interactions";

import type { WebhookEventRequest } from "./WebhookEvent.js";

/**
 * Thrown when a Webhook Events request is missing its signature headers or the
 * Ed25519 signature does not match. Respond with `401` when you catch this.
 */
export class InvalidWebhookEventSignatureError extends Error {
	constructor(message = "invalid signature") {
		super(`[WebhookEventVerifier] ${message}`);
		this.name = "InvalidWebhookEventSignatureError";
	}
}

export type VerifyWebhookEventRequest = {
	/** The raw request body, before any parsing. */
	body: string | Uint8Array;
	/** The `X-Signature-Ed25519` header. */
	signature?: string;
	/** The `X-Signature-Timestamp` header. */
	timestamp?: string;
	/** Your app's public key from the Developer Portal. */
	publicKey: string;
};

/**
 * Verifies and parses one Webhook Events request.
 *
 * Discord signs **every** delivery — including the `PING` it sends when you save
 * the endpoint URL — and routinely re-checks your endpoint by sending
 * deliberately invalid signatures. Failing to reject those gets your Webhook
 * Events URL removed, so always call this before reading the payload and verify
 * against the **raw** body (re-serialised JSON will not match).
 *
 * @throws {InvalidWebhookEventSignatureError} when headers are missing or the
 * signature does not verify.
 *
 * @see {@link https://docs.discord.com/developers/events/webhook-events#preparing-for-events}
 */
export async function verifyWebhookEventRequest(
	request: VerifyWebhookEventRequest,
): Promise<WebhookEventRequest> {
	const { body, signature, timestamp, publicKey } = request;

	if (!signature || !timestamp) {
		throw new InvalidWebhookEventSignatureError(
			"missing X-Signature-Ed25519 or X-Signature-Timestamp header",
		);
	}

	const valid = await verifyKey(body, signature, timestamp, publicKey);
	if (!valid) {
		throw new InvalidWebhookEventSignatureError();
	}

	const text = typeof body === "string" ? body : new TextDecoder().decode(body);
	return JSON.parse(text) as WebhookEventRequest;
}
