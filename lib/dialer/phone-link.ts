/**
 * Turning a contact's number into a tap that reaches the phone's own dialer.
 *
 * `tel:` is an `ACTION_VIEW` intent, so any app that registered a handler can
 * claim it — Google Voice does, and once it is the default the call never
 * reaches the SIM. `ACTION_DIAL` is only registered by dialers, so an explicit
 * `intent://` keeps the call on the handset without depending on the device's
 * default-app setting.
 */

/** The characters worth dialing: digits, a leading `+`, and pauses. */
export function dialDigits(phone: string): string {
  return phone.replace(/[^\d+,;#*]/g, "")
}

/** The plain URI, and the only form that works off Android. */
export function telHref(phone: string): string {
  return `tel:${dialDigits(phone)}`
}

/**
 * Android Chrome's intent URI for `ACTION_DIAL`, or `null` everywhere else.
 *
 * Desktop and iOS reject the intent scheme outright, so they keep `tel:`.
 * A WebView that does not implement `intent://` is treated as any other
 * unsupported scheme and falls through to `telHref` at the call site.
 */
export function androidDialIntent(phone: string, userAgent: string): string | null {
  if (!/android/i.test(userAgent)) {
    return null
  }

  const digits = dialDigits(phone)
  if (digits.length === 0) {
    return null
  }

  return (
    "intent://#Intent;action=android.intent.action.DIAL;scheme=tel;" +
    `data=tel:${digits};S.phone=${digits};end`
  )
}

/** The href a call control should carry for this device. */
export function callHref(phone: string, userAgent: string): string {
  return androidDialIntent(phone, userAgent) ?? telHref(phone)
}
