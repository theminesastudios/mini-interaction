import {
	InteractionResponseType,
	type APIInteractionDataResolvedChannel,
	type APIInteractionDataResolvedGuildMember,
	type APIInteractionResponse,
	type APIInteractionResponseChannelMessageWithSource,
	type APIInteractionResponseDeferredChannelMessageWithSource,
	type APIInteractionResponseDeferredMessageUpdate,
	type APIInteractionResponseUpdateMessage,
	type APIMessageComponentInteraction,
	type APIMessageButtonInteractionData,
	type APIMessageChannelSelectInteractionData,
	type APIMessageMentionableSelectInteractionData,
	type APIMessageRoleSelectInteractionData,
	type APIMessageStringSelectInteractionData,
	type APIMessageUserSelectInteractionData,
	type APIModalInteractionResponse,
	type APIModalInteractionResponseCallbackData,
	type APIRole,
	type APIUser,
	type APIAttachment,
} from "discord-api-types/v10";

import {
	DeferReplyOptions,
	InteractionMessageData,
	normaliseInteractionMessageData,
	normaliseMessageFlags,
} from "./interactionMessageHelpers.js";

/** Resolved user option including optional guild member data. */
export type ResolvedUserOption = {
	user: APIUser;
	member?: APIInteractionDataResolvedGuildMember;
};

export const ResolvedUserOption = {};

/** Resolved mentionable option (either a user or role). */
export type ResolvedMentionableOption =
	| { type: "user"; value: ResolvedUserOption }
	| { type: "role"; value: APIRole };

export const ResolvedMentionableOption = {};

/**
 * Base helper methods available on all component interactions.
 */
export type BaseComponentInteractionHelpers = {
	trackTiming?: (interactionId: string, operation: string, startTime: number, success: boolean) => void;
	onAck?: (response: APIInteractionResponse) => void;
	sendFollowUp?: (token: string, response: APIInteractionResponse, messageId?: string) => Promise<void>;
	canRespond?: (interactionId: string) => boolean;
	trackResponse?: (interactionId: string, token: string, state: 'responded' | 'deferred') => void;
};

/**
 * Button interaction with helper methods.
 * Buttons don't have values or resolved data.
 */
export interface ButtonInteraction
	extends Omit<APIMessageComponentInteraction, "data"> {
	data: APIMessageButtonInteractionData;
	getResponse: () => APIInteractionResponse | null;
	reply: (
		data: InteractionMessageData,
	) => Promise<APIInteractionResponseChannelMessageWithSource>;
	deferReply: (
		options?: DeferReplyOptions,
	) => APIInteractionResponseDeferredChannelMessageWithSource;
	update: (
		data?: InteractionMessageData,
	) => Promise<APIInteractionResponseUpdateMessage>;
	deferUpdate: () => APIInteractionResponseDeferredMessageUpdate;
	showModal: (
		data:
			| APIModalInteractionResponseCallbackData
			| { toJSON(): APIModalInteractionResponseCallbackData },
	) => APIModalInteractionResponse;
	canRespond?: (interactionId: string) => boolean;
	trackResponse?: (interactionId: string, token: string, state: 'responded' | 'deferred') => void;
}

export const ButtonInteraction = {};

/**
 * String select menu interaction with helper methods.
 */
export interface StringSelectInteraction
	extends Omit<APIMessageComponentInteraction, "data"> {
	data: APIMessageStringSelectInteractionData;
	values: string[];
	getStringValues: () => string[];
	getResponse: () => APIInteractionResponse | null;
	reply: (
		data: InteractionMessageData,
	) => Promise<APIInteractionResponseChannelMessageWithSource>;
	deferReply: (
		options?: DeferReplyOptions,
	) => APIInteractionResponseDeferredChannelMessageWithSource;
	update: (
		data?: InteractionMessageData,
	) => Promise<APIInteractionResponseUpdateMessage>;
	deferUpdate: () => APIInteractionResponseDeferredMessageUpdate;
	showModal: (
		data:
			| APIModalInteractionResponseCallbackData
			| { toJSON(): APIModalInteractionResponseCallbackData },
	) => APIModalInteractionResponse;
	canRespond?: (interactionId: string) => boolean;
	trackResponse?: (interactionId: string, token: string, state: 'responded' | 'deferred') => void;
}

