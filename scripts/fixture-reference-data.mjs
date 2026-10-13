/**
 * Reference data for the preview and bulk fixture seeders.
 *
 * Shared so the two scripts cannot disagree about what a Chennai location or a
 * Prabhupad book is called. A contact's location is rendered through the grid's
 * `linked` renderer and its books through the `multiselect` renderer, so these
 * strings are what a reviewer actually reads on screen — `preview-fixture-book-0`
 * proved the plumbing but told nobody anything.
 *
 * ## Why every value keeps the fixture tag
 *
 * The tag is load-bearing in four places, and dropping it would mean editing
 * gates rather than seeding data:
 *
 * - `bulk-contact-fixtures.mjs --wipe` deletes by `like('preview-fixture-%')`.
 * - `e2e/fixtures/bulk-contacts.ts` selects locations by the same prefix.
 * - `bulk-fixtures.spec.ts` asserts every generated name carries it.
 * - `grid-editors.spec.ts`'s `secondBookFor` picks candidates by name.
 *
 * So the tag stays the first token and the *value* becomes real. A contact reads
 * `preview-fixture-bulk-folk-0042-Rukmini Devi`: unmistakably a fixture, and a
 * name an operator would recognise.
 *
 * ## Why the staff emails use a `.test` domain
 *
 * `public.users.email` is a **sign-in identity**, not decoration. A password reset
 * against a seeded row must not be deliverable, so these are shaped like real
 * addresses inside RFC 2606's reserved TLD — `t.narayanan@folk.fixture.test` —
 * which can never resolve to a real mailbox. `example.com` was equally safe and
 * equally unreadable; the name is what makes a sign-in list legible.
 */

/**
 * Chennai temples and neighbourhoods, as the programme would name a location.
 *
 * ## Why the pool is split in two
 *
 * `locations` has **no uniqueness constraint** — only a primary key — so two
 * rows may legitimately share a name. But the two seeders both create locations
 * in the same programme, and each needs to tell its own rows from the other's:
 * the bulk generator asserts against "every generated location", and the spec
 * compares the two sets. When both drew from one pool, "T. Nagar Temple" existed
 * twice per programme and neither side could say which was which.
 *
 * A disjoint split is therefore load-bearing, and it is also why there is no
 * `preview-fixture-` marker on a location name: the *name itself* is the
 * discriminator. `locations` is referenced by id everywhere, so nothing breaks by
 * giving it a plain name — only the seeder's own bookkeeping needed the tag, and
 * this is what replaced it.
 *
 * Consequence worth stating: the pool cannot grow past `CHENNAI_LOCATIONS.length`
 * without one seeder reusing the other's temples. Twelve is comfortable for two
 * seeder locations plus five bulk ones, but it is a ceiling rather than an
 * open-ended list.
 */
export const PREVIEW_LOCATIONS = [
  "T. Nagar Temple",
  "Velachery Temple",
];

/** The bulk generator's own locations — never one of the preview seeder's two. */
export const BULK_LOCATIONS = [
  "Triplicane Temple",
  "Mylapore Temple",
  "Adyar Temple",
  "Nanganallur Temple",
  "Perungalathur Temple",
  "Koyambedu Temple",
  "Tambaram Temple",
  "Chennai Central Temple",
  "Washermanpet Temple",
  "Royapettah Temple",
];

/**
 * Books by A.C. Bhaktivedanta Swami Prabhupad.
 *
 * His own translated and authored titles, which is what `books_read` records. A
 * multiselect cell renders one pill per value, so the pool is sized well past the
 * two-to-four any single contact holds — otherwise every row would eventually show
 * the same full list.
 */
export const PRABHUPAD_BOOKS = [
  "Bhagavad-gita As It Is",
  "Krsna: The Supreme Personality of Godhead",
  "Srimad Bhagavatam",
  "Caitanya-caritamrita",
  "Nectar of Instruction",
  "Nectar of Devotion",
  "The Science of Krsna Consciousness",
  "Life Comes From Life",
  "Perfect Problems, Perfect Solutions",
  "Self-Realization",
  "Gita for Beginners",
  "The Essence of Bhaktivedanta",
  "Raising Children in Krishna Consciousness",
  "The Journey Home",
  "Srimad Bhagavatam: Canto 1",
];

