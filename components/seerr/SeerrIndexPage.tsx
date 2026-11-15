import type React from "react";
import { View } from "react-native";
import Discover from "@/components/seerr/discover/Discover";
import { useSeerr } from "@/hooks/useSeerr";
import { loadDiscoverSliders } from "@/utils/seerr/sliders";
import { useReactNavigationQuery } from "@/utils/useReactNavigationQuery";

/**
 * Seerr's Discover rows, what the Search screen opens on while nothing is
 * typed. Once something is, the screen lists the library's results and what
 * Seerr could add instead (useSeerrLibrarySearch).
 */
export const SeerrIndexPage: React.FC = () => {
  const { seerrApi } = useSeerr();

  const { data: sliders } = useReactNavigationQuery({
    queryKey: ["search", "seerr", "discoverSettings"],
    queryFn: () => loadDiscoverSliders(seerrApi),
    enabled: !!seerrApi,
  });

  return (
    <View className='flex flex-col'>
      <Discover sliders={sliders} />
    </View>
  );
};
