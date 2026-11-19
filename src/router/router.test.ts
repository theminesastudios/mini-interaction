import { test } from "node:test";
import assert from "node:assert/strict";

import { InteractionRouter } from "./InteractionRouter.js";
import { InteractionContext } from "../core/interactions/InteractionContext.js";
import type {
	APIApplicationCommandAutocompleteInteraction,
	APIChatInputApplicationCommandInteraction,
	APIInteraction,
	APIInteractionResponse,
	APIMessageComponentInteraction,
	APIUserApplicationCommandInteraction,
} from "discord-api-types/v10";

const restStub = {} as never;

function ctx(interaction: APIInteraction): InteractionContext {
	return new InteractionContext({ interaction, rest: restStub });
}

function chatInput(name: string): APIChatInputApplicationCommandInteraction {
	return {
		type: 2,
		id: "1",
		token: "tok",
		application_id: "app",
		version: 1,
		data: { id: "c", name, type: 1 },
	} as unknown as APIChatInputApplicationCommandInteraction;
}

test("chat input handlers receive wrapped interactions with option resolvers", async () => {
	const router = new InteractionRouter();
	let receivedName: string | undefined;

	router.onCommand("greet", async (interaction) => {
		receivedName = typeof interaction.options?.getString === "function" ? "wrapped" : "raw";
		await interaction.reply({ content: "hi" });
	});

	const response = (await router.dispatch(
		chatInput("greet"),
		ctx(chatInput("greet")),
	)) as APIInteractionResponse;

	assert.equal(receivedName, "wrapped");
	assert.equal(response.type, 4);
	assert.equal((response.data as { content?: string }).content, "hi");
});

test("autocomplete handlers produce a type-8 response", async () => {
	const router = new InteractionRouter();
	router.onAutocomplete("search", (ac) => {
		const focused = ac.getFocusedOption();
		ac.respond([`${focused!.value}-x`]);
	});

	const interaction = {
		type: 4,
		id: "2",
		token: "tok",
		application_id: "app",
		version: 1,
		data: {
			id: "c",
			name: "search",
			options: [{ type: 3, name: "query", value: "cat", focused: true }],
		},
	} as unknown as APIApplicationCommandAutocompleteInteraction;

	const response = (await router.dispatch(
		interaction,
		ctx(interaction),
	)) as APIInteractionResponse;

	assert.equal(response.type, 8);
	assert.deepEqual(
		(response.data as { choices: unknown[] }).choices,
		[{ name: "cat-x", value: "cat-x" }],
	);
});

test("user context menu commands route by name and capture replies", async () => {
	const router = new InteractionRouter();
	router.onUserCommand("Info", async (interaction) => {
		await interaction.reply({ content: "user info" });
	});

	const interaction = {
		type: 2,
		id: "3",
		token: "tok",
		application_id: "app",
		version: 1,
		data: { id: "c", name: "Info", type: 2 },
	} as unknown as APIUserApplicationCommandInteraction;

	const response = (await router.dispatch(
		interaction,
		ctx(interaction),
	)) as APIInteractionResponse;

	assert.equal(response.type, 4);
	assert.equal((response.data as { content?: string }).content, "user info");

	// same name must NOT match the chat-input slot
	const wrongType = { ...interaction, data: { ...interaction.data, type: 1 } };
	const noMatch = await router.dispatch(wrongType, ctx(wrongType));
	assert.equal(noMatch, undefined);
});

test("component matching prefers exact ids over globs over regexes", async () => {
	const router = new InteractionRouter();
	const order: string[] = [];

	router.onComponent(/^config:.+$/, () => {
		order.push("regex");
	});
	router.onComponent(/^ticket:\d+$/, async () => ({ type: 4, data: { content: "regex-ticket" } }));
	router.onComponent("config:*", async () => ({ type: 4, data: { content: "glob" } }));
	router.onComponent("config:advanced", async () => ({ type: 4, data: { content: "exact" } }));

	function component(customId: string): APIMessageComponentInteraction {
		return {
			type: 3,
			id: "4",
			token: "tok",
			application_id: "app",
			version: 1,
			data: { custom_id: customId, component_type: 2 },
		} as unknown as APIMessageComponentInteraction;
	}

	const exact = (await router.dispatch(
		component("config:advanced"),
		ctx(component("config:advanced")),
	)) as APIInteractionResponse & { data: { content?: string } };
	assert.equal(exact.data.content, "exact");

	const glob = (await router.dispatch(
		component("config:simple"),
		ctx(component("config:simple")),
	)) as APIInteractionResponse & { data: { content?: string } };
	assert.equal(glob.data.content, "glob");

	const regexHit = (await router.dispatch(
		component("ticket:42"),
		ctx(component("ticket:42")),
	)) as APIInteractionResponse & { data: { content?: string } };
	assert.equal(regexHit.data.content, "regex-ticket");
});

test("middleware runs in order around dispatch", async () => {
	const router = new InteractionRouter();
	const calls: string[] = [];

	router.use(async (_i, _ctx, next) => {
		calls.push("first:before");
		const result = await next();
		calls.push("first:after");
		return result;
	});
	router.use(async (_i, _ctx, next) => {
		calls.push("second:before");
		return next();
	});
	router.onCommand("ping", async () => {
		calls.push("handler");
	});

	await router.dispatch(chatInput("ping"), ctx(chatInput("ping")));

	assert.deepEqual(calls, [
		"first:before",
		"second:before",
		"handler",
		"first:after",
	]);
});

test("onError converts thrown errors into responses", async () => {
	const router = new InteractionRouter();
	router.onCommand("boom", async () => {
		throw new Error("kaboom");
	});
	router.onError((_error) => ({ type: 4, data: { content: "graceful" } }));

	const interaction = chatInput("boom");
	const response = (await router.dispatch(
		interaction,
		ctx(interaction),
	)) as APIInteractionResponse & { data: { content?: string } };

	assert.equal(response.data.content, "graceful");
});

test("fallback fires when nothing matches", async () => {
	const router = new InteractionRouter();
	router.onFallback(() => ({ type: 5 }));

	const interaction = chatInput("unknown-command");
	const response = await router.dispatch(interaction, ctx(interaction));

	assert.deepEqual(response, { type: 5 });
});
