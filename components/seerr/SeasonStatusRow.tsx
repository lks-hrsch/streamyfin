import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type React from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { Colors, SheetColors } from "@/constants/Colors";
import {
  SEERR_BLOCKED_OPACITY,
  SEERR_STATUS_TINT_ALPHA,
} from "@/constants/Seerr";
import type { SeerrStatusIconName } from "@/utils/seerr/statusBadge";

const CIRCLE = 24;
const INSET = 14;

const ROW_STYLE = {
  flexDirection: "row",
  alignItems: "center",
  gap: INSET,
  paddingHorizontal: INSET,
  paddingVertical: 12,
} as const;

/**
 * What a season's circle shows: where it stands on Seerr, in its status
 * colour with the season list's own icon, or, in the request sheet, whether
 * it is switched on.
 */
export type SeasonCircle =
  | { color: string; icon?: SeerrStatusIconName }
  | "chosen"
  | "open";

interface Props {
  name: string;
  /** The season's episode count, in words. */
  episodes: string;
  circle: SeasonCircle;
  /** Where the season stands, in words at the end of the row. */
  status?: { text: string; color: string };
  /** Every row but a group's first sits under a separator. */
  separated: boolean;
  /** The request sheet's switch. A row without one is only read. */
  toggle?: {
    checked: boolean;
    disabled: boolean;
    /** Greyed as on Seerr once the quota is spent. */
    dimmed: boolean;
    onPress: () => void;
  };
}

/**
 * The card a list of season rows sits on, in the sheet's grouped look.
 */
export const SeasonStatusGroup: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <View
    style={{
      backgroundColor: SheetColors.group,
      borderRadius: 14,
      overflow: "hidden",
    }}
  >
    {children}
  </View>
);

/**
 * One season of a series as Seerr's request table has it: a circle, the
 * season's name over its episode count, and where it stands. The request
 * sheet (SeasonPicker) and the series page's missing seasons draw the same
 * row, so a season reads alike in both.
 */
export const SeasonStatusRow: React.FC<Props> = ({
  name,
  episodes,
  circle,
  status,
  separated,
  toggle,
}) => {
  // The status too: a label replaces what the row says.
  const label = [name, episodes, status?.text].filter(Boolean).join(", ");
  const content = (
    <>
      <View
        style={{
          width: CIRCLE,
          height: CIRCLE,
          borderRadius: CIRCLE / 2,
          alignItems: "center",
          justifyContent: "center",
          ...(typeof circle === "object"
            ? { backgroundColor: `${circle.color}${SEERR_STATUS_TINT_ALPHA}` }
            : circle === "chosen"
              ? { backgroundColor: Colors.primary }
              : { borderWidth: 2, borderColor: SheetColors.idle }),
        }}
      >
        {typeof circle === "object" ? (
          circle.icon && (
            <MaterialCommunityIcons
              name={circle.icon}
              size={15}
              color={circle.color}
            />
          )
        ) : circle === "chosen" ? (
          <Ionicons name='checkmark' size={15} color='white' />
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17 }} numberOfLines={1}>
          {name}
        </Text>
        <Text
          style={{
            fontSize: 13,
            marginTop: 1,
            color: SheetColors.secondaryText,
          }}
        >
          {episodes}
        </Text>
      </View>
      {status && (
        <Text style={{ fontSize: 13, color: status.color }}>{status.text}</Text>
      )}
    </>
  );

  return (
    <View>
      {separated && (
        <View
          style={{
            height: 1,
            marginLeft: INSET + CIRCLE + INSET,
            backgroundColor: SheetColors.separator,
          }}
        />
      )}
      {toggle ? (
        <Pressable
          disabled={toggle.disabled}
          onPress={toggle.onPress}
          accessibilityRole='checkbox'
          accessibilityLabel={label}
          accessibilityState={{
            checked: toggle.checked,
            disabled: toggle.disabled,
          }}
          style={{
            ...ROW_STYLE,
            opacity: toggle.dimmed ? SEERR_BLOCKED_OPACITY : 1,
          }}
        >
          {content}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={label} style={ROW_STYLE}>
          {content}
        </View>
      )}
    </View>
  );
};
