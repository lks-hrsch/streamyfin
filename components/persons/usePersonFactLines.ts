import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type PersonFacts, personFactLines } from "@/utils/seerr/personProfile";

/** The lines under a person's name, in the app's language. */
export const usePersonFactLines = (facts: PersonFacts): string[] => {
  const { t, i18n } = useTranslation();
  return useMemo(
    () =>
      personFactLines(
        t,
        facts,
        i18n.language,
        new Date().toISOString().slice(0, 10),
      ),
    [t, facts, i18n.language],
  );
};
