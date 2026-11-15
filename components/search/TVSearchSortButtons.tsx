import React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { TVFilterButton } from "@/components/tv/TVFilterButton";

/** The search's sort, given once something is typed. */
export interface TVSearchSort {
  /** The current sort's label. */
  sortValue: string;
  onSortPress: () => void;
  /** The current order's label, left out for a sort that has none. */
  orderValue?: string;
  onOrderPress: () => void;
}

export interface TVSearchSortButtonsProps {
  sort: TVSearchSort;
  disabled?: boolean;
}

/**
 * The sort of the results, as the TV library page has it: one button for the
 * sort, one for the order, each opening its sheet.
 */
export const TVSearchSortButtons: React.FC<TVSearchSortButtonsProps> = ({
  sort,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 16,
        marginTop: 16,
        marginBottom: 24,
      }}
    >
      <TVFilterButton
        label={t("library.filters.sort_by")}
        value={sort.sortValue}
        onPress={sort.onSortPress}
        disabled={disabled}
      />
      {sort.orderValue && (
        <TVFilterButton
          label={t("library.filters.sort_order")}
          value={sort.orderValue}
          onPress={sort.onOrderPress}
          disabled={disabled}
        />
      )}
    </View>
  );
};
