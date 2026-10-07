/**
 * How long typing must pause before an `on_character_entered` action is sent. Slack coalesces
 * keystrokes into one action with the full value (Block Kit Builder sent a single action for a
 * quickly typed "hi") but doesn't document the interval, so this one is ours.
 */
export const CHARACTER_DISPATCH_DELAY = 300;
