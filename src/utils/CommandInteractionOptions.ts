import {
	ApplicationCommandOptionType,
	InteractionResponseType,
	InteractionType,
	type APIInteractionResponse,
	type APIApplicationCommandInteractionDataAttachmentOption,
	type APIApplicationCommandInteractionDataBasicOption,
	type APIApplicationCommandInteractionDataBooleanOption,
	type APIApplicationCommandInteractionDataChannelOption,
	type APIApplicationCommandInteractionDataIntegerOption,
	type APIApplicationCommandInteractionDataMentionableOption,
	type APIApplicationCommandInteractionDataNumberOption,
	type APIApplicationCommandInteractionDataOption,
	type APIApplicationCommandInteractionDataRoleOption,
	type APIApplicationCommandInteractionDataStringOption,
	type APIApplicationCommandInteractionDataSubcommandGroupOption,
	type APIApplicationCommandInteractionDataSubcommandOption,
	type APIApplicationCommandInteractionDataUserOption,
	type APIChatInputApplicationCommandInteraction,
	type APIInteractionDataResolved,
	type APIInteractionDataResolvedChannel,
	type APIInteractionDataResolvedGuildMember,
	type APIModalInteractionResponse,
	type APIModalInteractionResponseCallbackData,
	type APIInteractionResponseChannelMessageWithSource,
	type APIInteractionResponseDeferredChannelMessageWithSource,
	type APIInteractionResponseUpdateMessage,
	type APIRole,
	type APIUser,
	type APIAttachment,
	type MessageFlags,
} from "discord-api-types/v10";
import {
	DeferredResponseData,
	DeferReplyOptions,
	InteractionMessageData,
	normaliseInteractionMessageData,
	normaliseMessageFlags,
} from "./interactionMessageHelpers.js";

type BasicInteractionOption =
	APIApplicationCommandInteractionDataBasicOption<InteractionType.ApplicationCommand>;

type ResolvedRecords<T> = Record<string, T> | undefined;

export type ResolvedUserOption = {
	user: APIUser;
	member?: APIInteractionDataResolvedGuildMember;
};

export const ResolvedUserOption = {};

export type MentionableOption =
	| { type: "user"; value: ResolvedUserOption }
	| { type: "role"; value: APIRole };

export const MentionableOption = {};

type FocusedOptionsResult = {
	subcommandGroup: string | null;
	subcommand: string | null;
	options: BasicInteractionOption[];
};

const OPTION_TYPE_LABEL: Record<ApplicationCommandOptionType, string> = {
	[ApplicationCommandOptionType.Subcommand]: "subcommand",
	[ApplicationCommandOptionType.SubcommandGroup]: "subcommand group",
	[ApplicationCommandOptionType.String]: "string",
	[ApplicationCommandOptionType.Integer]: "integer",
	[ApplicationCommandOptionType.Boolean]: "boolean",
	[ApplicationCommandOptionType.User]: "user",
	[ApplicationCommandOptionType.Channel]: "channel",
	[ApplicationCommandOptionType.Role]: "role",
	[ApplicationCommandOptionType.Mentionable]: "mentionable",
	[ApplicationCommandOptionType.Number]: "number",
	[ApplicationCommandOptionType.Attachment]: "attachment",
};

function isSubcommandOption(
	option: APIApplicationCommandInteractionDataOption,
): option is APIApplicationCommandInteractionDataSubcommandOption {
	return option.type === ApplicationCommandOptionType.Subcommand;
}

function isSubcommandGroupOption(
	option: APIApplicationCommandInteractionDataOption,
): option is APIApplicationCommandInteractionDataSubcommandGroupOption {
	return option.type === ApplicationCommandOptionType.SubcommandGroup;
}

function resolveFocusedOptions(
	options: APIApplicationCommandInteractionDataOption[] | undefined,
): FocusedOptionsResult {
	if (!options || options.length === 0) {
		return { subcommandGroup: null, subcommand: null, options: [] };
	}

	const [firstOption] = options;

	if (isSubcommandGroupOption(firstOption)) {
		const [firstSubcommand] = firstOption.options ?? [];
		if (firstSubcommand && isSubcommandOption(firstSubcommand)) {
			return {
				subcommandGroup: firstOption.name,
				subcommand: firstSubcommand.name,
				options: firstSubcommand.options ?? [],
			};
		}

		return {
			subcommandGroup: firstOption.name,
			subcommand: null,
			options: [],
		};
	}

	if (isSubcommandOption(firstOption)) {
		return {
			subcommandGroup: null,
			subcommand: firstOption.name,
			options: firstOption.options ?? [],
		};
	}

	return {
		subcommandGroup: null,
		subcommand: null,
		options: options as BasicInteractionOption[],
	};
}