export const StringSelectInteraction = {};

/**
 * Role select menu interaction with helper methods.
 */
export interface RoleSelectInteraction
	extends Omit<APIMessageComponentInteraction, "data"> {
	data: APIMessageRoleSelectInteractionData;
	values: string[];
	getRoles: () => APIRole[];
	getResponse: () => APIInteractionResponse | null;
	reply: (
		data: InteractionMessageData,
	) => Promise<APIInteractionResponseChannelMessageWithSource>;
	deferReply: (
		options?: DeferReplyOptions,
	) => APIInteractionResponseDeferredChannelMessageWithSource;
	update: (
		data?: InteractionMessageData,
	) => Promise<APIInteractionResponseUpdateMessage>;
	deferUpdate: () => APIInteractionResponseDeferredMessageUpdate;
	showModal: (
		data:
			| APIModalInteractionResponseCallbackData
			| { toJSON(): APIModalInteractionResponseCallbackData },
	) => APIModalInteractionResponse;
	canRespond?: (interactionId: string) => boolean;
	trackResponse?: (interactionId: string, token: string, state: 'responded' | 'deferred') => void;
}

export const RoleSelectInteraction = {};

/**
 * User select menu interaction with helper methods.
 */
export interface UserSelectInteraction
	extends Omit<APIMessageComponentInteraction, "data"> {
	data: APIMessageUserSelectInteractionData;
	values: string[];
	getUsers: () => ResolvedUserOption[];
	getResponse: () => APIInteractionResponse | null;
	reply: (
		data: InteractionMessageData,
	) => Promise<APIInteractionResponseChannelMessageWithSource>;
	deferReply: (
		options?: DeferReplyOptions,
	) => APIInteractionResponseDeferredChannelMessageWithSource;
	update: (
		data?: InteractionMessageData,
	) => Promise<APIInteractionResponseUpdateMessage>;
	deferUpdate: () => APIInteractionResponseDeferredMessageUpdate;
	showModal: (
		data:
			| APIModalInteractionResponseCallbackData
			| { toJSON(): APIModalInteractionResponseCallbackData },
	) => APIModalInteractionResponse;
	canRespond?: (interactionId: string) => boolean;
	trackResponse?: (interactionId: string, token: string, state: 'responded' | 'deferred') => void;
}

export const UserSelectInteraction = {};

/**
 * Channel select menu interaction with helper methods.
 */
export interface ChannelSelectInteraction
	extends Omit<APIMessageComponentInteraction, "data"> {
	data: APIMessageChannelSelectInteractionData;
	values: string[];
	getChannels: () => APIInteractionDataResolvedChannel[];
	getResponse: () => APIInteractionResponse | null;
	reply: (
		data: InteractionMessageData,
	) => Promise<APIInteractionResponseChannelMessageWithSource>;
	deferReply: (
		options?: DeferReplyOptions,
	) => APIInteractionResponseDeferredChannelMessageWithSource;
	update: (
		data?: InteractionMessageData,
	) => Promise<APIInteractionResponseUpdateMessage>;
	deferUpdate: () => APIInteractionResponseDeferredMessageUpdate;
	showModal: (
		data:
			| APIModalInteractionResponseCallbackData
			| { toJSON(): APIModalInteractionResponseCallbackData },
	) => APIModalInteractionResponse;
	canRespond?: (interactionId: string) => boolean;
	trackResponse?: (interactionId: string, token: string, state: 'responded' | 'deferred') => void;
}

export const ChannelSelectInteraction = {};

/**
 * Mentionable select menu interaction with helper methods.
 */
