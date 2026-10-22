import { useSegments } from "expo-router";
import { useAtomValue } from "jotai";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { buildItemCards, type CardData } from "@/components/cards/CardData";
import { CardRow } from "@/components/cards/CardRow";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import SeerrStatusIcon from "@/components/seerr/SeerrStatusIcon";
import { Colors } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { apiAtom } from "@/providers/JellyfinProvider";
import { type FilmographyEntry, roleText } from "@/utils/seerr/personProfile";
import { canRequest } from "@/utils/seerr/requests";

const LIBRARY = "library:";
const SEERR = "seerr:";

/** Under the poster: the title's year and the person's part in it. */
const subtitleOf = (year: number | undefined, role: string | undefined) =>
  [year, role].filter(Boolean).join(" · ") || null;

/**
 * One row of a library person's filmography on the phone: the library's
 * titles first, marked as there, then the rest Seerr knows the person made,
 * with their Seerr status. Both open where they belong: a library title its
 * item page, the rest its Seerr page, where it can be requested.
 */
export const PersonFilmographyRow: React.FC<{
  title: string;
  entries: FilmographyEntry[];
  loading?: boolean;
}> = ({ title, entries, loading }) => {
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const router = useRouter();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";
  const { seerrApi, seerrUser, getTitle, getYear } = useSeerr();

  const cards = useMemo<CardData[]>(
    () =>
      entries.flatMap((entry): CardData[] => {
        if (entry.source === "library") {
          const [card] = buildItemCards([entry.item], {
            api,
            kind: "portrait",
          });
          if (!card) return [];
          return [
            {
              ...card,
              id: LIBRARY + card.id,
              subtitle: subtitleOf(
                entry.item.ProductionYear ?? undefined,
                roleText(t, entry.credit),
              ),
            },
          ];
        }
        const year = getYear(entry.credit);
        return [
          {
            id: `${SEERR}${entry.credit.mediaType}:${entry.credit.id}`,
            title: getTitle(entry.credit) ?? "",
            subtitle: subtitleOf(
              Number.isNaN(year) ? undefined : year,
              roleText(t, entry.credit),
            ),
            imageUrl: seerrApi?.imageProxy(
              entry.credit.posterPath,
              "w300_and_h450_face",
            ),
          },
        ];
      }),
    // getTitle/getYear are pure helpers useSeerr recreates each render.
    [entries, api, seerrApi, t],
  );

  const entryOf = useCallback(
    (id: string) =>
      entries.find((entry) =>
        entry.source === "library"
          ? id === LIBRARY + entry.item.Id
          : id === `${SEERR}${entry.credit.mediaType}:${entry.credit.id}`,
      ),
    [entries],
  );

  const onPressId = useCallback(
    (id: string) => {
      const entry = entryOf(id);
      if (!entry) return;
      if (entry.source === "library") {
        router.push(getItemNavigation(entry.item, from) as never);
        return;
      }
      const { credit } = entry;
      router.push({
        pathname: `/(auth)/(tabs)/${from}/seerr/page`,
        params: {
          id: String(credit.id),
          mediaType: credit.mediaType,
          mediaTitle: getTitle(credit),
          releaseYear: String(getYear(credit)),
          posterSrc:
            seerrApi?.imageProxy(credit.posterPath, "w300_and_h450_face") ?? "",
          canRequest: String(
            !!seerrUser && canRequest(credit, seerrUser.permissions),
          ),
        },
      } as never);
    },
    [entryOf, from, router, seerrApi, seerrUser, getTitle, getYear],
  );

  const slots = useMemo(
    () => ({
      overlay: (card: CardData) => {
        if (card.id.startsWith(LIBRARY)) return <InLibraryPill />;
        const entry = entryOf(card.id);
        if (entry?.source !== "seerr") return null;
        return (
          <View style={{ position: "absolute", top: 6, right: 6 }}>
            <SeerrStatusIcon
              small
              mediaStatus={entry.credit.mediaInfo?.status}
              // As on Seerr's own posters: a "+" where it can be requested.
              showRequestIcon={
                !!seerrUser && canRequest(entry.credit, seerrUser.permissions)
              }
            />
          </View>
        );
      },
    }),
    [entryOf, seerrUser],
  );

  return (
    <CardRow
      title={title}
      kind='portrait'
      cards={cards}
      loading={loading}
      onPressId={onPressId}
      slots={slots}
      hideIfEmpty
    />
  );
};

/** On a library title's poster: it is there to play. */
const InLibraryPill: React.FC = () => {
  const { t } = useTranslation();
  return (
    <View
      style={{
        position: "absolute",
        left: 6,
        top: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: "rgba(0,0,0,0.65)",
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: Colors.primary,
        }}
      />
      <Text style={{ fontSize: 10, fontWeight: "600" }}>
        {t("person_profile.in_library")}
      </Text>
    </View>
  );
};
