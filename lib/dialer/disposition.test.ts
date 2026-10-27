import { describe, expect, it } from "vitest"

import {
  DISPOSITION_OPTIONS,
  dispositionGroupFor,
  dispositionLabel,
  isDispositionStatus,
  isNotReachedGroup,
  isReachedGroup,
} from "./disposition"

describe("disposition vocabulary", () => {
  it("has the thirteen frame-2456 chips in order", () => {
    expect(DISPOSITION_OPTIONS.map((option) => option.label)).toEqual([
      "Confirmed",
      "May come",
      "Will come next class",
      "Will come next week",
      "Visiting home town",
      "Call me back",
      "Call did not connect",
      "Health is not good",
      "Switched off",
      "Out of station",
      "Busy cannot come",
      "Wrong number",
      "Not interested — do not call again",
    ])
  })

  it("maps every chip to the generated status group", () => {
    const groups = Object.fromEntries(
      DISPOSITION_OPTIONS.map((option) => [option.status, dispositionGroupFor(option.status)]),
    )

    expect(groups).toMatchObject({
      CONFIRMED: "CONFIRMED",
      MAY_COME: "MAY_COME",
      WILL_COME_NEXT_CLASS: "DEFERRED",
      WILL_COME_NEXT_WEEK: "DEFERRED",
      VISITING_HOME_TOWN: "DEFERRED",
      CALL_ME_BACK: "DEFERRED",
      HEALTH_IS_NOT_GOOD: "DEFERRED",
      OUT_OF_STATION: "DEFERRED",
      BUSY_CANNOT_COME: "DEFERRED",
      CALL_DID_NOT_CONNECT: "NOT_REACHABLE",
      SWITCHED_OFF: "NOT_REACHABLE",
      WRONG_NUMBER: "WRONG_NUMBER",
      NOT_INTERESTED: "NOT_INTERESTED",
    })
  })

  it("renders the survey only for a reached call", () => {
    expect(isReachedGroup("CONFIRMED")).toBe(true)
    expect(isReachedGroup("MAY_COME")).toBe(true)
    expect(isReachedGroup("DEFERRED")).toBe(true)
    expect(isReachedGroup("NOT_INTERESTED")).toBe(true)
    expect(isReachedGroup("NOT_REACHABLE")).toBe(false)
    expect(isReachedGroup("WRONG_NUMBER")).toBe(false)

    expect(isNotReachedGroup("NOT_REACHABLE")).toBe(true)
    expect(isNotReachedGroup("WRONG_NUMBER")).toBe(true)
    expect(isNotReachedGroup("DEFERRED")).toBe(false)
  })

  it("refuses an unknown status instead of defaulting it", () => {
    expect(isDispositionStatus("CONFIRMED")).toBe(true)
    expect(isDispositionStatus("constructor")).toBe(false)
    expect(isDispositionStatus(null)).toBe(false)
    expect(dispositionLabel("CONFIRMED")).toBe("Confirmed")
  })
})
