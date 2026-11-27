import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useSeerrPerson } from "@/hooks/useSeerrPerson";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getPersonTitles } from "@/utils/jellyfin/personTitles";
import { tmdbIdOf } from "@/utils/seerr/jellyfinBridge";
import {
  personCredits,
  personFacts,
  personFilmography,
} from "@/utils/seerr/personProfile";

/**
 * A library person as one profile, on the phone and the TV alike: who they
 * are, from Jellyfin and Seerr together, and their films and series, the
 * library's first (a series they are in through its episodes among them),
 * then what else Seerr knows they made.
 *
 * `withSeerr` off leaves Seerr's titles out, for a phone tab Seerr's pages do
 * not open in; the facts still use what Seerr knows about the person.
 */
export const usePersonProfile = (
  person: BaseItemDto | null | undefined,
  { withSeerr = true }: { withSeerr?: boolean } = {},
) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const tmdbId = tmdbIdOf(person);

  const { data: library, isLoading } = useQuery({
    queryKey: ["person", person?.Id, "filmography"],
    queryFn: ({ signal }) =>
      getPersonTitles({
        api: api!,
        userId: user!.Id,
        personId: person!.Id!,
        signal,
      }),
    enabled: !!api && !!user?.Id && !!person?.Id,
  });

  const { details, combinedCredits } = useSeerrPerson(
    tmdbId === undefined ? undefined : String(tmdbId),
  );

  const facts = useMemo(() => personFacts(person, details), [person, details]);
  const filmography = useMemo(
    () =>
      personFilmography(
        library,
        withSeerr ? personCredits(combinedCredits) : [],
      ),
    [library, combinedCredits, withSeerr],
  );

  return { facts, filmography, isLoading };
};
