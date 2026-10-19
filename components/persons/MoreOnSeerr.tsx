import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useSegments } from "expo-router";
import type React from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { Button } from "@/components/Button";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { tmdbIdOf } from "@/utils/seerr/jellyfinBridge";
import { opensSeerrPages } from "@/utils/seerr/libraryLinks";

/**
 * On a library person's page on the phone: the way to their Seerr page, whose
 * filmography holds what the library does not and can be requested from
 * there. Only with Seerr set up, a TMDB match for the person, and in a tab
 * that opens Seerr's pages.
 */
export const MoreOnSeerr: React.FC<{ person: BaseItemDto } & ViewProps> = ({
  person,
  ...props
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const segments = useSegments();
  const { seerrApi } = useSeerr();
  const from = (segments as string[])[2];
  const tmdbId = tmdbIdOf(person);

  if (!seerrApi || tmdbId === undefined || !opensSeerrPages(from)) return null;

  return (
    <View {...props}>
      <Button
        color='black'
        justify='between'
        iconRight={<Ionicons name='chevron-forward' size={20} color='white' />}
        onPress={() =>
          router.push(`/(auth)/(tabs)/${from}/seerr/person/${tmdbId}`)
        }
      >
        {t("seerr.library_links.more_on_seerr")}
      </Button>
    </View>
  );
};
