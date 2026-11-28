import { useSegments } from "expo-router";
import type React from "react";
import { type PropsWithChildren } from "react";
import { TouchableOpacity, type TouchableOpacityProps } from "react-native";
import { useOpenSeerrTitle } from "@/hooks/useOpenSeerrTitle";
import type {
  MovieDetails,
  MovieResult,
  TvDetails,
  TvResult,
} from "@/utils/seerr/types";
import { MediaType, type PersonCreditCast } from "@/utils/seerr/types";

interface Props extends TouchableOpacityProps {
  result?: MovieResult | TvResult | MovieDetails | TvDetails | PersonCreditCast;
  mediaTitle?: string;
  releaseYear?: number;
  canRequest: boolean;
  posterSrc: string;
  mediaType?: MediaType;
}

export const TouchableSeerrRouter: React.FC<PropsWithChildren<Props>> = ({
  result,
  mediaTitle,
  releaseYear,
  canRequest,
  posterSrc,
  mediaType,
  children,
  ...props
}) => {
  const openTitle = useOpenSeerrTitle();
  const segments = useSegments();

  const from = (segments as string[])[2] || "(home)";

  if (from === "(home)" || from === "(search)" || from === "(libraries)")
    return (
      <TouchableOpacity
        onPress={() => {
          if (!result) return;

          // A details answer carries no media type of its own: the card's.
          openTitle(
            {
              mediaType:
                ("mediaType" in result && result.mediaType) || mediaType,
              mediaInfo: result.mediaInfo,
            },
            {
              pathname: `/(auth)/(tabs)/${from}/seerr/page`,
              // @ts-expect-error
              params: {
                ...result,
                mediaTitle,
                releaseYear,
                canRequest: canRequest.toString(),
                posterSrc,
                mediaType,
              },
            },
          );
        }}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );

  return null;
};