/**
 * First names, then family names.
 *
 * ## Why this is two pools and not one list of full names
 *
 * A generated contact's name must be **unique as a string**, and for two reasons
 * that have nothing to do with the schema:
 *
 *   - The generator's resume logic compares generated names against what is
 *     already in the database, so a repeated name makes it impossible to tell
 *     "already inserted" from "still missing" — a resumed run would skip a row or
 *     duplicate one.
 *   - `getRowLabel` names the row in the delete confirmation, and the bulk specs
 *     address rows by name. 250 rows all reading "Rukmini Devi" would make both
 *     useless.
 *
 * `contacts.name` itself carries **no uniqueness constraint** — only `id` is
 * unique — so this is an idempotency requirement, not a schema one. Cross-pairing
 * 48 given names against 48 family names gives 2,304 distinct names, comfortably
 * above the 250-row default and the 1,052-row `seed:bulk-full`, without a suffix.
 *
 * The pairs are indexed rather than shuffled, so a run is byte-identical on
 * re-seed: `givenNames[i % g]` with `familyNames[(i * 7 + floor(i / g)) % f]`,
 * which walks the family list without repeating a pairing until the cross product
 * is exhausted.
 */
export const GIVEN_NAMES = [
  "Rukmini", "Sundaram", "Lakshmi", "Anand", "Kavitha", "Mohan", "Priya", "Ramesh",
  "Deepa", "Suresh", "Meena", "Vijay", "Saranya", "Ganesh", "Divya", "Nandini",
  "Arun", "Kavya", "Murali", "Bhavani", "Sathish", "Padmavathi", "Radhakrishnan",
  "Shanti", "Praveen", "Nithya", "Harish", "Latha", "Venkataraman", "Swathi",
  "Girish", "Anjali", "Siddharth", "Pavithra", "Vasanthi", "Karthik", "Chitra",
  "Srinivasan", "Deepika", "Mohanraj", "Kumari", "Ranganathan", "Jayashree",
  "Balaji", "Vasundhara", "Sathishkumar", "Padmapriya", "Giridhar", "Lakshmidevi",
];

export const FAMILY_NAMES = [
  "Devi", "Iyer", "Narayanan", "Venkatesan", "Raman", "Rajagopal",
  "Balasubramanian", "Iyengar", "Chandrasekhar", "Kannan", "Krishnan",
  "Raghavan", "Sundaram", "Murugan", "Parthasarathy", "Subramanian",
  "Chidambaram", "Venkataraman", "Krishnaswamy", "Ramachandran",
  "Gopalakrishnan", "Padmavathi", "Vasudevan", "Balaji", "Sundaresan",
  "Manivannan", "Arunachalam", "Sastry", "Rajendran", "Kannadasan",
  "Mahadevan", "Ramesh", "Neelakantan", "Kothandaraman", "Ravindran",
  "Balasubramaniam", "Venkatesh", "Rajan", "Ponnusamy", "Lakshmi",
  "Gopal", "Anand", "Muthukumar", "Sivakumar", "Perumal", "Chandran",
  "Srinivasan", "Thiruvengadam", "Palaniappan",
];

/** Alias so a caller reads as "the contact name pool" rather than two halves. */
export const CONTACT_NAMES = { given: GIVEN_NAMES, family: FAMILY_NAMES };

/** Colleges, as Chennai students would name theirs. */
export const COLLEGES = [
  "M.O.P. Vaishnav College", "Sathyabama Institute", "Vellore Institute of Technology",
  "SRM Institute of Science and Technology", "Anna University", "B.S. Abdur Rahman Crescent Institute",
  "National Institute of Technology, Tiruchirappalli", "Hindustan Institute of Technology",
  "Saveetha Institute of Medical Sciences", "Madras Christian College",
  "Bharathiar University", "University of Madras", "SSN College of Engineering",
];

