import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  departmentKind,
  personCredits,
  personFactLines,
  personFacts,
  personFilmography,
  roleText,
  yearsBetween,
} from "./personProfile";
import { type CombinedCredit, MediaType, type PersonDetails } from "./types";

const seerrPerson = (fields: Partial<PersonDetails>) =>
  ({ id: 6384, name: "Keanu Reeves", ...fields }) as PersonDetails;

describe("personFacts", () => {
  test("takes Jellyfin's own fields first", () => {
    const facts = personFacts(
      {
        Overview: "From Jellyfin.",
        PremiereDate: "1964-09-02T00:00:00.0000000Z",
        ProductionLocations: ["Beirut, Lebanon"],
      },
      seerrPerson({
        biography: "From TMDB.",
        birthday: "1964-09-03",
        placeOfBirth: "Elsewhere",
        knownForDepartment: "Acting",
      }),
    );
    expect(facts).toEqual({
      knownFor: "Acting",
      born: "1964-09-02",
      birthPlace: "Beirut, Lebanon",
      died: undefined,
      biography: "From Jellyfin.",
    });
  });

  // Jellyfin fetches a person's metadata only once something opens their
  // page on the server, so a library person is often just a name.
  test("fills what Jellyfin lacks from Seerr", () => {
    const facts = personFacts(
      { Name: "Lilly Wachowski" },
      seerrPerson({
        biography: " From TMDB. ",
        birthday: "1967-12-29",
        placeOfBirth: "Chicago, Illinois, USA",
        knownForDepartment: "Directing",
      }),
    );
    expect(facts).toEqual({
      knownFor: "Directing",
      born: "1967-12-29",
      birthPlace: "Chicago, Illinois, USA",
      died: undefined,
      biography: "From TMDB.",
    });
  });

  test("has nothing without either", () => {
    expect(personFacts(undefined, undefined)).toEqual({
      knownFor: undefined,
      born: undefined,
      birthPlace: undefined,
      died: undefined,
      biography: undefined,
    });
  });
});

describe("yearsBetween", () => {
  test("counts a year once the birthday has passed", () => {
    expect(yearsBetween("1964-09-02", "2026-09-01")).toBe(61);
    expect(yearsBetween("1964-09-02", "2026-09-02")).toBe(62);
  });

  test("has no answer for a malformed day", () => {
    expect(yearsBetween("1964", "2026-09-02")).toBeUndefined();
  });
});

describe("departmentKind", () => {
  test("names a department by the part it stands for", () => {
    expect(departmentKind("Acting")).toBe("Actor");
    expect(departmentKind("Directing")).toBe("Director");
    expect(departmentKind("Visual Effects")).toBeUndefined();
  });
});

const credits = (fields: Partial<CombinedCredit>) =>
  ({ id: 9339, cast: [], crew: [], ...fields }) as CombinedCredit;

describe("personCredits", () => {
  test("lists a title once with every part the person had in it", () => {
    const [matrix] = personCredits(
      credits({
        cast: [
          {
            id: 603,
            mediaType: MediaType.MOVIE,
            title: "The Matrix",
            character: "Neo",
            voteCount: 10,
          },
        ] as CombinedCredit["cast"],
        crew: [
          { id: 603, mediaType: "movie", title: "The Matrix", job: "Producer" },
          {
            id: 603,
            mediaType: "movie",
            title: "The Matrix",
            job: "Executive Producer",
          },
        ] as CombinedCredit["crew"],
      }),
    );
    expect(matrix.roles).toEqual([{ character: "Neo" }, { kind: "Producer" }]);
  });

  test("leaves out self-appearances and minor crew jobs", () => {
    const listed = personCredits(
      credits({
        cast: [
          { id: 1, mediaType: MediaType.TV, character: "Himself" },
          { id: 2, mediaType: MediaType.TV, genreIds: [10767] },
          { id: 3, mediaType: MediaType.MOVIE, character: "Neo" },
        ] as CombinedCredit["cast"],
        crew: [
          { id: 4, mediaType: "movie", job: "Thanks" },
          { id: 5, mediaType: "movie", job: "Director" },
        ] as CombinedCredit["crew"],
      }),
    );
    expect(listed.map((c) => c.id).sort()).toEqual([3, 5]);
  });

  test("puts the best known first", () => {
    const listed = personCredits(
      credits({
        cast: [
          { id: 1, mediaType: MediaType.MOVIE, character: "A", voteCount: 5 },
          { id: 2, mediaType: MediaType.MOVIE, character: "B", voteCount: 50 },
        ] as CombinedCredit["cast"],
      }),
    );
    expect(listed.map((c) => c.id)).toEqual([2, 1]);
  });
});

