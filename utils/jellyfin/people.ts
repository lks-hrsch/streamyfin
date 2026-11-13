import {
  type BaseItemDto,
  type BaseItemPerson,
  PersonKind,
} from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Person kinds that get a labelled credits line, in the order the lines are
 * drawn. Plain strings rather than the SDK's `PersonKind`: Narrator only
 * exists from Jellyfin 12, which the SDK does not describe yet.
 */
export const CREDIT_KINDS = [
  "Director",
  "Writer",
  "Creator",
  "Author",
  "Narrator",
] as const;

export type CreditKind = (typeof CREDIT_KINDS)[number];

export interface CreditPerson {
  /** Missing when the server sent a bare name: shown, but not linked. */
  id?: string;
  name: string;
}

export interface CreditLine {
  kind: CreditKind;
  people: CreditPerson[];
}

/**
 * Groups the people of an item into its credits lines, one per kind in
 * `CREDIT_KINDS`. A kind nobody is credited for gets no line.
 */
export const getCreditLines = (
  people: BaseItemPerson[] | null | undefined,
): CreditLine[] => {
  const lines: CreditLine[] = [];

  for (const kind of CREDIT_KINDS) {
    // The server lists a person once per job, so someone credited for both
    // the story and the screenplay arrives as two writers.
    const seen = new Set<string>();
    const credited: CreditPerson[] = [];

    for (const person of people ?? []) {
      if (person.Type !== kind) continue;
      const name = person.Name?.trim();
      if (!name) continue;
      // An empty id is no id: keyed on it, every such person would collapse
      // into the first.
      const id = person.Id || undefined;
      const key = id ?? name;
      if (seen.has(key)) continue;
      seen.add(key);
      credited.push({ id, name });
    }

    if (credited.length > 0) lines.push({ kind, people: credited });
  }

  return lines;
};

/**
 * What one credit says about a person: the role when there is one, otherwise
 * the kind of credit. Crew members usually come without a role.
 */
const creditText = (
  person: BaseItemPerson,
  kindLabel: (kind: string) => string,
): string | undefined => {
  const role = person.Role?.trim();
  if (role) return role;
  if (!person.Type || person.Type === "Unknown") return undefined;
  return kindLabel(person.Type).trim() || undefined;
};

/**
 * Collapses the credits of an item to one entry per person, in the order they
 * first appear. `Role` of the result lists everything the person is credited
 * for, each once, or is null when no credit says anything.
 *
 * Returns new objects: the input is the query's cached data.
 */
export const mergePeopleById = (
  people: BaseItemPerson[] | null | undefined,
  kindLabel: (kind: string) => string,
): BaseItemPerson[] => {
  const merged = new Map<string, { person: BaseItemPerson; roles: string[] }>();

  for (const person of people ?? []) {
    if (!person.Id) continue;

    let entry = merged.get(person.Id);
    if (!entry) {
      entry = { person, roles: [] };
      merged.set(person.Id, entry);
    }

    const text = creditText(person, kindLabel);
    if (text && !entry.roles.includes(text)) entry.roles.push(text);
  }

  return [...merged.values()].map(({ person, roles }) => ({
    ...person,
    Role: roles.length > 0 ? roles.join(", ") : null,
  }));
};

/**
 * The cast of a series: the actors the series itself credits, in its order and
 * once each with all their roles, then every actor of its episodes it does
 * not, in the order the server lists them.
 *
 * The series' own credits are what the metadata provider has for the show as a
 * whole, which leaves out whoever left it: an anthology credits its latest
 * seasons, and season 1's lead is credited on that season's episodes only.
 *
 * Actors only. The crew has the header's credit lines, and a guest star is the
 * guest of one episode: a long series has hundreds, who would bury the
 * regulars. Their episode's page lists them.
 *
 * `episodeActors` are people as `/Persons` answers them, items without a role.
 */
export const seriesCast = (
  seriesPeople: BaseItemPerson[] | null | undefined,
  episodeActors: BaseItemDto[] | null | undefined,
): BaseItemPerson[] => {
  const cast = mergePeopleById(
    seriesPeople?.filter((person) => person.Type === PersonKind.Actor),
    // Every one of them is an actor: the kind would say nothing a role does
    // not, so an actor without a role is left without one.
    () => "",
  );
  const listed = new Set(cast.map((person) => person.Id));

  for (const person of episodeActors ?? []) {
    if (!person.Id || listed.has(person.Id)) continue;
    listed.add(person.Id);
    cast.push({
      Id: person.Id,
      Name: person.Name,
      Type: PersonKind.Actor,
      Role: null,
      PrimaryImageTag: person.ImageTags?.Primary ?? null,
      ImageBlurHashes: person.ImageBlurHashes ?? null,
    });
  }

  return cast;
};
