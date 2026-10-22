import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { tmdbIdOf } from "./jellyfinBridge";
import {
  type CombinedCredit,
  MediaType,
  type PersonCreditCast,
  type PersonDetails,
} from "./types";

/**
 * Who a person is, from Jellyfin and Seerr together: Jellyfin's own fields
 * first, since they are what the library shows everywhere else, and Seerr's
 * (TMDB's) where Jellyfin has none. Jellyfin often has none: a person's
 * metadata is only fetched once something opens their page on the server.
 */
export type PersonFacts = {
  /** TMDB's department, such as "Acting" or "Directing". */
  knownFor?: string;
  /** A day, "1964-09-02". */
  born?: string;
  birthPlace?: string;
  died?: string;
  biography?: string;
};

/** The day part of a Jellyfin date or a Seerr day. */
const day = (date: string | null | undefined): string | undefined =>
  date ? date.slice(0, 10) : undefined;

export const personFacts = (
  person: BaseItemDto | null | undefined,
  seerr: PersonDetails | null | undefined,
): PersonFacts => ({
  knownFor: seerr?.knownForDepartment || undefined,
  born: day(person?.PremiereDate) ?? day(seerr?.birthday),
  birthPlace:
    person?.ProductionLocations?.[0] || seerr?.placeOfBirth || undefined,
  died: day(person?.EndDate) ?? day(seerr?.deathday),
  biography: person?.Overview?.trim() || seerr?.biography?.trim() || undefined,
});

/** Whole years from one day to another, both "YYYY-MM-DD". */
export const yearsBetween = (from: string, to: string): number | undefined => {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if ([fy, fm, fd, ty, tm, td].some((n) => !Number.isInteger(n))) {
    return undefined;
  }
  const beforeBirthday = tm < fm || (tm === fm && td < fd);
  const years = ty - fy - (beforeBirthday ? 1 : 0);
  return years >= 0 ? years : undefined;
};

/**
 * The `item_card.person_kind` a TMDB job is shown as. Jobs left out (Thanks,
 * Stunts, the long tail of crew credits) are not what someone looks a person
 * up for, and a title the person has only such a job on is left off their
 * filmography.
 */
const JOB_KINDS: Record<string, string> = {
  Director: "Director",
  "Co-Director": "Director",
  Screenplay: "Writer",
  Writer: "Writer",
  Story: "Writer",
  Novel: "Writer",
  Characters: "Writer",
  Teleplay: "Writer",
  Creator: "Creator",
  Producer: "Producer",
  "Executive Producer": "Producer",
  "Original Music Composer": "Composer",
  Composer: "Composer",
  Music: "Composer",
  Editor: "Editor",
};

/** The `item_card.person_kind` a TMDB department stands for, when there is one. */
const DEPARTMENT_KINDS: Record<string, string> = {
  Acting: "Actor",
  Directing: "Director",
  Writing: "Writer",
  Production: "Producer",
  Sound: "Composer",
  Editing: "Editor",
  Creator: "Creator",
};

export const departmentKind = (
  department: string | undefined,
): string | undefined =>
  department ? DEPARTMENT_KINDS[department] : undefined;

/**
 * TMDB genres a person shows up in as themselves rather than in a part: talk
 * shows, news, reality. They swamp an actor's credits and are nothing the
 * library would hold.
 */
const SELF_APPEARANCE_GENRES = new Set([10763, 10764, 10767]);
const SELF_CHARACTER = /^(self|himself|herself|themselves)\b/i;

type CrewCredit = NonNullable<CombinedCredit["crew"]>[number];

/**
 * One title in a person's filmography, as Seerr knows it: the credit, and
 * every part the person had in it, the character first, then the jobs.
 */
export type PersonCredit = PersonCreditCast & {
  /** A character's name, or a `item_card.person_kind` key such as "Director". */
  roles: { character?: string; kind?: string }[];
};

const creditKey = (credit: { mediaType?: string; id?: number }) =>
  `${credit.mediaType}-${credit.id}`;

/**
 * A person's films and series from their Seerr credits, each once, with the
 * parts they had in it: cast and crew merged, self-appearances and titles with
 * only minor crew jobs left out, the best known first.
 */