export interface MentionableSelectInteraction
	extends Omit<APIMessageComponentInteraction, "data"> {
	data: APIMessageMentionableSelectInteractionData;
	values: string[];
	getMentionables: () => ResolvedMentionableOption[];
	getResponse: () => APIInteractionResponse | null;
	reply: (
		data: InteractionMessageData,
	) => Promise<APIInteractionResponseChannelMessageWithSource>;
	deferReply: (
		options?: DeferReplyOptions,
	) => APIInteractionResponseDeferredChannelMessageWithSource;
	update: (
		data?: InteractionMessageData,
	) => Promise<APIInteractionResponseUpdateMessage>;
	deferUpdate: () => APIInteractionResponseDeferredMessageUpdate;
	showModal: (
		data:
			| APIModalInteractionResponseCallbackData
			| { toJSON(): APIModalInteractionResponseCallbackData },
	) => APIModalInteractionResponse;
	canRespond?: (interactionId: string) => boolean;
	trackResponse?: (interactionId: string, token: string, state: 'responded' | 'deferred') => void;
}

export const MentionableSelectInteraction = {};

/**
 * Radio interaction with helper methods.
 */
export interface RadioInteraction
	extends Omit<APIMessageComponentInteraction, "data"> {
	data: APIMessageStringSelectInteractionData;
	values: string[];
	getStringValues: () => string[];
	getResponse: () => APIInteractionResponse | null;
	reply: (
		data: InteractionMessageData,
	) => Promise<APIInteractionResponseChannelMessageWithSource>;
	deferReply: (
		options?: DeferReplyOptions,
	) => APIInteractionResponseDeferredChannelMessageWithSource;
	update: (
		data?: InteractionMessageData,
	) => Promise<APIInteractionResponseUpdateMessage>;
	deferUpdate: () => APIInteractionResponseDeferredMessageUpdate;
	showModal: (
		data:
			| APIModalInteractionResponseCallbackData
			| { toJSON(): APIModalInteractionResponseCallbackData },
	) => APIModalInteractionResponse;
	canRespond?: (interactionId: string) => boolean;
	trackResponse?: (interactionId: string, token: string, state: 'responded' | 'deferred') => void;
}

export const RadioInteraction = {};

/**
 * Checkbox interaction with helper methods.
 */
export interface CheckboxInteraction
	extends Omit<APIMessageComponentInteraction, "data"> {
	data: APIMessageStringSelectInteractionData;
	values: string[];
	getStringValues: () => string[];
	getResponse: () => APIInteractionResponse | null;
	reply: (
		data: InteractionMessageData,
	) => Promise<APIInteractionResponseChannelMessageWithSource>;
	deferReply: (
		options?: DeferReplyOptions,
	) => APIInteractionResponseDeferredChannelMessageWithSource;
	update: (
		data?: InteractionMessageData,
	) => Promise<APIInteractionResponseUpdateMessage>;
	deferUpdate: () => APIInteractionResponseDeferredMessageUpdate;
	showModal: (
		data:
			| APIModalInteractionResponseCallbackData
			| { toJSON(): APIModalInteractionResponseCallbackData },
	) => APIModalInteractionResponse;
	canRespond?: (interactionId: string) => boolean;
	trackResponse?: (interactionId: string, token: string, state: 'responded' | 'deferred') => void;
}

export const CheckboxInteraction = {};

/**
 * Represents a component interaction augmented with helper response methods.
 *
 * Note: The `values` property is available on select menu interactions (data.values).
 * For button interactions, this property will be undefined.
 */
