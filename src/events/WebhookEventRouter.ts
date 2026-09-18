import {
	WebhookEventPayloadType,
	type WebhookEventPayload,
	type WebhookEventPayloadOf,
	type WebhookEventPingPayload,
	type WebhookEventRequest,
	type WebhookEventType,
} from "./WebhookEvent.js";
import {
	InvalidWebhookEventSignatureError,
	verifyWebhookEventRequest,
	type VerifyWebhookEventRequest,
} from "./WebhookEventVerifier.js";

/** Ambient data handed to every handler. */
export type WebhookEventContext = {
	/** ID of the app the event belongs to. */
	applicationId: string;
};

/** Handler for a single event type; `data` is typed from the event name. */
export type WebhookEventHandler<TName extends WebhookEventType> = (
	payload: WebhookEventPayloadOf<TName>,
	ctx: WebhookEventContext,
) => Promise<void> | void;

/** Handler for any event, used as the fallback when no specific handler matches. */
export type WebhookEventAnyHandler = (
	payload: WebhookEventPayload,
	ctx: WebhookEventContext,
) => Promise<void> | void;

/** Handler for the `PING` Discord sends when validating the endpoint URL. */
export type WebhookEventPingHandler = (
	payload: WebhookEventPingPayload,
	ctx: WebhookEventContext,
) => Promise<void> | void;

/** Middleware executed before dispatch; call `next()` to continue the chain. */
export type WebhookEventMiddleware = (
	request: WebhookEventRequest,
	ctx: WebhookEventContext,
	next: () => Promise<void>,
) => Promise<void> | void;

/**
 * Error hook. Returning normally acks with `204`; rethrowing lets the failure
 * surface so Discord retries the delivery.
 */
export type WebhookEventErrorHandler = (
	error: unknown,
	request: WebhookEventRequest,
	ctx: WebhookEventContext,
) => Promise<void> | void;

/**
 * Dispatches verified Webhook Events to handlers by event name.
 *
 * Webhook events arrive **out of order and are retried** on failure, so keep
 * handlers idempotent. Do the minimum work needed to ack and defer the rest
 * (see `WebhookEventEndpoint`'s `waitUntil` option) — Discord expects a
 * response within 3 seconds.
 */
export class WebhookEventRouter {
	private readonly handlers = new Map<WebhookEventType, WebhookEventAnyHandler>();
	private readonly middleware: WebhookEventMiddleware[] = [];
	private anyHandler?: WebhookEventAnyHandler;
	private pingHandler?: WebhookEventPingHandler;
	private errorHandler?: WebhookEventErrorHandler;

	/** Registers a handler for one event type. */
	on<TName extends WebhookEventType>(
		name: TName,
		handler: WebhookEventHandler<TName>,
	): this {
		this.handlers.set(name, handler as WebhookEventAnyHandler);
		return this;
	}

	/**
	 * Registers the fallback for event types without a dedicated handler.
	 * Specific handlers win; this only runs when nothing matched.
	 */
	onAny(handler: WebhookEventAnyHandler): this {
		this.anyHandler = handler;
		return this;
	}

	/**
	 * Registers a `PING` handler. Optional: a `PING` is always acked with `204`
	 * whether or not you handle it.
	 */
	onPing(handler: WebhookEventPingHandler): this {
		this.pingHandler = handler;
		return this;
	}

	/** Adds middleware that runs before dispatch. Call `next()` to continue. */
	use(middleware: WebhookEventMiddleware): this {
		this.middleware.push(middleware);
		return this;
	}

	/** Sets the error hook used when middleware or a handler throws. */
	onError(handler: WebhookEventErrorHandler): this {
		this.errorHandler = handler;
		return this;
	}

	/**
	 * Runs the middleware chain and the matched handler.
	 *
	 * @throws when a handler throws and no {@link onError} hook is registered.
	 */
	async dispatch(
		request: WebhookEventRequest,
		ctx: Partial<WebhookEventContext> = {},
	): Promise<void> {
		const context: WebhookEventContext = {
			applicationId: request.application_id,
			...ctx,
		};

		try {
			let index = -1;
			const run = async (): Promise<void> => {
				index += 1;
				if (index < this.middleware.length) {
					await this.middleware[index](request, context, run);
					return;
				}
				await this.handle(request, context);
			};

			await run();
		} catch (error) {
			if (!this.errorHandler) throw error;
			await this.errorHandler(error, request, context);
		}
	}