/** Employers, as Chennai's software and manufacturing corridor would. */
export const COMPANIES = [
  "TCS", "Infosys", "Wipro", "HCL Technologies", "Tech Mahindra", "Zoho Corporation",
  "Madras Softwares Limited", "Sundaram Finance", "Cognizant", "Adani Ports",
  "Tata Consultancy Engineering", "Ramco Systems", "Five-Star Finance",
];

/** Designations matching the employer set above. */
export const DESIGNATIONS = [
  "Software Engineer", "Senior Analyst", "Team Lead", "Account Manager", "Product Designer",
  "Data Engineer", "Operations Manager", "Quality Analyst", "Business Analyst", "Support Engineer",
  "Technical Architect", "Delivery Manager",
];

/**
 * Notes, written as a person would leave them.
 *
 * A fixture note was `preview-fixture-bulk note 8`, which told a reviewer nothing
 * and made a per-column filter test a substring match rather than a real one.
 */
export const NOTES = [
  "Met at the temple festival, came for the evening bhajana.",
  "Requested a copy of Bhagavad-gita As It Is. Follow up next month.",
  "Regular since 2019. Prefers the morning class.",
  "Asked about the kids' class on Sunday afternoons.",
  "Visited by two friends who also joined. Send the schedule.",
  "Phone number changed last month; the old one still rings.",
  "Interested in the Haridwar yatra in November.",
  "Came with a neighbour. Both joined the sankirtana.",
  "Wants a follow-up call after the festival ends.",
  "Reads slowly, so send the book in English.",
  "Bringing the family in December. Seats needed.",
  "Said to call back after the pongal holidays.",
  "Very regular. Sings lead in the morning bhajana.",
  "Asked whether the sessions are recorded. Send the link.",
  "Introduced by the Preacher at Triplicane.",
  "Quiet, prefers a call in the evening.",
];

/**
 * Staff identities, one per role, keyed by program.
 *
 * The domain is RFC 2606's reserved `.test`, so these can never be delivered to.
 * `public.users.email` is the sign-in key and `public.users.id` must equal
 * `auth.users.id` (DW-3), so these are written by the seeder that owns auth and
 * are never edited by a data-only reseed.
 */
export const STAFF_EMAILS = {
  folk: {
    Admin: "kavitha.raman@folk.fixture.test",
    Preacher: "anand.narayanan@folk.fixture.test",
    Volunteer: "divya.parthasarathy@folk.fixture.test",
    Assistant: "suresh.kannan@folk.fixture.test",
  },
  "gita-life": {
    Admin: "kavitha.raman@gita-life.fixture.test",
    Preacher: "anand.narayanan@gita-life.fixture.test",
    Volunteer: "divya.parthasarathy@gita-life.fixture.test",
    Assistant: "suresh.kannan@gita-life.fixture.test",
  },
};

/** Staff display names, matching the emails above. */
export const STAFF_NAMES = {
  folk: {
    Admin: "Kavitha Raman",
    Preacher: "Anand Narayanan",
    Volunteer: "Divya Parthasarathy",
    Assistant: "Suresh Kannan",
  },
  "gita-life": {
    Admin: "Kavitha Raman",
    Preacher: "Anand Narayanan",
    Volunteer: "Divya Parthasarathy",
    Assistant: "Suresh Kannan",
  },
};

/**
 * How `collected_by_id` is distributed across generated contacts.
 *
 * `collected_by_id` is who recorded the contact; `assigned_preacher_id` is who
 * owns it. They are separate columns and this split keeps them separate, so the
 * grid shows a collector that is sometimes not the owner — the case a real
 * programme hits when an Assistant enters a contact a Preacher then follows up on.
 *
 * The null slice is load-bearing rather than decorative: it is the only way
 * CAP-4's "an absent reference renders nothing" branch stays reachable in
 * `/manage`. With every row collected, that branch could only be tested on the
 * preview harness, and an empty column is exactly the state most likely to be
 * shipped broken.
 */
