import type React from "react";
import { useTranslation } from "react-i18next";
import {
  SeasonStatusGroup,
  SeasonStatusRow,
} from "@/components/seerr/SeasonStatusRow";
import { SeerrSeasonStatusColors, SheetColors } from "@/constants/Colors";
import { type SeasonRow, seasonRowStatus } from "@/utils/seerr/seasons";
import {
  seerrSeasonLabel,
  seerrSeasonStatusText,
} from "@/utils/seerr/seasonText";
import { seerrStatusBadge } from "@/utils/seerr/statusBadge";

interface Props {
  rows: SeasonRow[];
  /** The seasons switched on, among those that can still be requested. */
  selected: number[];
  /** False on a server that only takes whole series: nothing to choose. */
  choosable?: boolean;
  /** Whether the quota lets one more season be switched on. */
  roomForOneMore?: boolean;
  onToggle: (seasonNumber: number) => void;
}

/**
 * The seasons of a series to request, as Seerr's request table has them, laid
 * out as a list: one row per season with a circle to check and its episode
 * count, and, for a season already requested or in the library, its status in
 * the circle and in words.
 */
export const SeasonPicker: React.FC<Props> = ({
  rows,
  selected,
  choosable = true,
  roomForOneMore = true,
  onToggle,
}) => {
  const { t } = useTranslation();

  return (
    <SeasonStatusGroup>
      {rows.map((row, index) => {
        const chosen = !row.locked && selected.includes(row.seasonNumber);
        // Greyed like on Seerr once the quota is spent, except to switch off
        // a season already chosen.
        const blocked = !row.locked && !chosen && !roomForOneMore;
        const interactive = choosable && !row.locked && !blocked;
        // A season already asked for or in the library shows where it stands
        // in its circle, with the season list's own icon, so the column of
        // circles reads as the state of the whole series.
        const status = seasonRowStatus(row);
        const color =
          SeerrSeasonStatusColors[status] ?? SheetColors.secondaryText;

        return (
          <SeasonStatusRow
            key={row.seasonNumber}
            separated={index > 0}
            name={seerrSeasonLabel(t, row.seasonNumber)}
            episodes={t("seerr.number_episodes", {
              count: row.episodeCount,
              episode_number: row.episodeCount,
            })}
            circle={
              row.locked
                ? { color, icon: seerrStatusBadge(status, false)?.icon }
                : chosen
                  ? "chosen"
                  : "open"
            }
            status={
              row.locked && row.badge
                ? { text: seerrSeasonStatusText(t, row.badge), color }
                : undefined
            }
            toggle={{
              checked: row.locked || chosen,
              disabled: !interactive,
              dimmed: blocked,
              onPress: () => onToggle(row.seasonNumber),
            }}
          />
        );
      })}
    </SeasonStatusGroup>
  );
};
