import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useTranslation } from "react-i18next";
import {
  type StyleProp,
  TVFocusGuideView,
  View,
  type ViewStyle,
} from "react-native";
import { Text } from "@/components/common/Text";
import { TVButton } from "@/components/tv/TVButton";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { tmdbIdOf } from "@/utils/seerr/jellyfinBridge";

/**
 * On a library person's page on the TV: the way to their Seerr page, whose
 * filmography holds what the library does not and can be requested from
 * there. Only with Seerr set up and a TMDB match for the person. It never
 * takes the first focus, which stays with the person's first title.
 */
export const TVMoreOnSeerr: React.FC<{ person: BaseItemDto }> = ({
  person,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const sizes = useScaledTVSizes();
  const typography = useScaledTVTypography();
  const { seerrApi } = useSeerr();
  const tmdbId = tmdbIdOf(person);

  if (!seerrApi || tmdbId === undefined) return null;

  return (
    // The button's width is its label's: in the column it would stretch.
    <View style={{ alignItems: "flex-start", marginTop: sizes.gaps.item }}>
      <TVButton
        variant='secondary'
        onPress={() =>
          router.push({
            pathname: "/(auth)/(tabs)/(search)/seerr/person/[personId]",
            params: { personId: String(tmdbId) },
          })
        }
      >
        <Text
          style={{
            fontSize: typography.callout,
            fontWeight: "bold",
            color: "#FFFFFF",
          }}
        >
          {t("seerr.library_links.more_on_seerr")}
        </Text>
        <Ionicons
          name='chevron-forward'
          size={typography.callout}
          color='#FFFFFF'
          style={{ marginLeft: sizes.gaps.small }}
        />
      </TVButton>
    </View>
  );
};

/**
 * The person page's header row on the TV. With the Seerr link in it, the row is
 * a focus guide that hands focus moving up from any title below to the link:
 * the link sits in the text column, so from a title under the portrait nothing
 * lay straight above and focus went past it to the tab bar. Without the link it
 * is a plain View, as before.
 */
export const TVMoreOnSeerrArea: React.FC<
  React.PropsWithChildren<{
    person: BaseItemDto;
    style?: StyleProp<ViewStyle>;
  }>
> = ({ person, style, children }) => {
  const { seerrApi } = useSeerr();
  if (seerrApi && tmdbIdOf(person) !== undefined) {
    return (
      <TVFocusGuideView autoFocus style={style}>
        {children}
      </TVFocusGuideView>
    );
  }
  return <View style={style}>{children}</View>;
};
