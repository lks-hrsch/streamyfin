import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useSeerrPerson } from "@/hooks/useSeerrPerson";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { tmdbIdOf } from "@/utils/seerr/jellyfinBridge";
import {
  personCredits,
  personFacts,
  personFilmography,
} from "@/utils/seerr/personProfile";

/** More than any one person's filmography in a library. */
const LIBRARY_LIMIT = 300;

/**
 * A library person as one profile, on the phone and the TV alike: who they
 * are, from Jellyfin and Seerr together, and their films and series, the
 * library's first, then what else Seerr knows they made.
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
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        userId: user!.Id,
        personIds: [person!.Id!],
        includeItemTypes: ["Movie", "Series"],
        recursive: true,
        sortBy: ["PremiereDate", "ProductionYear", "SortName"],
        sortOrder: ["Descending", "Descending", "Ascending"],
        fields: ["ProviderIds", "PrimaryImageAspectRatio"],
        collapseBoxSetItems: false,
        limit: LIBRARY_LIMIT,
      });
      return response.data.Items ?? [];
    },
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
