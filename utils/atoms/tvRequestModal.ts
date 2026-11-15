import { atom } from "jotai";
import type { MediaRequestBody, MediaType } from "@/utils/seerr/types";

export type TVRequestModalState = {
  requestBody: MediaRequestBody;
  title: string;
  id: number;
  mediaType: MediaType;
  /** After a request went through, for a page that has more to refresh. */
  onRequested?: () => void;
} | null;

export const tvRequestModalAtom = atom<TVRequestModalState>(null);
