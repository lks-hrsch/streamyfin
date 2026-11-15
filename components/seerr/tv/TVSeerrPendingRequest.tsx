import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useTranslation } from "react-i18next";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { Text } from "@/components/common/Text";
import { TVButton } from "@/components/tv";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useSeerrPendingRequest } from "@/hooks/useSeerrPendingRequest";
import type { MovieDetails, TvDetails } from "@/utils/seerr/types";

/**
 * The TV's approve and decline for a request that waits, with who asked:
 * the phone's SeerrPendingRequest, for Seerr's page and a library series'
 * page alike. Nothing for anyone who may not decide, or when nothing waits.
 */
export const TVSeerrPendingRequest: React.FC<{
  details: MovieDetails | TvDetails | undefined;
  onDecided?: () => void;
  disabled?: boolean;
  /** Its place on the page: room above it, where it follows a list. */
  style?: StyleProp<ViewStyle>;
}> = ({ details, onDecided, disabled, style }) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const pending = useSeerrPendingRequest(details, onDecided);
  if (!pending) return null;

  return (
    <View style={[{ marginBottom: 24 }, style]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Ionicons name='person-outline' size={18} color='#9CA3AF' />
        <Text
          style={{
            fontSize: typography.callout,
            color: "#9CA3AF",
            marginLeft: 8,
          }}
        >
          {t("seerr.requested_by", { user: pending.requestedBy })}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 16 }}>
        <TVButton
          onPress={pending.approve}
          variant='secondary'
          disabled={disabled}
        >
          <Ionicons
            name='checkmark'
            size={22}
            color='#FFFFFF'
            style={{ marginRight: 8 }}
          />
          <Text
            style={{
              fontSize: typography.callout,
              fontWeight: "600",
              color: "#FFFFFF",
            }}
          >
            {t("seerr.approve")}
          </Text>
        </TVButton>

        <TVButton
          onPress={pending.decline}
          variant='secondary'
          disabled={disabled}
        >
          <Ionicons
            name='close'
            size={22}
            color='#FFFFFF'
            style={{ marginRight: 8 }}
          />
          <Text
            style={{
              fontSize: typography.callout,
              fontWeight: "600",
              color: "#FFFFFF",
            }}
          >
            {t("seerr.decline")}
          </Text>
        </TVButton>
      </View>
    </View>
  );
};
