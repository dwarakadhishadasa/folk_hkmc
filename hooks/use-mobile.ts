"use client"

import * as React from 'react'

/**
 * The repository's mobile breakpoint, in CSS pixels.
 *
 * The value Tailwind's `md:` breakpoint uses, so a `md:` class and
 * `useDeviceView()` cannot disagree about what a phone is: narrower than this
 * is a phone, this width and above is a desktop.
 */
export const MOBILE_BREAKPOINT = 768

/**
 * The media query that answers "is this a phone?".
 *
 * `max-width: 767px` rather than `max-width: 768px`, because the boundary is
 * exclusive on both sides — `md:` *starts* at 768 — and a query that answered
 * "mobile" at exactly 768 would put the phone layout and the `md:` styles on
 * the same screen.
 */
const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Which of the two contacts views this device takes.
 *
 * `"mobile"` is the contact list; `"desktop"` is the contacts grid.
 */
export type DeviceView = 'mobile' | 'desktop'

/**
 * The one `MediaQueryList`, created on first use.
 *
 * `matchMedia` returns a new object on every call and the snapshot is read on
 * every render, so the query is asked once and its answer reused.
 */
let mediaQuery: MediaQueryList | null = null

function getMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null
  }

  mediaQuery ??= window.matchMedia(MOBILE_MEDIA_QUERY)

  return mediaQuery
}

/**
 * Subscribe to the breakpoint being crossed.
 *
 * The query's own `change` event is the signal, not a resize listener: it
 * fires exactly when the query starts or stops matching, which is the question
 * being asked.
 */
function subscribe(onChange: () => void): () => void {
  const query = getMediaQuery()

  if (!query) {
    return () => {}
  }

  query.addEventListener('change', onChange)

  return () => query.removeEventListener('change', onChange)
}

/** What the client knows: the viewport, now. */
function getClientSnapshot(): DeviceView {
  return getMediaQuery()?.matches ? 'mobile' : 'desktop'
}

/**
 * What the server knows: nothing.
 *
 * `null` is the third answer, and the reason this hook exists. The server
 * cannot know the viewport, so the first render has to be able to say "not
 * yet" instead of guessing — a guess that mounts the grid's keyboard model
 * and virtualization on a phone pays for the whole grid before swapping it
 * out.
 */
function getServerSnapshot(): DeviceView | null {
  return null
}

/**
 * Which view this device takes — or `null` while the viewport is not yet known.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`, because it is
 * the one API that answers all three questions at once: what the server
 * rendered, what the client knows, and what changed since. The server
 * snapshot is `null`, so the first render shows neither view; the client
 * snapshot takes over as soon as the viewport is known, and the query's
 * `change` event swaps it again when the breakpoint is crossed.
 */
export function useDeviceView(): DeviceView | null {
  return React.useSyncExternalStore<DeviceView | null>(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  )
}

/**
 * Whether this device is a phone.
 *
 * The sidebar's question, and it is the same question `useDeviceView()` asks:
 * `false` until the viewport is known, then the truth.
 */
export function useIsMobile() {
  return useDeviceView() === 'mobile'
}
