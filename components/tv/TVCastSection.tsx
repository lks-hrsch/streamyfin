import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollView,
  TVFocusGuideView,
  View,
  type ViewInstance,
  type ViewStyle,
} from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { TVActorCard } from "./TVActorCard";

export interface TVCastSectionProps {
  cast: BaseItemPerson[];
  apiBasePath?: string;
  onActorPress: (personId: string) => void;
  /** Setter function for the first actor card ref (for focus guide) */
  firstActorRefSetter?: (ref: ViewInstance | null) => void;
  /** Ref to focus guide destination for upward navigation */
  upwardFocusDestination?: ViewInstance | null;
  /** Custom horizontal padding (overrides default 80) */
  horizontalPadding?: number;
  /** Keeps the remote off the cards, as while a modal covers the page. */
  disabled?: boolean;
  /** Indents the heading to line up with the page's other headings. */
  titleInset?: number;
  style?: ViewStyle;
}

export const TVCastSection: React.FC<TVCastSectionProps> = React.memo(
  ({
    cast,
    apiBasePath,
    onActorPress,
    firstActorRefSetter,
    upwardFocusDestination,
    horizontalPadding = 80,
    disabled = false,
    titleInset = 0,
    style,
  }) => {
    const typography = useScaledTVTypography();
    const sizes = useScaledTVSizes();
    const { t } = useTranslation();

    if (cast.length === 0) {
      return null;
    }

    return (
      <View style={[{ marginBottom: 40 }, style]}>
        <Text
          style={{
            fontSize: typography.heading,
            fontWeight: "600",
            color: "#FFFFFF",
            marginBottom: 24,
            marginLeft: titleInset,
          }}
        >
          {t("item_card.cast")}
        </Text>
        {/* Focus guide to direct upward navigation from cast back to options */}
        {upwardFocusDestination && (
          <TVFocusGuideView
            destinations={[upwardFocusDestination]}
            style={{ height: 1, width: "100%" }}
          />
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -horizontalPadding, overflow: "visible" }}
          contentContainerStyle={{
            paddingHorizontal: horizontalPadding,
            paddingVertical: 16,
            gap: sizes.gaps.item,
          }}
        >
          {cast.map((person, index) => (
            <TVActorCard
              key={person.Id || index}
              ref={index === 0 ? firstActorRefSetter : undefined}
              person={person}
              apiBasePath={apiBasePath}
              disabled={disabled}
              onPress={() => {
                if (person.Id) {
                  onActorPress(person.Id);
                }
              }}
            />
          ))}
        </ScrollView>
      </View>
    );
  },
);