export class CommandInteractionOptionResolver {
	public readonly raw: ReadonlyArray<APIApplicationCommandInteractionDataOption>;

	private readonly resolved: APIInteractionDataResolved | undefined;
	private readonly focusedOptions: BasicInteractionOption[];
	private readonly subcommand: string | null;
	private readonly subcommandGroup: string | null;

	constructor(
		options: APIApplicationCommandInteractionDataOption[] | undefined,
		resolved: APIInteractionDataResolved | undefined,
	) {
		this.raw = Object.freeze([...(options ?? [])]);
		this.resolved = resolved;

		const focused = resolveFocusedOptions(options);
		this.focusedOptions = focused.options;
		this.subcommand = focused.subcommand;
		this.subcommandGroup = focused.subcommandGroup;
	}

	getSubcommand(required = true): string | null {
		if (this.subcommand) {
			return this.subcommand;
		}

		if (required) {
			throw new Error(
				"Expected a subcommand to be present on this interaction",
			);
		}

		return null;
	}

	getSubcommandGroup(required = true): string | null {
		if (this.subcommandGroup) {
			return this.subcommandGroup;
		}

		if (required) {
			throw new Error(
				"Expected a subcommand group to be present on this interaction",
			);
		}

		return null;
	}

	getString(name: string, required = false): string | null {
		const option =
			this.extractOption<APIApplicationCommandInteractionDataStringOption>(
				name,
				ApplicationCommandOptionType.String,
				required,
			);
		return option ? option.value : null;
	}

	getInteger(name: string, required = false): number | null {
		const option = this.extractOption<
			APIApplicationCommandInteractionDataIntegerOption<InteractionType.ApplicationCommand>
		>(name, ApplicationCommandOptionType.Integer, required);
		return option ? option.value : null;
	}

	getNumber(name: string, required = false): number | null {
		const option = this.extractOption<
			APIApplicationCommandInteractionDataNumberOption<InteractionType.ApplicationCommand>
		>(name, ApplicationCommandOptionType.Number, required);
		return option ? option.value : null;
	}

	getBoolean(name: string, required = false): boolean | null {
		const option =
			this.extractOption<APIApplicationCommandInteractionDataBooleanOption>(
				name,
				ApplicationCommandOptionType.Boolean,
				required,
			);
		return option ? option.value : null;
	}

	getUser(name: string, required = false): ResolvedUserOption | null {
		const option =
			this.extractOption<APIApplicationCommandInteractionDataUserOption>(
				name,
				ApplicationCommandOptionType.User,
				required,
			);

		if (!option) {
			return null;
		}

		const resolvedUser = this.resolveUser(option.value);
		if (!resolvedUser) {
			if (required) {
				throw new Error(
					`Resolved data for user option "${name}" is missing`,
				);
			}

			return null;
		}

		return resolvedUser;
	}

	getRole(name: string, required = false): APIRole | null {
		const option =
			this.extractOption<APIApplicationCommandInteractionDataRoleOption>(
				name,
				ApplicationCommandOptionType.Role,
				required,
			);

		if (!option) {
			return null;
		}

		const role = this.resolveRole(option.value);
		if (!role && required) {
			throw new Error(
				`Resolved data for role option "${name}" is missing`,
			);
		}

		return role ?? null;
	}

	getChannel(
		name: string,
		required = false,
	): APIInteractionDataResolvedChannel | null {
		const option =
			this.extractOption<APIApplicationCommandInteractionDataChannelOption>(
				name,
				ApplicationCommandOptionType.Channel,
				required,
			);

		if (!option) {
			return null;
		}

		const channel = this.resolveChannel(option.value);
		if (!channel && required) {
			throw new Error(
				`Resolved data for channel option "${name}" is missing`,
			);
		}

		return channel ?? null;
	}

	getAttachment(name: string, required = false): APIAttachment | null {
		const option =
			this.extractOption<APIApplicationCommandInteractionDataAttachmentOption>(
				name,
				ApplicationCommandOptionType.Attachment,
				required,
			);

		if (!option) {
			return null;
		}

		const attachment = this.resolveAttachment(option.value);
		if (!attachment && required) {
			throw new Error(
				`Resolved data for attachment option "${name}" is missing`,
			);
		}

		return attachment ?? null;
	}

	getMentionable(name: string, required = false): MentionableOption | null {
		const option =
			this.extractOption<APIApplicationCommandInteractionDataMentionableOption>(
				name,
				ApplicationCommandOptionType.Mentionable,
				required,
			);

		if (!option) {
			return null;
		}

		const role = this.resolveRole(option.value);
		if (role) {
			return { type: "role", value: role };
		}

		const user = this.resolveUser(option.value);
		if (user) {
			return { type: "user", value: user };
		}

		if (required) {
			throw new Error(
				`Resolved data for mentionable option "${name}" is missing`,
			);
		}

		return null;
	}

