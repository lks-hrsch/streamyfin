import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useMemo } from "react";
import type { ViewProps } from "react-native";
import { CastAndCrew } from "@/components/series/CastAndCrew";
import { useSeriesCast } from "@/hooks/useSeriesCast";

interface Props extends ViewProps {
  item: BaseItemDto;
}

/**
 * The cast row of the phone series page, the row movies and episodes have.
 * Its own component so the cast's request re-renders this row alone, not the
 * season list above it.
 */
export const SeriesCast: React.FC<Props> = ({ item, ...props }) => {
  const cast = useSeriesCast(item);
  const castItem = useMemo(() => ({ ...item, People: cast }), [item, cast]);

  // Offline the cast is empty: the person pages need the server.
  if (cast.length === 0) return null;

  return <CastAndCrew item={castItem} {...props} />;
};
