import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import type { SelectedOptions } from "@/components/ItemContent";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { playableQueueItems } from "@/hooks/useShuffleQueue";
import { useDownload } from "@/providers/DownloadProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { type Settings, useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getSeriesPlaybackTarget } from "@/utils/seriesPlaybackTarget";
import { formatDuration } from "@/utils/time";

/**
 * How an episode plays from its series' page, which has no track pickers:
 * the version, tracks and quality the episode's own page would start with
 * (getDefaultPlaySettings, as useDefaultPlaySettings gives that page).
 */
export const defaultPlayOptions = (
  episode: BaseItemDto,
  settings: Settings | null,
  /**
   * The tracks a download was pulled with, when it plays offline: only the
   * record knows them, and the server's indexes can name a stream the file
   * lacks (ItemContent).
   */
  downloaded?: { audioStreamIndex?: number; subtitleStreamIndex?: number },
): SelectedOptions => {
  const { mediaSource, audioIndex, subtitleIndex, bitrate } =
    getDefaultPlaySettings(episode, settings);
  return {
    bitrate,
    mediaSource: mediaSource ?? undefined,
    audioIndex: downloaded?.audioStreamIndex ?? audioIndex,
    subtitleIndex: downloaded?.subtitleStreamIndex ?? subtitleIndex ?? -1,
  };
};

/** The tracks of an episode's download, offline only. */
const useDownloadedTracks = () => {
  const isOffline = useOfflineMode();
  const { getDownloadedItemById } = useDownload();
  return useCallback(
    (episode: BaseItemDto) =>
      isOffline && episode.Id
        ? getDownloadedItemById(episode.Id)?.userData
        : undefined,
    [isOffline, getDownloadedItemById],
  );
};

/**
 * The episode a series' Play starts (getSeriesPlaybackTarget: the one in
 * progress, else the next unplayed), among those there is something to play
 * of, and the options it plays with. Undefined until the episodes are known.
 */
export const useSeriesPlayback = (episodes: BaseItemDto[] | undefined) => {
  const { settings } = useSettings();
  const downloadedTracks = useDownloadedTracks();
  const target = useMemo(
    () =>
      episodes
        ? getSeriesPlaybackTarget(playableQueueItems(episodes))
        : undefined,
    [episodes],
  );
  const selectedOptions = useMemo(
    () =>
      target
        ? defaultPlayOptions(target, settings, downloadedTracks(target))
        : undefined,
    [target, settings, downloadedTracks],
  );
  return { target, selectedOptions };
};

/**
 * Plays an episode at once from a page without the episode's own Play
 * button: the TV series page's Play. It asks resume or restart as that
 * button does (ItemContent.tv), unless the setting says to resume.
 */
export const usePlayEpisodeNow = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const isOffline = useOfflineMode();
  const downloadedTracks = useDownloadedTracks();
  const playMedia = usePlayMedia();

  return useCallback(
    (episode: BaseItemDto) => {
      if (!episode.Id) return;
      const options = defaultPlayOptions(
        episode,
        settings,
        downloadedTracks(episode),
      );
      const start = (positionTicks: number) =>
        void playMedia(
          {
            itemId: episode.Id!,
            audioIndex: options.audioIndex,
            subtitleIndex: options.subtitleIndex,
            mediaSourceId: options.mediaSource?.Id ?? undefined,
            bitrateValue: options.bitrate?.value ?? undefined,
            offline: isOffline,
            playbackPositionTicks: positionTicks,
          },
          { item: episode },
        );

      const position = episode.UserData?.PlaybackPositionTicks ?? 0;
      if (position <= 0) {
        start(0);
        return;
      }
      if (!settings.showResumeDialog) {
        start(position);
        return;
      }
      Alert.alert(
        t("item_card.resume_playback"),
        t("item_card.resume_playback_description"),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("item_card.play_from_start"), onPress: () => start(0) },
          {
            text: t("item_card.continue_from", {
              time: formatDuration(position),
            }),
            onPress: () => start(position),
            isPreferred: true,
          },
        ],
      );
    },
    [playMedia, settings, isOffline, downloadedTracks, t],
  );
};
