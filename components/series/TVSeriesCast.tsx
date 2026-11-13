import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtomValue } from "jotai";
import type React from "react";
import { TVFocusGuideView } from "react-native";
import { TVCastSection } from "@/components/tv/TVCastSection";
import { useSeriesCast } from "@/hooks/useSeriesCast";
import { apiAtom } from "@/providers/JellyfinProvider";
import { scaleSize } from "@/utils/scaleSize";

interface Props {
  item: BaseItemDto;
  onPersonPress: (personId: string) => void;
  /** Keeps the remote off the cards, as while the season modal is up. */
  disabled?: boolean;
  horizontalPadding: number;
  titleInset: number;
}

/**
 * The cast row of the TV series page, the row movies and episodes have. Its
 * own component so the cast's request re-renders this row alone, not the
 * episode list above it.
 */
export const TVSeriesCast: React.FC<Props> = ({
  item,
  onPersonPress,
  disabled = false,
  horizontalPadding,
  titleInset,
}) => {
  const api = useAtomValue(apiAtom);
  const cast = useSeriesCast(item);

  // Offline the cast is empty: the person pages need the server. An empty row
  // would be one more stop for the focus engine.
  if (cast.length === 0) return null;

  return (
    // As wide as the page, so a move down from any episode lands in the row,
    // on its first card or the one last focused, however few cards it has.
    // autoFocus only redirects focus that enters the guide: it takes none when
    // the row mounts, so the Play button keeps the first focus. The warning in
    // docs/tv-focus-guide.md is about autoFocus beside bidirectional guides;
    // this page's sit above the episodes, and the credits below already use
    // the same kind of guide.
    <TVFocusGuideView
      autoFocus={!disabled}
      style={{ marginTop: scaleSize(40), overflow: "visible" }}
    >
      <TVCastSection
        cast={cast}
        apiBasePath={api?.basePath}
        onActorPress={onPersonPress}
        disabled={disabled}
        horizontalPadding={horizontalPadding}
        titleInset={titleInset}
        // The credits below keep their own gap from it.
        style={{ marginBottom: 0 }}
      />
    </TVFocusGuideView>
  );
};
