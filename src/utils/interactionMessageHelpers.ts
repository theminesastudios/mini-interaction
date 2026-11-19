import type {
	APIInteractionResponseCallbackData,
	APIMessageComponent,
	MessageFlags,
} from "discord-api-types/v10";
import type {
	APIContainerComponent,
} from "discord-api-types/v10";
import { resolveJSONEncodable } from "../builders/shared.js";
import type { JSONEncodable } from "../builders/shared.js";
import {
	ComponentType,
} from "discord-api-types/v10";

import { InteractionFlags } from "../types/InteractionFlags.js";
import type { MessageMiniActionRow } from "../types/ComponentTypes.js";

/**
 * Message component types that require the IsComponentsV2 message flag.
 * Label (18), FileUpload (19), RadioGroup (21), CheckboxGroup (22) and
 * Checkbox (23) are modal-only components and intentionally excluded.
 */
const COMPONENTS_V2_TYPES = new Set<number>([
	ComponentType.Section,
	ComponentType.TextDisplay,
	ComponentType.Thumbnail,
	ComponentType.MediaGallery,
	ComponentType.File,
	ComponentType.Separator,
	ComponentType.Container,
]);

/** Union of helper flag enums and raw Discord message flags. */
export type MessageFlagLike = MessageFlags | InteractionFlags;

/** Top-level components allowed in messages (ActionRows or Containers) */
export type TopLevelComponent =
	| MessageMiniActionRow
	| APIContainerComponent;

/** Message payload accepted by helper reply/edit functions. */
export type InteractionMessageData = {
	content?: string;
	components?:
		| TopLevelComponent[]
		| JSONEncodable<TopLevelComponent>[]
		| JSONEncodable<TopLevelComponent[]>;
	embeds?: unknown[]; // Adding embeds to fix type error, though seemingly unused or weakly typed before
	flags?: MessageFlagLike | MessageFlagLike[];
};

/** Deferred response payload recognised by helper methods. */
export type DeferredResponseData = {
	flags: MessageFlagLike | MessageFlagLike[];
};

/** Options accepted when deferring a reply. */
export type DeferReplyOptions = {
	flags?: MessageFlagLike | MessageFlagLike[];
};

/**
 * Normalises helper flag enums into the raw Discord `MessageFlags` bitfield.
 *
 * @param flags - A flag or array of flags from helper enums or raw Discord flags.
 * @returns The value coerced to a `MessageFlags` compatible bitfield.
 */
export function normaliseMessageFlags(
	flags: MessageFlagLike | MessageFlagLike[] | undefined,
): MessageFlags | undefined {
	if (flags === undefined) {
		return undefined;
	}

	if (Array.isArray(flags)) {
		if (flags.length === 0) {
			return undefined;
		}
		// Combine multiple flags using bitwise OR
		return flags.reduce<MessageFlags>(
			(acc, flag) => (acc | (flag as MessageFlags)) as MessageFlags,
			0 as MessageFlags,
		);
	}

	return flags as MessageFlags;
}

/**
 * Ensures helper message payloads include correctly normalised message flags.
 *
 * @param data - The helper-supplied response payload.
 * @returns A payload safe to send to Discord's API.
 */
export function normaliseInteractionMessageData(
	data?: InteractionMessageData,
): APIInteractionResponseCallbackData | undefined {
	if (!data) {
		return undefined;
	}

	/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
	const responseData: any = { ...data };

	if (data.components) {
		const components = resolveJSONEncodable(data.components);
		if (Array.isArray(components)) {
			responseData.components = components.map((c: unknown) =>
				resolveJSONEncodable(c),
			);
		}
	}

	if (data.embeds) {
		responseData.embeds = data.embeds.map((e: unknown) => resolveJSONEncodable(e));
	}

	if (data.flags !== undefined) {
		responseData.flags = normaliseMessageFlags(data.flags);
	}

	// Automatically handle IsComponentsV2 flag if Components V2 are detected
	if (responseData.components && Array.isArray(responseData.components)) {
		if (containsComponentsV2(responseData.components)) {
			const currentFlags = (responseData.flags as number) ?? 0;
			responseData.flags = (currentFlags | (0x1 << 15)) as MessageFlags;
		}
	}

	return responseData;
}

function containsComponentsV2(components: readonly unknown[]): boolean {
	return components.some((component) => componentUsesComponentsV2(component));
}

function componentUsesComponentsV2(component: unknown): boolean {
	const resolved = resolveComponentLike(component);

	if (!resolved || typeof resolved !== "object") {
		return false;
	}

	const type = (resolved as Partial<APIMessageComponent>).type;

	if (typeof type !== "number") {
		return false;
	}

	if (COMPONENTS_V2_TYPES.has(type)) {
		return true;
	}

	if (type === ComponentType.ActionRow) {
		const rowComponents = (resolved as { components?: unknown }).components;
		if (Array.isArray(rowComponents)) {
			return containsComponentsV2(rowComponents);
		}
	}

	return false;
}

function resolveComponentLike(component: unknown): unknown {
	if (component && typeof component === "object" && "toJSON" in component) {
		const encoder = component as { toJSON?: unknown };
		if (typeof encoder.toJSON === "function") {
			return encoder.toJSON();
		}
	}

	return component;
}
