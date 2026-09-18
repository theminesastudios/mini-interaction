import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

import {
	WebhookEventPayloadType,
	WebhookEventType,
	isWebhookEventPayload,
	type WebhookEventPayload,
} from "./WebhookEvent.js";
import {
	InvalidWebhookEventSignatureError,
	verifyWebhookEventRequest,
} from "./WebhookEventVerifier.js";
import { WebhookEventEndpoint, WebhookEventRouter } from "./WebhookEventRouter.js";

const TIMESTAMP = "1700000000";

/**
 * Real Ed25519 keypair so the suite exercises the same WebCrypto path Discord
 * uses, rather than stubbing `verifyKey`.
 */
const keyPair = (await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, [
	"sign",
	"verify",
])) as unknown as { publicKey: CryptoKey; privateKey: CryptoKey };

const publicKeyHex = Buffer.from(
	await webcrypto.subtle.exportKey("raw", keyPair.publicKey),
).toString("hex");

/** Signs `timestamp + body` exactly the way Discord does. */
async function sign(body: string, timestamp = TIMESTAMP): Promise<string> {
	const message = new TextEncoder().encode(timestamp + body);
	const signature = await webcrypto.subtle.sign(
		{ name: "Ed25519" },
		keyPair.privateKey,
		message,
	);
	return Buffer.from(signature).toString("hex");
}

async function signedRequest(body: string) {
	return { body, signature: await sign(body), timestamp: TIMESTAMP };
}

function pingBody(): string {
	return JSON.stringify({ version: 1, application_id: "app-1", type: 0 });
}

function deauthorizedBody(userId = "u1"): string {
	return JSON.stringify({
		version: 1,
		application_id: "app-1",
		type: 1,
		event: {
			type: "APPLICATION_DEAUTHORIZED",
			timestamp: "2026-09-18T00:00:00.000000",
			data: {
				user: { id: userId, username: "ada", discriminator: "0", avatar: null },
			},
		},
	});
}

test("verifyWebhookEventRequest accepts a correctly signed body", async () => {
	const body = deauthorizedBody();
	const parsed = await verifyWebhookEventRequest({
		...(await signedRequest(body)),
		publicKey: publicKeyHex,
	});

	assert.ok(isWebhookEventPayload(parsed));
	assert.equal(parsed.event.type, WebhookEventType.ApplicationDeauthorized);
	assert.equal(parsed.event.data?.user.id, "u1");
});

test("verifyWebhookEventRequest rejects tampering and missing headers", async () => {
	const body = deauthorizedBody();
	const { signature } = await signedRequest(body);

	// Body changed after signing — the exact attack the signature exists for.
	await assert.rejects(
		() =>
			verifyWebhookEventRequest({
				body: deauthorizedBody("attacker"),
				signature,
				timestamp: TIMESTAMP,
				publicKey: publicKeyHex,
			}),
		InvalidWebhookEventSignatureError,
	);

	// Replayed against a different timestamp.
	await assert.rejects(
		() =>
			verifyWebhookEventRequest({
				body,
				signature,
				timestamp: "1700000999",
				publicKey: publicKeyHex,
			}),
		InvalidWebhookEventSignatureError,
	);

	// Discord routinely probes endpoints with invalid signatures.
	await assert.rejects(
		() =>
			verifyWebhookEventRequest({
				body,
				signature: "00".repeat(64),
				timestamp: TIMESTAMP,
				publicKey: publicKeyHex,
			}),
		InvalidWebhookEventSignatureError,
	);

	await assert.rejects(
		() => verifyWebhookEventRequest({ body, publicKey: publicKeyHex }),
		/missing X-Signature-Ed25519/,
	);
});

test("endpoint acks PING with 204 and an empty body", async () => {
	const body = pingBody();
	const result = await new WebhookEventEndpoint({ publicKey: publicKeyHex }).handle(
		await signedRequest(body),
	);

	assert.equal(result.status, 204);
	assert.equal(result.body, "");
});

test("endpoint dispatches an event to the matching handler", async () => {
	const seen: string[] = [];
	const router = new WebhookEventRouter().on(
		WebhookEventType.ApplicationDeauthorized,
		(payload) => {
			seen.push(payload.event.data?.user.id ?? "unknown");
		},
	);

	const result = await new WebhookEventEndpoint({
		publicKey: publicKeyHex,
		router,
	}).handle(await signedRequest(deauthorizedBody()));

	assert.equal(result.status, 204);
	assert.deepEqual(seen, ["u1"]);
});

test("endpoint returns 401 on a bad signature and never dispatches", async () => {
	const seen: string[] = [];
	const router = new WebhookEventRouter().onAny(() => {
		seen.push("dispatched");
	});

	const body = deauthorizedBody();
	const result = await new WebhookEventEndpoint({
		publicKey: publicKeyHex,
		router,
	}).handle({
		body,
		signature: "ab".repeat(64),
		timestamp: TIMESTAMP,
	});

	assert.equal(result.status, 401);
	assert.deepEqual(seen, []);
});

