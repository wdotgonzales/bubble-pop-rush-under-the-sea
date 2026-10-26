// The strip along the top of the play screen that holds the score and the timer. The field
// is fitted below it, and the game asks for a field that fits the space that is left, so
// both the screen and the code that picks the field need the same numbers.

/** Space above the pills. The real one is larger on a phone with a notch (a safe area). */
export const HUD_TOP_PX = 12
/** Keep in step with .hud-pill in play.css. */
export const HUD_PILL_PX = 68
/** Free space between the pills and the field. */
export const HUD_GAP_PX = 14

/** The strip's height on a screen with no safe area. */
export const HUD_BAND_PX = HUD_TOP_PX + HUD_PILL_PX + HUD_GAP_PX
