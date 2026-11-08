import { describe, expect, it } from "vitest"

import {
  resolveRecordAnchor,
  resolveRecordStep,
} from "@/components/contacts/contact-record-sequence"

const ids = ["a", "b", "c", "d", "e"]

describe("resolveRecordAnchor", () => {
  it("returns null while the contact is still in the visible sequence", () => {
    expect(
      resolveRecordAnchor({
        contactId: "c",
        previousSequence: ids,
        nextSequence: ids,
      }),
    ).toBeNull()
  })

  it("keeps the removed contact's index so the nearest survivor is the anchor", () => {
    expect(
      resolveRecordAnchor({
        contactId: "c",
        previousSequence: ids,
        nextSequence: ["a", "b", "d", "e"],
      }),
    ).toBe(2)
  })

  it("preserves the anchor when a second change removes more rows", () => {
    const first = resolveRecordAnchor({
      contactId: "c",
      previousSequence: ids,
      nextSequence: ["a", "b", "d", "e"],
    })

    expect(first).toBe(2)
    expect(
      resolveRecordAnchor({
        contactId: "c",
        previousSequence: ["a", "b", "d", "e"],
        nextSequence: ["a", "b", "d"],
        currentAnchor: first,
      }),
    ).toBe(2)
    expect(
      resolveRecordAnchor({
        contactId: "c",
        previousSequence: ["a", "b", "d"],
        nextSequence: ["a", "b"],
        currentAnchor: 2,
      }),
    ).toBe(1)
  })

  it("clamps to the last survivor when the removed contact was at the tail", () => {
    expect(
      resolveRecordAnchor({
        contactId: "e",
        previousSequence: ids,
        nextSequence: ["a", "b", "c"],
      }),
    ).toBe(2)
  })

  it("returns null when the sequence empties", () => {
    expect(
      resolveRecordAnchor({
        contactId: "c",
        previousSequence: ids,
        nextSequence: [],
      }),
    ).toBeNull()
  })

  it("returns null when the contact was never in the previous sequence", () => {
    expect(
      resolveRecordAnchor({
        contactId: "z",
        previousSequence: ids,
        nextSequence: ["a", "b"],
      }),
    ).toBeNull()
  })
})

describe("resolveRecordStep", () => {
  it("steps either side of a contact that is still visible", () => {
    expect(
      resolveRecordStep({ contactId: "c", sequence: ids, anchor: 2, direction: "previous" }),
    ).toBe("b")
    expect(resolveRecordStep({ contactId: "c", sequence: ids, anchor: 2, direction: "next" })).toBe(
      "d",
    )
  })

  it("uses the row at the removed position as Next, not the row after it", () => {
    const sequence = ["a", "b", "d", "e"]

    expect(
      resolveRecordStep({ contactId: "c", sequence, anchor: 2, direction: "previous" }),
    ).toBe("b")
    expect(resolveRecordStep({ contactId: "c", sequence, anchor: 2, direction: "next" })).toBe("d")
  })

  it("disables Previous at the first position and Next past the tail", () => {
    expect(
      resolveRecordStep({ contactId: "a", sequence: ids, anchor: 0, direction: "previous" }),
    ).toBeNull()
    expect(
      resolveRecordStep({ contactId: "e", sequence: ids, anchor: 4, direction: "next" }),
    ).toBeNull()
  })
})