test("endpoint returns 400 for a signed body that is not JSON", async () => {
	const body = "not json";
	const result = await new WebhookEventEndpoint({ publicKey: publicKeyHex }).handle(
		await signedRequest(body),
	);

	assert.equal(result.status, 400);
});

test("a throwing handler yields 500 unless onError handles it", async () => {
	const body = deauthorizedBody();
	const failing = new WebhookEventRouter().on(
		WebhookEventType.ApplicationDeauthorized,
		() => {
			throw new Error("boom");
		},
	);

	const unhandled = await new WebhookEventEndpoint({
		publicKey: publicKeyHex,
		router: failing,
	}).handle(await signedRequest(body));
	assert.equal(unhandled.status, 500);

	// With onError the failure is contained, so the delivery is acked and Discord
	// will not retry it.
	let captured: unknown;
	failing.onError((error) => {
		captured = error;
	});

	const handled = await new WebhookEventEndpoint({
		publicKey: publicKeyHex,
		router: failing,
	}).handle(await signedRequest(body));
	assert.equal(handled.status, 204);
	assert.ok(captured instanceof Error);
});

test("waitUntil hands long-running handler work off past the ack", async () => {
	const order: string[] = [];
	const scheduled: Array<Promise<unknown>> = [];

	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});

	const router = new WebhookEventRouter().on(
		WebhookEventType.ApplicationDeauthorized,
		async () => {
			order.push("started");
			await gate;
			order.push("finished");
		},
	);

	const result = await new WebhookEventEndpoint({
		publicKey: publicKeyHex,
		router,
		waitUntil: (promise) => scheduled.push(promise),
	}).handle(await signedRequest(deauthorizedBody()));

	// Acked while the handler is still blocked: the response does not wait on it.
	assert.equal(result.status, 204);
	assert.equal(scheduled.length, 1);
	assert.deepEqual(order, ["started"]);

	release();
	await Promise.all(scheduled);
	assert.deepEqual(order, ["started", "finished"]);
});

test("handleFetch wires headers, status and an explicit Content-Type", async () => {
	const body = pingBody();
	const request = new Request("https://example.com/events", {
		method: "POST",
		body,
		headers: {
			"x-signature-ed25519": await sign(body),
			"x-signature-timestamp": TIMESTAMP,
		},
	});

	const response = await new WebhookEventEndpoint({
		publicKey: publicKeyHex,
	}).handleFetch(request);

	assert.equal(response.status, 204);
	// Discord requires a valid Content-Type when acknowledging PINGs.
	assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
	assert.equal(await response.text(), "");
});

test("router prefers a specific handler over onAny and honours middleware order", async () => {
	const order: string[] = [];

	const router = new WebhookEventRouter()
		.use(async (_request, _ctx, next) => {
			order.push("first");
			await next();
		})
		.use((_request, _ctx, next) => {
			order.push("second");
			return next();
		})
		.on(WebhookEventType.ApplicationDeauthorized, () => {
			order.push("specific");
		})
		.onAny(() => {
			order.push("any");
		});

	await router.dispatch(
		await verifyWebhookEventRequest({
			...(await signedRequest(deauthorizedBody())),
			publicKey: publicKeyHex,
		}) as WebhookEventPayload,
	);

	assert.deepEqual(order, ["first", "second", "specific"]);
});

test("router falls back to onAny for unregistered event types", async () => {
	const seen: string[] = [];
	const router = new WebhookEventRouter().onAny((payload) => {
		seen.push(payload.event.type);
	});

	await router.dispatch(
		(await verifyWebhookEventRequest({
			...(await signedRequest(deauthorizedBody())),
			publicKey: publicKeyHex,
		})) as WebhookEventPayload,
	);

	assert.deepEqual(seen, [WebhookEventType.ApplicationDeauthorized]);
});

test("middleware can short-circuit dispatch", async () => {
	const seen: string[] = [];
	let calls = 0;

	const router = new WebhookEventRouter()
		.use((_request, _ctx, next) => {
			calls += 1;
			if (calls === 1) return; // swallow the first delivery, no next()
			return next();
		})
		.on(WebhookEventType.ApplicationDeauthorized, () => {
			seen.push("handler");
		});

	const payload = (await verifyWebhookEventRequest({
		...(await signedRequest(deauthorizedBody())),
		publicKey: publicKeyHex,
	})) as WebhookEventPayload;

	await router.dispatch(payload);
	assert.deepEqual(seen, []);

	await router.dispatch(payload);
	assert.deepEqual(seen, ["handler"]);
});

test("isWebhookEventPayload separates PING from events", async () => {
	const ping = await verifyWebhookEventRequest({
		...(await signedRequest(pingBody())),
		publicKey: publicKeyHex,
	});
	assert.equal(ping.type, WebhookEventPayloadType.Ping);
	assert.equal(isWebhookEventPayload(ping), false);

	const event = await verifyWebhookEventRequest({
		...(await signedRequest(deauthorizedBody())),
		publicKey: publicKeyHex,
	});
	assert.equal(event.type, WebhookEventPayloadType.Event);
	assert.equal(isWebhookEventPayload(event), true);
});