export const personCredits = (
  credits: CombinedCredit | null | undefined,
): PersonCredit[] => {
  const byTitle = new Map<string, PersonCredit>();
  const add = (
    credit: PersonCreditCast | CrewCredit,
    role: PersonCredit["roles"][number],
  ) => {
    if (credit.mediaType !== "movie" && credit.mediaType !== "tv") return;
    if (credit.id === undefined || credit.adult) return;
    const key = creditKey(credit);
    const known = byTitle.get(key);
    if (known) {
      const duplicate = known.roles.some(
        (r) => r.character === role.character && r.kind === role.kind,
      );
      if (!duplicate) known.roles.push(role);
      return;
    }
    byTitle.set(key, {
      ...(credit as PersonCreditCast),
      mediaType: credit.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV,
      roles: [role],
    });
  };

  for (const cast of credits?.cast ?? []) {
    if (cast.genreIds?.some((genre) => SELF_APPEARANCE_GENRES.has(genre))) {
      continue;
    }
    if (cast.character && SELF_CHARACTER.test(cast.character)) continue;
    add(cast, cast.character ? { character: cast.character } : {});
  }
  for (const crew of credits?.crew ?? []) {
    const kind = crew.job ? JOB_KINDS[crew.job] : undefined;
    if (!kind) continue;
    add(crew, { kind });
  }

  return [...byTitle.values()].sort(
    (a, b) =>
      (b.voteCount ?? 0) - (a.voteCount ?? 0) ||
      (b.voteAverage ?? 0) - (a.voteAverage ?? 0),
  );
};

/** One card of a person's filmography. */
export type FilmographyEntry =
  | { source: "library"; item: BaseItemDto; credit?: PersonCredit }
  | { source: "seerr"; credit: PersonCredit };

export type Filmography = {
  movies: FilmographyEntry[];
  shows: FilmographyEntry[];
};

const seerrTypeOf = (item: BaseItemDto): MediaType | undefined =>
  item.Type === "Movie"
    ? MediaType.MOVIE
    : item.Type === "Series"
      ? MediaType.TV
      : undefined;

/**
 * A person's films and series, the library's first, in the library's order,
 * then everything else Seerr knows they made, best known first. A Seerr credit
 * the library holds (by type and TMDB number) is not listed twice: it lends
 * the library's card the person's part in it instead.
 */
export const personFilmography = (
  library: BaseItemDto[] | null | undefined,
  credits: PersonCredit[],
): Filmography => {
  const byKey = new Map(credits.map((c) => [creditKey(c), c]));
  const held = new Set<string>();
  const movies: FilmographyEntry[] = [];
  const shows: FilmographyEntry[] = [];

  for (const item of library ?? []) {
    const mediaType = seerrTypeOf(item);
    if (!mediaType) continue;
    const id = tmdbIdOf(item);
    const key = id === undefined ? undefined : `${mediaType}-${id}`;
    if (key) held.add(key);
    const entry: FilmographyEntry = {
      source: "library",
      item,
      credit: key ? byKey.get(key) : undefined,
    };
    (mediaType === MediaType.MOVIE ? movies : shows).push(entry);
  }

  for (const credit of credits) {
    if (held.has(creditKey(credit))) continue;
    const entry: FilmographyEntry = { source: "seerr", credit };
    (credit.mediaType === MediaType.MOVIE ? movies : shows).push(entry);
  }

  return { movies, shows };
};

/**
 * The lines under a person's name: what they are known for and when and where
 * they were born, then when they died. Dates are written in `tag`'s language;
 * `today` ("YYYY-MM-DD") gives a living person's age.
 */
export const personFactLines = (
  t: (key: string, options?: Record<string, unknown>) => string,
  facts: PersonFacts,
  tag: string | undefined,
  today: string,
): string[] => {
  const write = (date: string) =>
    new Date(date).toLocaleDateString(tag, {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });

  const kind = departmentKind(facts.knownFor);
  let born: string | undefined;
  if (facts.born) {
    const date = write(facts.born);
    born = facts.birthPlace
      ? t("person_profile.born_in", { date, place: facts.birthPlace })
      : t("person_profile.born", { date });
    const age = facts.died ? undefined : yearsBetween(facts.born, today);
    if (age !== undefined) born += ` (${t("person_profile.age", { age })})`;
  }
  const first = [kind && t(`item_card.person_kind.${kind}`), born]
    .filter(Boolean)
    .join(" · ");

  let died: string | undefined;
  if (facts.died) {
    const date = write(facts.died);
    const age = facts.born ? yearsBetween(facts.born, facts.died) : undefined;
    died =
      age === undefined
        ? t("person_profile.died", { date })
        : t("person_profile.died_aged", { date, age });
  }

  return [first, died].filter((line): line is string => Boolean(line));
};

/** A role as a card says it: the character, or the job's translated name. */
export const roleText = (
  t: (key: string) => string,
  credit: PersonCredit | undefined,
): string | undefined => {
  const parts = (credit?.roles ?? []).flatMap((role) =>
    role.character
      ? [role.character]
      : role.kind
        ? [t(`item_card.person_kind.${role.kind}`)]
        : [],
  );
  return parts.length > 0 ? [...new Set(parts)].join(", ") : undefined;
};
