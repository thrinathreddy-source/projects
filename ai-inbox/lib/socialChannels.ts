/**
 * Master switch for the Telegram channel and Discord server — paused
 * while both sit at a handful of members, since promoting a visibly dead
 * community signals "nobody's here" and does more harm than not linking
 * it at all. Flip back on once there's real daily traffic to seed them
 * with; nothing else needs to change — the daily cron, homepage buttons,
 * and footer links all read from this one flag.
 */
export const SOCIAL_CHANNELS_ENABLED = false
