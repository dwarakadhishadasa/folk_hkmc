/**
 * The record frame's surface treatments.
 *
 * The source product draws a control as the inset field surface plus three
 * soft shadows, and adds a 1px white ring in dark only; the dialog itself gets
 * a deeper elevation in dark and a hairline one in light. These are class
 * strings rather than components so the dialog, the field editors and the
 * comments pane cannot drift from each other.
 */
export const CONTACT_FIELD_SHADOW =
  "shadow-[0_0_1px_rgba(0,0,0,0.32),0_0_2px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_0_1px_rgba(0,0,0,0.32),0_0_2px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.08)]"

export const CONTACT_FIELD_FOCUS =
  "focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_1px_var(--ring)] focus-visible:outline-none"

export const CONTACT_DIALOG_SHADOW =
  "shadow-[0_0_1px_rgba(0,0,0,0.24),0_0_2px_rgba(0,0,0,0.16),0_3px_4px_rgba(0,0,0,0.06),0_6px_8px_rgba(0,0,0,0.06),0_12px_16px_rgba(0,0,0,0.08),0_18px_32px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_1px_rgb(49,53,62),0_0_1px_rgba(0,0,0,0.72),0_0_2px_rgba(0,0,0,0.48),0_3px_4px_rgba(0,0,0,0.18),0_6px_8px_rgba(0,0,0,0.18),0_12px_16px_rgba(0,0,0,0.24),0_18px_32px_rgba(0,0,0,0.18)]"
