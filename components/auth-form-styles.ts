/**
 * The shared surface, field, label and button classes for the staff and
 * participant auth forms.
 *
 * They are the same tokens `contact-form.tsx` and `new-session-popover.tsx`
 * use, so the login and register pages follow the theme instead of pinning a
 * cream page, a white card and a navy header.
 */
export const AUTH_PANEL_CLASS =
  "overflow-hidden rounded-lg border border-border bg-card shadow-overlay"

export const AUTH_PANEL_HEADER_CLASS =
  "border-b border-white/10 bg-panel-header px-6 py-5 text-white"

export const AUTH_PANEL_BODY_CLASS = "p-5 sm:p-6"

export const AUTH_FIELD_CLASS =
  "w-full rounded-lg border border-input bg-field px-4 py-3 text-sm text-foreground shadow-sm transition-all placeholder:text-muted-foreground/60 focus:border-[var(--program-accent)] focus:outline-none focus:ring-4 focus:ring-ring/15 disabled:bg-muted disabled:text-muted-foreground"

export const AUTH_LABEL_CLASS = "block text-sm font-semibold text-foreground"

export const AUTH_PRIMARY_BUTTON_CLASS =
  "inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--program-accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-[var(--program-accent)]/20 transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[var(--program-accent-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:hover:translate-y-0"

export const AUTH_ERROR_CLASS =
  "rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"

export const AUTH_NOTICE_CLASS =
  "rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm leading-6 text-foreground"