	private async handle(
		request: WebhookEventRequest,
		ctx: WebhookEventContext,
	): Promise<void> {
		if (request.type === WebhookEventPayloadType.Ping) {
			await this.pingHandler?.(request, ctx);
			return;
		}

		const handler = this.handlers.get(request.event.type);
		if (handler) {
			await handler(request, ctx);
			return;
		}

		await this.anyHandler?.(request, ctx);
	}
}

/**
 * The status your endpoint should return. Webhook events are always acknowledged
 * with an empty body — Discord does not accept a JSON reply here.
 */
export type WebhookEventEndpointResult = {
	/** `204` acked · `401` signature rejected · `400` unparseable · `500` handler threw. */
	status: 204 | 401 | 400 | 500;
	/** Always empty. */
	body: "";
};

/** The parts of an incoming request the endpoint needs. */
export type WebhookEventHttpRequest = {
	body: string | Uint8Array;
	signature?: string;
	timestamp?: string;
};

export type WebhookEventEndpointOptions = {
	/** Your app's public key from the Developer Portal. */
	publicKey: string;
	/** Dispatcher for verified events. */
	router?: WebhookEventRouter;
	/**
	 * Schedules work that outlives the response — `@vercel/functions`' `waitUntil`
	 * or Cloudflare's `ctx.waitUntil`.
	 *
	 * When set, the `204` is sent immediately and a failing handler can no longer
	 * change the status, so report failures yourself (e.g. in `router.onError`).
	 * When omitted, handlers are awaited before acking — keep total work under
	 * Discord's 3 second budget or Discord will retry the delivery.
	 */
	waitUntil?: (promise: Promise<unknown>) => void;
};

/**
 * Verifies and dispatches Discord Webhook Events for a single endpoint URL.
 *
 * ```ts
 * const endpoint = new WebhookEventEndpoint({
 *   publicKey: process.env.DISCORD_PUBLIC_KEY!,
 *   router: new WebhookEventRouter().on(
 *     WebhookEventType.ApplicationDeauthorized,
 *     (payload) => unlinkAccount(payload.event.data!.user.id),
 *   ),
 * });
 *
 * export async function POST(req: Request) {
 *   return endpoint.handleFetch(req);
 * }
 * ```
 */
export class WebhookEventEndpoint {
	constructor(private readonly options: WebhookEventEndpointOptions) {}

	/**
	 * Verifies the signature, dispatches the event and returns the status to send
	 * back. Framework-agnostic — wire it into any HTTP server.
	 */
	async handle(request: WebhookEventHttpRequest): Promise<WebhookEventEndpointResult> {
		let parsed: WebhookEventRequest;
		try {
			parsed = await verifyWebhookEventRequest({
				...request,
				publicKey: this.options.publicKey,
			} satisfies VerifyWebhookEventRequest);
		} catch (error) {
			return {
				status: error instanceof InvalidWebhookEventSignatureError ? 401 : 400,
				body: "",
			};
		}

		const dispatch = this.options.router?.dispatch(parsed) ?? Promise.resolve();

		if (this.options.waitUntil) {
			this.options.waitUntil(dispatch.catch(() => undefined));
			return { status: 204, body: "" };
		}

		try {
			await dispatch;
		} catch {
			return { status: 500, body: "" };
		}

		return { status: 204, body: "" };
	}

	/**
	 * Convenience wrapper for Fetch-API runtimes (Cloudflare Workers, Bun, Deno,
	 * Vercel Edge).
	 *
	 * Always returns a bodiless response with an explicit `Content-Type`, which
	 * Discord requires when acknowledging `PING`s.
	 */
	async handleFetch(request: Request): Promise<Response> {
		const result = await this.handle({
			body: await request.text(),
			signature: request.headers.get("x-signature-ed25519") ?? undefined,
			timestamp: request.headers.get("x-signature-timestamp") ?? undefined,
		});

		return new Response(null, {
			status: result.status,
			headers: { "Content-Type": "application/json; charset=utf-8" },
		});
	}
}
