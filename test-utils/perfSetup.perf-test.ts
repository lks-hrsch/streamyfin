import { Vibration } from "react-native";
import { apiAtom as providerApiAtom } from "@/providers/JellyfinProvider";
import { apiAtom } from "@/utils/atoms/api";

let mockVibrationReads = 0;
const mockVibration = { vibrate: jest.fn(), cancel: jest.fn() };
// react-native's index reads `default` off this module each time its getter
// runs, so the count is how many times the export was resolved.
jest.mock("react-native/Libraries/Vibration/Vibration", () => ({
  get default() {
    mockVibrationReads += 1;
    return mockVibration;
  },
}));

// settings.ts reads the api from utils/atoms/api while a scenario answers
// requests on the provider's double, so the two must be one atom.
test("the provider and utils/atoms/api share the api double", () => {
  expect(apiAtom).toBe(providerApiAtom);
});

// Resolving on every read put a Jest-only cost in every render scenario. Once
// per spec file must still mean on first read, after this file's mocks.
test("a react-native export resolves once, to the spec's own mock", () => {
  expect(Vibration).toBe(mockVibration);
  expect(Vibration).toBe(mockVibration);
  expect(mockVibrationReads).toBe(1);
});
