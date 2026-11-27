import { Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { Colors, SheetColors } from "@/constants/Colors";
import {
  ISSUE_TYPES,
  type IssueType,
  IssueTypeName,
} from "@/utils/seerr/types";

/** How far a type fades while a finger is on it. */
const PRESSED_OPACITY = 0.7;

interface Props {
  /** The type chosen so far, none before the first tap. */
  value: IssueType | undefined;
  onChange: (type: IssueType) => void;
}

/**
 * The issue types of the phone's report issue sheet, side by side, so one tap
 * chooses one. In a dropdown they took two on iOS, which nests a titled group
 * of choices a menu deeper.
 */
export const IssueTypePicker: React.FC<Props> = ({ value, onChange }) => (
  <View
    accessibilityRole='radiogroup'
    className='flex flex-row w-full p-1 rounded-xl bg-neutral-900 border border-neutral-800'
    style={{ gap: 4 }}
  >
    {ISSUE_TYPES.map((type) => {
      const selected = type === value;
      return (
        <Pressable
          key={type}
          accessibilityRole='radio'
          accessibilityState={{ selected }}
          onPress={() => onChange(type)}
          style={({ pressed }) => ({
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: selected ? Colors.primary : "transparent",
            opacity: pressed ? PRESSED_OPACITY : 1,
          })}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: selected ? Colors.text : SheetColors.secondaryText,
            }}
          >
            {IssueTypeName[type]}
          </Text>
        </Pressable>
      );
    })}
  </View>
);
