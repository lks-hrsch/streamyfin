import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { IssueStatus, IssueType } from "@/utils/seerr/types";
import { SeerrApi } from "./useSeerr";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// Ships as ES modules, which Jest does not load.
jest.mock("sonner-native", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
// The real log loads Sentry, whose timers keep Jest from exiting.
jest.mock("@/utils/log", () => ({
  writeToLog: jest.fn(),
  writeErrorLog: jest.fn(),
}));
// The settings atom imports the screens that edit it; the client reads none.
jest.mock("@/utils/atoms/settings", () => ({ useSettings: () => ({}) }));

// A Seerr that files every issue it is sent, and the requests it was sent.
const filing = () => {
  const api = new SeerrApi("https://seerr.example");
  const sent: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    sent.push(config);
    return {
      data: { id: 1, status: IssueStatus.OPEN },
      status: 201,
      statusText: "Created",
      headers: {},
      config,
    };
  };
  api.axios.defaults.adapter = adapter;
  return { api, body: () => JSON.parse(sent.at(-1)?.data ?? "null") };
};

describe("SeerrApi.submitIssue", () => {
  // Seerr's own web app sends the affected season and episode, and Seerr
  // stores and shows them, though its OpenAPI body declares neither.
  test("names the season and episode an issue is about", async () => {
    const { api, body } = filing();
    await api.submitIssue(7, IssueType.AUDIO, "No sound", {
      season: 2,
      episode: 5,
    });
    expect(body()).toEqual({
      mediaId: 7,
      issueType: IssueType.AUDIO,
      message: "No sound",
      problemSeason: 2,
      problemEpisode: 5,
    });
  });

  test("names a season alone when the episode is not known", async () => {
    const { api, body } = filing();
    await api.submitIssue(7, IssueType.VIDEO, "Wrong cut", { season: 3 });
    expect(body()).toEqual({
      mediaId: 7,
      issueType: IssueType.VIDEO,
      message: "Wrong cut",
      problemSeason: 3,
    });
  });

  // A movie or a whole series posts exactly what it did before.
  test("sends only the three declared fields otherwise", async () => {
    const { api, body } = filing();
    await api.submitIssue(42, IssueType.SUBTITLES, "Out of sync");
    expect(body()).toEqual({
      mediaId: 42,
      issueType: IssueType.SUBTITLES,
      message: "Out of sync",
    });
  });
});