export type MessageComponentInteraction = APIMessageComponentInteraction & {
	getResponse: () => APIInteractionResponse | null;
	reply: (
		data: InteractionMessageData,
	) => Promise<APIInteractionResponseChannelMessageWithSource>;
	deferReply: (
		options?: DeferReplyOptions,
	) => APIInteractionResponseDeferredChannelMessageWithSource;
	update: (
		data?: InteractionMessageData,
	) => Promise<APIInteractionResponseUpdateMessage>;
	deferUpdate: () => APIInteractionResponseDeferredMessageUpdate;
	showModal: (
		data:
			| APIModalInteractionResponseCallbackData
			| { toJSON(): APIModalInteractionResponseCallbackData },
	) => APIModalInteractionResponse;
	/**
	 * Edit the initial interaction response.
	 */
	editReply: (
		data?: InteractionMessageData,
	) => Promise<APIInteractionResponseUpdateMessage | APIInteractionResponseChannelMessageWithSource>;
	/**
	 * Finalise the interaction response via a webhook follow-up.
	 * This is automatically called by reply() and update() if the interaction is deferred.
	 */
	sendFollowUp?: (token: string, response: APIInteractionResponse, messageId?: string) => Promise<void>;
	/**
	 * Optional state management helpers.
	 */
	canRespond?: (interactionId: string) => boolean;
	trackResponse?: (interactionId: string, token: string, state: 'responded' | 'deferred') => void;
	/**
	 * The selected values from a select menu interaction.
	 * This property is only present for select menu interactions.
	 * For button interactions, this will be undefined.
	 */
	values?: string[];
	/**
	 * Helper method to get selected string values from a string select menu.
	 * @returns Array of selected string values, or empty array if not a string select menu
	 */
	getStringValues: () => string[];
	/**
	 * Helper method to get selected roles from a role select menu.
	 * @returns Array of resolved role objects, or empty array if not a role select menu
	 */
	getRoles: () => APIRole[];
	getRole: () => APIRole | undefined;
	/**
	 * Helper method to get selected channels from a channel select menu.
	 * @returns Array of resolved channel objects, or empty array if not a channel select menu
	 */
	getChannels: () => APIInteractionDataResolvedChannel[];
	getChannel: () => APIInteractionDataResolvedChannel | undefined;
	/**
	 * Helper method to get selected users from a user select menu.
	 * @returns Array of resolved user objects (with optional member data), or empty array if not a user select menu
	 */
	getUsers: () => ResolvedUserOption[];
	getUser: () => ResolvedUserOption | undefined;
	/**
	 * Helper method to get selected mentionables from a mentionable select menu.
	 * @returns Array of resolved mentionable objects (users or roles), or empty array if not a mentionable select menu
	 */
	getMentionables: () => ResolvedMentionableOption[];
	getMentionable: () => ResolvedMentionableOption | undefined;
	/**
	 * Helper method to get an attachment value (if applicable).
	 */
	getAttachment: () => APIAttachment | undefined;
};

export const MessageComponentInteraction = {};

/**
 * Wraps a raw component interaction with helper methods mirroring Discord's expected responses.
 *
 * @param interaction - The raw interaction payload from Discord.
 * @param helpers - Optional callback to capture the final interaction response.
 * @returns A helper-augmented interaction object.
 */