export const COLLECTED_BY_RATIO = { preacher: 0.7, admin: 0.25, none: 0.05 };

/**
 * One contact's name, derived from its row index.
 *
 * Cross-pairing rather than a single shuffled list, because a name must be unique
 * as a string — see `GIVEN_NAMES` for why, which is an idempotency requirement of
 * the generator and not a constraint on `contacts`.
 *
 * ## Why the index is split before it is combined
 *
 * The obvious attempts collide, and a collision here is not cosmetic: the
 * generator's resume logic compares names, so a repeated name means an interrupted
 * run silently skips a row it should have inserted.
 *
 * Writing `given = i % g` and `family = (i * S) % f` looks injective and is not —
 * once `i` passes `g`, the same pair is reachable twice. Taking the quotient and
 * remainder **first**, then mixing them, is what makes the pair unique over the
 * whole cross product:
 *
 *     block = i / g, offset = i % g
 *     given  = GIVEN_NAMES[offset]
 *     family = FAMILY_NAMES[(block * S + offset) % f]
 *
 * Two rows collide only when their offsets match and `(b1 - b2) * S ≡ 0 (mod f)`,
 * so injectivity over every block reduces to **`gcd(S, f) = 1`**. That single
 * condition is what this function turned on twice:
 *
 *   - The pools are **49** long, not 48, and `gcd(7, 49) = 7`, so a stride of 7
 *     aliased every 7th block: 1,052 rows produced 343 distinct names. The pools
 *     were sized by hand and duplicated four surnames along the way, which is what
 *     made them 49 and not 48 in the first place.
 *   - `S = 1` is coprime to any `f`, so it needs no adjustment when a pool grows.
 *
 * Inside one block the `offset` term alone already visits every family, so no two
 * rows in a block share a pair; across blocks the coprime stride keeps them
 * apart. The result is `g * f` distinct names — against a 250-row default and a
 * 1,052-row `seed:bulk-full`.
 *
 * Both terms come from the row index alone, so a re-run is byte-identical.
 */
export function contactName(index) {
  const g = GIVEN_NAMES.length
  const f = FAMILY_NAMES.length
  const offset = index % g
  const block = Math.floor(index / g)
  return `${GIVEN_NAMES[offset]} ${FAMILY_NAMES[(block + offset) % f]}`
}

/**
 * The books one contact holds.
 *
 * Two to four, because `books_read` is a `multiselect` column and its renderer
 * draws one pill per value. A uniformly single-valued column exercises the
 * unpacking but never the multi-pill row an operator actually sees.
 *
 * Deterministic: derived from the row index, never a clock or a random source,
 * so a reload shows the same set and the review is reproducible.
 */
export function booksFor(index) {
  const count = 2 + (index % 3)
  const books = []
  for (let offset = 0; offset < count; offset += 1) {
    const book = PRABHUPAD_BOOKS[(index * 3 + offset) % PRABHUPAD_BOOKS.length]
    if (!books.includes(book)) books.push(book)
  }
  return books
}

/**
 * Which locations a Preacher owns, out of the full pool.
 *
 * Three or four per Preacher, per the product decision behind this fixture: a
 * Preacher's scope is what decides whether they can read a contact at all, so a
 * realistic programme has a handful of locations each rather than every location
 * in the city.
 *
 * Returns ids in pool order so two runs over the same data agree.
 */
export function locationsForPreacher(allLocationIds, preacherIndex = 0) {
  const count = 3 + (preacherIndex % 2)
  const stride = allLocationIds.length
  const chosen = []
  for (let offset = 0; offset < count && chosen.length < allLocationIds.length; offset += 1) {
    chosen.push(allLocationIds[(preacherIndex * 4 + offset) % stride])
  }
  return chosen
}