	getRawOption(
		name: string,
	): APIApplicationCommandInteractionDataOption | null {
		return (
			this.focusedOptions.find((option) => option.name === name) ?? null
		);
	}

	private extractOption<Option extends BasicInteractionOption>(
		name: string,
		type: ApplicationCommandOptionType,
		required: boolean,
	): Option | null {
		const option = this.focusedOptions.find(
			(candidate) => candidate.name === name,
		);

		if (!option) {
			if (required) {
				throw new Error(
					`Required ${OPTION_TYPE_LABEL[type]} option "${name}" is missing`,
				);
			}

			return null;
		}

		if (option.type !== type) {
			throw new Error(
				`Option "${name}" is a ${OPTION_TYPE_LABEL[option.type]
				}, expected ${OPTION_TYPE_LABEL[type]}`,
			);
		}

		return option as Option;
	}

	private resolveAttachment(id: string): APIAttachment | undefined {
		return this.getResolvedRecord(this.resolved?.attachments, id);
	}

	private resolveChannel(
		id: string,
	): APIInteractionDataResolvedChannel | undefined {
		return this.getResolvedRecord(this.resolved?.channels, id);
	}

	private resolveRole(id: string): APIRole | undefined {
		return this.getResolvedRecord(this.resolved?.roles, id);
	}

	private resolveUser(id: string): ResolvedUserOption | null {
		const user = this.getResolvedRecord(this.resolved?.users, id);
		if (!user) {
			return null;
		}

		const member = this.getResolvedRecord(this.resolved?.members, id);
		return { user, member: member ?? undefined };
	}

	private getResolvedRecord<T>(
		records: ResolvedRecords<T>,
		id: string,
	): T | undefined {
		return records?.[id];
	}
}

export interface CommandInteraction
	extends Omit<APIChatInputApplicationCommandInteraction, "data"> {
	data: Omit<APIChatInputApplicationCommandInteraction["data"], "options"> & {
		options: CommandInteractionOptionResolver;
	};
	options: CommandInteractionOptionResolver;
	getResponse(): APIInteractionResponse | null;
	reply(
		data: InteractionMessageData,
	): Promise<APIInteractionResponseChannelMessageWithSource>;
	edit(data?: InteractionMessageData): APIInteractionResponseUpdateMessage;
	followUp(data: InteractionMessageData): Promise<void>;
	editReply(data?: InteractionMessageData): Promise<APIInteractionResponseChannelMessageWithSource | APIInteractionResponseUpdateMessage>;
	deferReply(
		options?: DeferReplyOptions,
	): APIInteractionResponseDeferredChannelMessageWithSource;
	showModal(
		data:
			| APIModalInteractionResponseCallbackData
			| { toJSON(): APIModalInteractionResponseCallbackData },
	): APIModalInteractionResponse;
	withTimeoutProtection<T>(
		operation: () => Promise<T>,
		deferOptions?: DeferReplyOptions,
	): Promise<T>;
	canRespond?(interactionId: string): boolean;
	trackResponse?(interactionId: string, token: string, state: 'responded' | 'deferred'): void;
	onAck?(response: APIInteractionResponse): void;
	sendFollowUp?(token: string, response: APIInteractionResponse, messageId?: string): Promise<void>;
}

export const CommandInteraction = {};