export function createMessageComponentInteraction(
	interaction: APIMessageComponentInteraction,
	helpers?: BaseComponentInteractionHelpers,
): MessageComponentInteraction {
	let capturedResponse: APIInteractionResponse | null = null;
	let isDeferred = false;

	const captureResponse = <T extends APIInteractionResponse>(
		response: T,
	): T => {
		capturedResponse = response;
		return response;
	};

	const reply = async (
		data: InteractionMessageData,
	): Promise<APIInteractionResponseChannelMessageWithSource> => {
		if (helpers?.canRespond && !helpers.canRespond(interaction.id)) {
			throw new Error("[MiniInteraction] Interaction cannot respond: already responded or expired");
		}

		const normalisedData = normaliseInteractionMessageData(data);
		if (!normalisedData) {
			throw new Error(
				"[MiniInteraction] Component replies require response data to be provided.",
			);
		}

		const response = captureResponse({
			type: InteractionResponseType.ChannelMessageWithSource,
			data: normalisedData,
		});

		if (isDeferred && helpers?.sendFollowUp) {
			await helpers.sendFollowUp(interaction.token, response, '@original');
		} else {
			helpers?.onAck?.(response);
		}

		helpers?.trackResponse?.(interaction.id, interaction.token, 'responded');
		return response;
	};

	const deferReply = (
		options?: DeferReplyOptions,
	): APIInteractionResponseDeferredChannelMessageWithSource => {
		if (helpers?.canRespond && !helpers.canRespond(interaction.id)) {
			throw new Error("[MiniInteraction] Interaction cannot defer: already responded or expired");
		}

		const flags = normaliseMessageFlags(options?.flags);

		const response: APIInteractionResponseDeferredChannelMessageWithSource =
			flags !== undefined
				? {
						type: InteractionResponseType.DeferredChannelMessageWithSource,
						data: { flags },
				  }
				: {
						type: InteractionResponseType.DeferredChannelMessageWithSource,
				  };

		captureResponse(response);
		isDeferred = true;
		helpers?.trackResponse?.(interaction.id, interaction.token, 'deferred');
		helpers?.onAck?.(response);
		return response;
	};

	const update = async (
		data?: InteractionMessageData,
	): Promise<APIInteractionResponseUpdateMessage> => {
		if (helpers?.canRespond && !helpers.canRespond(interaction.id)) {
			throw new Error("[MiniInteraction] Interaction cannot update: already responded or expired");
		}

		const normalisedData = normaliseInteractionMessageData(data);

		const response = captureResponse(
			normalisedData
				? {
						type: InteractionResponseType.UpdateMessage,
						data: normalisedData,
				  }
				: {
						type: InteractionResponseType.UpdateMessage,
				  },
		);

		if (isDeferred && helpers?.sendFollowUp) {
			await helpers.sendFollowUp(interaction.token, response, '@original');
		} else {
			helpers?.onAck?.(response);
		}

		helpers?.trackResponse?.(interaction.id, interaction.token, 'responded');
		return response;
	};

	const deferUpdate = (): APIInteractionResponseDeferredMessageUpdate => {
		if (helpers?.canRespond && !helpers.canRespond(interaction.id)) {
			throw new Error("[MiniInteraction] Interaction cannot defer update: already responded or expired");
		}

		const response = captureResponse({
			type: InteractionResponseType.DeferredMessageUpdate,
		});
		isDeferred = true;
		helpers?.trackResponse?.(interaction.id, interaction.token, 'deferred');
		helpers?.onAck?.(response);
		return response;
	};

	const showModal = (
		data:
			| APIModalInteractionResponseCallbackData
			| { toJSON(): APIModalInteractionResponseCallbackData },
	): APIModalInteractionResponse => {
		const resolvedData: APIModalInteractionResponseCallbackData =
			typeof data === "object" &&
			"toJSON" in data &&
			typeof data.toJSON === "function"
				? data.toJSON()
				: (data as APIModalInteractionResponseCallbackData);
		const response = captureResponse({
			type: InteractionResponseType.Modal,
			data: resolvedData,
		});

		helpers?.onAck?.(response);
		return response;
	};

	const editReply = async (
		data?: InteractionMessageData,
	): Promise<APIInteractionResponseUpdateMessage | APIInteractionResponseChannelMessageWithSource> => {
		if (helpers?.canRespond && !helpers.canRespond(interaction.id)) {
			throw new Error("[MiniInteraction] Interaction cannot edit reply: expired");
		}

		const normalisedData = normaliseInteractionMessageData(data);
		const response = captureResponse(
			normalisedData
				? {
						type: InteractionResponseType.ChannelMessageWithSource,
						data: normalisedData,
				  }
				: {
						type: InteractionResponseType.ChannelMessageWithSource,
						data: { content: "" }
				  },
		);

		if (helpers?.sendFollowUp) {
			await helpers.sendFollowUp(interaction.token, response, "@original");
		} else {
			helpers?.onAck?.(response);
		}

		helpers?.trackResponse?.(interaction.id, interaction.token, "responded");
		return response;
	};

	const getResponse = (): APIInteractionResponse | null => capturedResponse;

	// Extract values from select menu interactions
	const values =
		"values" in interaction.data ? interaction.data.values : undefined;

	// Helper methods for select menu interactions
	const getStringValues = (): string[] => {
		return values ?? [];
	};

	const getRoles = (): APIRole[] => {
		if (!values) {
			return [];
		}
		// Type guard: check if resolved data exists
		const resolved =
			"resolved" in interaction.data
				? (interaction.data.resolved as any)
				: undefined;
		if (!resolved?.roles) {
			return [];
		}
		const roles: APIRole[] = [];
		for (const roleId of values) {
			const role = resolved.roles[roleId];
			if (role) {
				roles.push(role);
			}
		}
		return roles;
	};

	const getRole = (): APIRole | undefined => getRoles()[0];

	const getChannels = (): APIInteractionDataResolvedChannel[] => {
		if (!values) {
			return [];
		}
		// Type guard: check if resolved data exists
		const resolved =
			"resolved" in interaction.data
				? (interaction.data.resolved as any)
				: undefined;
		if (!resolved?.channels) {
			return [];
		}
		const channels: APIInteractionDataResolvedChannel[] = [];
		for (const channelId of values) {
			const channel = resolved.channels[channelId];
			if (channel) {
				channels.push(channel);
			}
		}
		return channels;
	};

	const getChannel = (): APIInteractionDataResolvedChannel | undefined => getChannels()[0];

	const getUsers = (): ResolvedUserOption[] => {
		if (!values) {
			return [];
		}
		// Type guard: check if resolved data exists
		const resolved =
			"resolved" in interaction.data
				? (interaction.data.resolved as any)
				: undefined;
		if (!resolved?.users) {
			return [];
		}
		const users: ResolvedUserOption[] = [];
		for (const userId of values) {
			const user = resolved.users[userId];
			if (user) {
				const member = resolved.members?.[userId];
				users.push({ user, member });
			}
		}
		return users;
	};

	const getUser = (): ResolvedUserOption | undefined => getUsers()[0];

	const getMentionables = (): ResolvedMentionableOption[] => {
		if (!values) {
			return [];
		}
		// Type guard: check if resolved data exists
		const resolved =
			"resolved" in interaction.data
				? (interaction.data.resolved as any)
				: undefined;
		if (!resolved) {
			return [];
		}
		const mentionables: ResolvedMentionableOption[] = [];
		for (const id of values) {
			// Check if it's a role
			const role = resolved.roles?.[id];
			if (role) {
				mentionables.push({ type: "role", value: role });
				continue;
			}
			// Check if it's a user
			const user = resolved.users?.[id];
			if (user) {
				const member = resolved.members?.[id];
				mentionables.push({ type: "user", value: { user, member } });
			}
		}
		return mentionables;
	};

	const getMentionable = (): ResolvedMentionableOption | undefined => getMentionables()[0];

	const getAttachment = (): APIAttachment | undefined => {
		if (!values || values.length === 0) return undefined;
		const resolved =
			"resolved" in interaction.data
				? (interaction.data.resolved as any)
				: undefined;
		return resolved?.attachments?.[values[0]];
	};

	return Object.assign(interaction, {
		reply,
		deferReply,
		update,
		deferUpdate,
		showModal,
		editReply,
		getResponse,
		values,
		getStringValues,
		getRoles,
		getRole,
		getChannels,
		getChannel,
		getUsers,
		getUser,
		getMentionables,
		getMentionable,
		getAttachment,
		onAck: helpers?.onAck,
		sendFollowUp: helpers?.sendFollowUp,
		canRespond: helpers?.canRespond,
		trackResponse: helpers?.trackResponse,
	});
}
