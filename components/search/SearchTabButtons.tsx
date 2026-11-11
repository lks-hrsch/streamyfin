import { Platform, Pressable, TouchableOpacity, View } from "react-native";
// Aliased: the SwiftUI destructure below also declares a Text.
import { Text as AppText } from "@/components/common/Text";
import { Tag } from "@/components/GenreTags";
import type { SearchType } from "@/components/search/searchFilters";
import { Colors } from "@/constants/Colors";
import { SEARCH_TAB_ROW_HEIGHT } from "@/constants/Values";

// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds.
// A static top-level import crashes the route tree on tvOS at module load.
// Load it lazily and only off-TV; TV never renders this component.
const { Button, Host, HStack, Spacer, Text } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : (require("@expo/ui/swift-ui") as typeof import("@expo/ui/swift-ui"));
const { buttonStyle, font } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui/modifiers"))
  : (require("@expo/ui/swift-ui/modifiers") as typeof import("@expo/ui/swift-ui/modifiers"));

const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  Library: "search.library",
  Discover: "search.discover",
};

interface SearchTabButtonsProps {
  searchType: SearchType;
  setSearchType: (type: SearchType) => void;
  t: (key: string) => string;
}

export const SearchTabButtons: React.FC<SearchTabButtonsProps> = ({
  searchType,
  setSearchType,
  t,
}) => {
  // SwiftUI's glass and glass-prominent button styles look the same on the
  // Mac, so nothing showed which search type was on. Plain pills mark it.
  if (Platform.OS === "ios" && Platform.isMacCatalyst) {
    return (
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(Object.keys(SEARCH_TYPE_LABELS) as SearchType[]).map((type) => {
          const selected = searchType === type;
          return (
            <Pressable
              key={type}
              accessibilityRole='button'
              accessibilityState={{ selected }}
              onPress={() => setSearchType(type)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: selected ? Colors.primary : "#262626",
              }}
            >
              <AppText>{t(SEARCH_TYPE_LABELS[type])}</AppText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <Host style={{ height: SEARCH_TAB_ROW_HEIGHT, flex: 1 }}>
        <HStack spacing={8}>
          <Button
            modifiers={[
              buttonStyle(
                searchType === "Library" ? "glassProminent" : "glass",
              ),
            ]}
            onPress={() => setSearchType("Library")}
          >
            {/* A custom label, as the Discover filter button beside these
                has, so the three are built the same and match in height. */}
            <Text modifiers={[font({ textStyle: "body" })]}>
              {t("search.library")}
            </Text>
          </Button>
          <Button
            modifiers={[
              buttonStyle(
                searchType === "Discover" ? "glassProminent" : "glass",
              ),
            ]}
            onPress={() => setSearchType("Discover")}
          >
            <Text modifiers={[font({ textStyle: "body" })]}>
              {t("search.discover")}
            </Text>
          </Button>
          <Spacer />
        </HStack>
      </Host>
    );
  }

  // Android UI
  return (
    <View className='flex flex-row gap-1 mr-1'>
      <TouchableOpacity onPress={() => setSearchType("Library")}>
        <Tag
          text={t("search.library")}
          textClass='p-1'
          className={searchType === "Library" ? "bg-purple-600" : undefined}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setSearchType("Discover")}>
        <Tag
          text={t("search.discover")}
          textClass='p-1'
          className={searchType === "Discover" ? "bg-purple-600" : undefined}
        />
      </TouchableOpacity>
    </View>
  );
};
