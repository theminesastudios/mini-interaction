import { PermissionFlagsBits } from "discord-api-types/v10";

/** Convenience mapping of Discord permission bit flags for MiniInteraction usage. */
export const MiniPermFlags = {
        ...PermissionFlagsBits,
} as const;
