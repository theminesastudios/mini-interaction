import type {
        APIInteractionResponse,
        RESTPostAPIChatInputApplicationCommandsJSONBody,
        RESTPostAPIContextMenuApplicationCommandsJSONBody,
        RESTPostAPIPrimaryEntryPointApplicationCommandJSONBody,
} from "discord-api-types/v10";

import type { CommandInteraction } from "../utils/CommandInteractionOptions.js";
import type {
        UserContextMenuInteraction,
        MessageContextMenuInteraction,
        AppCommandInteraction,
} from "../utils/ContextMenuInteraction.js";
import type {
    ButtonInteraction,
    StringSelectInteraction,
    RoleSelectInteraction,
    UserSelectInteraction,
    ChannelSelectInteraction,
    MentionableSelectInteraction,
    RadioInteraction,
    CheckboxInteraction
} from "../utils/MessageComponentInteraction.js";
import type { ModalSubmitInteraction } from "../utils/ModalSubmitInteraction.js";
import type { JSONEncodable } from "../builders/shared.js";

import type { CommandBuilder } from "../commands/CommandBuilder.js";
import type {
        MessageCommandBuilder,
        UserCommandBuilder,
        AppCommandBuilder,
} from "../commands/ContextMenuCommandBuilder.js";

/** Handler signature for slash command executions within MiniInteraction. */
export type SlashCommandHandler = (
	interaction: CommandInteraction,
) => Promise<APIInteractionResponse | void> | APIInteractionResponse | void;

/** Handler signature for user context menu command executions within MiniInteraction. */
export type UserCommandHandler = (
	interaction: UserContextMenuInteraction,
) => Promise<APIInteractionResponse | void> | APIInteractionResponse | void;

/** Handler signature for message context menu command executions within MiniInteraction. */
export type MessageCommandHandler = (
        interaction: MessageContextMenuInteraction,
) => Promise<APIInteractionResponse | void> | APIInteractionResponse | void;

/** Handler signature for primary entry point command executions within MiniInteraction. */
export type AppCommandHandler = (
        interaction: AppCommandInteraction,
) => Promise<APIInteractionResponse | void> | APIInteractionResponse | void;

/** Union of all command handler types. */
export type CommandHandler =
        | SlashCommandHandler
        | UserCommandHandler
        | MessageCommandHandler
        | AppCommandHandler;

/** Structure representing a slash command definition and its runtime handler. */
export type InteractionCommand = {
        data:
                | RESTPostAPIChatInputApplicationCommandsJSONBody
                | RESTPostAPIContextMenuApplicationCommandsJSONBody
                | RESTPostAPIPrimaryEntryPointApplicationCommandJSONBody
                | CommandBuilder
                | UserCommandBuilder
                | MessageCommandBuilder
                | AppCommandBuilder
                | JSONEncodable<
                        | RESTPostAPIChatInputApplicationCommandsJSONBody
                        | RESTPostAPIContextMenuApplicationCommandsJSONBody
                        | RESTPostAPIPrimaryEntryPointApplicationCommandJSONBody
                  >;
        handler: CommandHandler;
};

/** Handler for any message component interaction */
export type ComponentInteraction =
    | ButtonInteraction
    | StringSelectInteraction
    | RoleSelectInteraction
    | UserSelectInteraction
    | ChannelSelectInteraction
    | MentionableSelectInteraction
    | RadioInteraction
    | CheckboxInteraction;

/** Structure for a standalone component handler */
export type InteractionComponent = {
    customId: string;
    handler: (interaction: ComponentInteraction) => Promise<APIInteractionResponse | void> | APIInteractionResponse | void;
};

/** Structure for a standalone modal handler */
export type InteractionModal = {
    customId: string;
    handler: (interaction: ModalSubmitInteraction) => Promise<APIInteractionResponse | void> | APIInteractionResponse | void;
};