export function createCommandInteraction(
	interaction: APIChatInputApplicationCommandInteraction,
	helpers?: {
		canRespond?: (interactionId: string) => boolean;
		trackResponse?: (interactionId: string, token: string, state: 'responded' | 'deferred') => void;
		logTiming?: (interactionId: string, operation: string, startTime: number, success: boolean) => void;
		onAck?: (response: APIInteractionResponse) => void;
		sendFollowUp?: (token: string, response: APIInteractionResponse, messageId?: string) => Promise<void>;
	}
): CommandInteraction {
	const options = new CommandInteractionOptionResolver(
		interaction.data.options,
		interaction.data.resolved,
	);

	let capturedResponse: APIInteractionResponse | null = null;
	let isDeferred = false;
	let hasResponded = false;

	const captureResponse = <T extends APIInteractionResponse>(
		response: T,
	): T => {
		capturedResponse = response;
		return response;
	};

	function createMessageResponse(
		type: InteractionResponseType.ChannelMessageWithSource,
		data: InteractionMessageData,
	): APIInteractionResponseChannelMessageWithSource;
	function createMessageResponse(
		type: InteractionResponseType.UpdateMessage,
		data?: InteractionMessageData,
	): APIInteractionResponseUpdateMessage;
	function createMessageResponse(
		type:
			| InteractionResponseType.ChannelMessageWithSource
			| InteractionResponseType.UpdateMessage,
		data?: InteractionMessageData,
	):
		| APIInteractionResponseChannelMessageWithSource
		| APIInteractionResponseUpdateMessage {
		const normalisedData = normaliseInteractionMessageData(data);

		if (type === InteractionResponseType.ChannelMessageWithSource) {
			if (!normalisedData) {
				throw new Error(
					"[MiniInteraction] Channel message responses require data to be provided.",
				);
			}

			return captureResponse({
				type,
				data: normalisedData,
			});
		}

		if (normalisedData) {
			return captureResponse({ type, data: normalisedData });
		}

		return captureResponse({ type });
	}

	const createDeferredResponse = (
		data?: DeferredResponseData,
	): APIInteractionResponseDeferredChannelMessageWithSource => {
		if (!data) {
			return captureResponse({
				type: InteractionResponseType.DeferredChannelMessageWithSource,
			});
		}

		return captureResponse({
			type: InteractionResponseType.DeferredChannelMessageWithSource,
			data: { flags: normaliseMessageFlags(data.flags) as MessageFlags },
		});
	};

	const commandInteraction: CommandInteraction = {
		...interaction,
		data: {
			...interaction.data,
			options,
		},
		options,
		getResponse() {
			return capturedResponse;
		},
		async reply(data) {
			if (this.canRespond && !this.canRespond(this.id)) {
				throw new Error('Interaction cannot respond: already responded or expired');
			}

			const response = createMessageResponse(
				InteractionResponseType.ChannelMessageWithSource,
				data,
			);

			if (isDeferred && this.sendFollowUp) {
				await this.sendFollowUp(this.token, response, '@original');
			} else {
				this.onAck?.(response);
			}

			this.trackResponse?.(this.id, this.token, 'responded');
			hasResponded = true;

			return response;
		},
		async followUp(data) {
			const normalisedData = normaliseInteractionMessageData(data);
			if (!normalisedData) {
				throw new Error('[MiniInteraction] followUp requires data');
			}

			const response: APIInteractionResponseChannelMessageWithSource = {
				type: InteractionResponseType.ChannelMessageWithSource,
				data: normalisedData,
			};

			if (this.sendFollowUp) {
				await this.sendFollowUp(this.token, response, '');
			}

			this.trackResponse?.(this.id, this.token, 'responded');
			hasResponded = true;
		},
		edit(data) {
			return createMessageResponse(
				InteractionResponseType.UpdateMessage,
				data,
			);
		},
		async editReply(data) {
			if (this.canRespond && !this.canRespond(this.id)) {
				throw new Error('Interaction cannot edit reply: expired');
			}

			const normalizedData = normaliseInteractionMessageData(data);
			if (!normalizedData) {
				throw new Error('[MiniInteraction] editReply requires data');
			}

			const response: APIInteractionResponseChannelMessageWithSource = {
				type: InteractionResponseType.ChannelMessageWithSource,
				data: normalizedData,
			};

			if (this.sendFollowUp && (isDeferred || hasResponded)) {
				await this.sendFollowUp(this.token, response, '@original');
			} else {
				captureResponse(response);
				this.onAck?.(response);
			}

			this.trackResponse?.(this.id, this.token, 'responded');
			hasResponded = true;
			return response;
		},
		deferReply(options) {
			if (this.canRespond && !this.canRespond(this.id)) {
				throw new Error('Interaction cannot defer: already responded or expired');
			}

			const response = createDeferredResponse(
				options?.flags !== undefined
					? { flags: options.flags }
					: undefined,
			);

			this.trackResponse?.(this.id, this.token, 'deferred');
			isDeferred = true;
			this.onAck?.(response);

			return response;
		},
		showModal(data) {
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

			this.onAck?.(response);
			return response;
		},

		async withTimeoutProtection<T>(
			operation: () => Promise<T>,
			deferOptions?: DeferReplyOptions,
		): Promise<T> {
			const startTime = Date.now();
			let deferred = false;

			const deferTimer = setTimeout(async () => {
				if (!deferred) {
					console.warn(
						"[MiniInteraction] Auto-deferring interaction due to slow operation. " +
						"Consider using deferReply() explicitly for better user experience."
					);
					this.deferReply(deferOptions);
					deferred = true;
				}
			}, 2500);

			try {
				const result = await operation();

				clearTimeout(deferTimer);

				const elapsed = Date.now() - startTime;
				if (elapsed > 2000 && !deferred) {
					console.warn(
						`[MiniInteraction] Operation completed in ${elapsed}ms. ` +
						"Consider using deferReply() for operations > 2 seconds."
					);
				}

				return result;
			} catch (error) {
				clearTimeout(deferTimer);
				throw error;
			}
		},

		canRespond: helpers?.canRespond,
		trackResponse: helpers?.trackResponse,
		onAck: helpers?.onAck,
		sendFollowUp: helpers?.sendFollowUp,
	};

	return commandInteraction;
}