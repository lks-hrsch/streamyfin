import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useSeerrPendingRequest } from "@/hooks/useSeerrPendingRequest";
import type { MovieDetails, TvDetails } from "@/utils/seerr/types";

/**
 * Who asked for a title, and approve or decline, for those who decide on
 * Seerr's requests. Nothing for anyone else or when nothing waits. Shown on
 * Seerr's page and on a library series' page alike (useSeerrPendingRequest).
 */
export const SeerrPendingRequest: React.FC<{
  details: MovieDetails | TvDetails | undefined;
  onDecided?: () => void;
  className?: string;
}> = ({ details, onDecided, className = "" }) => {
  const { t } = useTranslation();
  const pending = useSeerrPendingRequest(details, onDecided);
  if (!pending) return null;

  return (
    // Gaps as styles: a release build drops the space-x and space-y classes.
    <View className={`flex flex-col ${className}`} style={{ gap: 8 }}>
      <View className='flex flex-row items-center' style={{ gap: 8 }}>
        <Ionicons name='person-outline' size={16} color='#9CA3AF' />
        <Text className='text-sm text-neutral-400'>
          {t("seerr.requested_by", { user: pending.requestedBy })}
        </Text>
      </View>
      <View className='flex flex-row' style={{ gap: 8 }}>
        <Button
          className='flex-1 bg-green-600/50 border-green-400 ring-green-400 text-green-100'
          color='transparent'
          onPress={pending.approve}
          iconLeft={
            <Ionicons name='checkmark-outline' size={20} color='white' />
          }
          style={{ borderWidth: 1, borderStyle: "solid" }}
        >
          <Text className='text-sm'>{t("seerr.approve")}</Text>
        </Button>
        <Button
          className='flex-1 bg-red-600/50 border-red-400 ring-red-400 text-red-100'
          color='transparent'
          onPress={pending.decline}
          iconLeft={<Ionicons name='close-outline' size={20} color='white' />}
          style={{ borderWidth: 1, borderStyle: "solid" }}
        >
          <Text className='text-sm'>{t("seerr.decline")}</Text>
        </Button>
      </View>
    </View>
  );
};