describe("personFilmography", () => {
  const library: BaseItemDto[] = [
    { Id: "jf-matrix", Type: "Movie", ProviderIds: { Tmdb: "603" } },
    { Id: "jf-got", Type: "Series", ProviderIds: { Tmdb: "1399" } },
    { Id: "jf-local", Type: "Movie" },
  ];
  const known = personCredits(
    credits({
      cast: [
        { id: 603, mediaType: MediaType.MOVIE, character: "Neo", voteCount: 9 },
        { id: 605, mediaType: MediaType.MOVIE, character: "Neo", voteCount: 8 },
        { id: 1399, mediaType: MediaType.TV, character: "X", voteCount: 7 },
        { id: 2000, mediaType: MediaType.TV, character: "Y", voteCount: 6 },
      ] as CombinedCredit["cast"],
    }),
  );

  test("puts the library's titles first, then the rest Seerr knows", () => {
    const { movies, shows } = personFilmography(library, known);
    expect(
      movies.map((e) =>
        e.source === "library" ? e.item.Id : `seerr-${e.credit.id}`,
      ),
    ).toEqual(["jf-matrix", "jf-local", "seerr-605"]);
    expect(
      shows.map((e) =>
        e.source === "library" ? e.item.Id : `seerr-${e.credit.id}`,
      ),
    ).toEqual(["jf-got", "seerr-2000"]);
  });

  test("lends a library title the person's part in it", () => {
    const { movies } = personFilmography(library, known);
    expect(movies[0].credit?.roles).toEqual([{ character: "Neo" }]);
  });

  test("is the library alone without Seerr", () => {
    const { movies, shows } = personFilmography(library, []);
    expect(movies.every((e) => e.source === "library")).toBe(true);
    expect(shows).toHaveLength(1);
  });
});

// Returns the key and its options, so the test reads what would be shown.
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

describe("personFactLines", () => {
  test("says what a living person is known for, and their age", () => {
    expect(
      personFactLines(
        t,
        { knownFor: "Acting", born: "1964-09-02", birthPlace: "Beirut" },
        "en-US",
        "2026-10-22",
      ),
    ).toEqual([
      'item_card.person_kind.Actor · person_profile.born_in {"date":"September 2, 1964","place":"Beirut"} (person_profile.age {"age":62})',
    ]);
  });

  test("gives the age at death on its own line", () => {
    expect(
      personFactLines(
        t,
        { born: "1930-05-31", died: "2020-01-01" },
        "en-US",
        "2026-10-22",
      ),
    ).toEqual([
      'person_profile.born {"date":"May 31, 1930"}',
      'person_profile.died_aged {"date":"January 1, 2020","age":89}',
    ]);
  });

  test("has no lines without facts", () => {
    expect(personFactLines(t, {}, "en-US", "2026-10-22")).toEqual([]);
  });
});

describe("roleText", () => {
  test("names characters as they are and jobs translated", () => {
    expect(
      roleText(t, {
        roles: [{ character: "Neo" }, { kind: "Producer" }],
      } as never),
    ).toBe("Neo, item_card.person_kind.Producer");
  });
});
