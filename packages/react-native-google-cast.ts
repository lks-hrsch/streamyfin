import { NativeModules } from "react-native";
import * as GoogleCast from "react-native-google-cast";

/**
 * react-native-google-cast, or inert stand-ins where its native half is absent.
 *
 * The Cast SDK has no Mac Catalyst (or tvOS) slice, so those builds leave the
 * pod out. The library's JavaScript still loads fine, but its hooks construct a
 * NativeEventEmitter over the missing module, and on iOS that constructor
 * throws, taking the whole screen down with it. Importing through here keeps
 * the call sites unchanged: with the native module present this is the library
 * itself; without it, nothing is ever connected or discoverable, so every
 * cast-only branch stays dormant and the cast buttons hide via
 * `isCastAvailable`.
 */
export * from "react-native-google-cast";

export const isCastAvailable = NativeModules.RNGCCastContext != null;

const nothing = () => null;

export const useCastDevice: typeof GoogleCast.useCastDevice = isCastAvailable
  ? GoogleCast.useCastDevice
  : nothing;
export const useCastSession: typeof GoogleCast.useCastSession = isCastAvailable
  ? GoogleCast.useCastSession
  : nothing;
export const useCastState: typeof GoogleCast.useCastState = isCastAvailable
  ? GoogleCast.useCastState
  : nothing;
export const useMediaStatus: typeof GoogleCast.useMediaStatus = isCastAvailable
  ? GoogleCast.useMediaStatus
  : nothing;
export const useRemoteMediaClient: typeof GoogleCast.useRemoteMediaClient =
  isCastAvailable ? GoogleCast.useRemoteMediaClient : nothing;
export const useStreamPosition: typeof GoogleCast.useStreamPosition =
  isCastAvailable ? GoogleCast.useStreamPosition : nothing;
const noDevices: GoogleCast.Device[] = [];
export const useDevices: typeof GoogleCast.useDevices = isCastAvailable
  ? GoogleCast.useDevices
  : () => noDevices;

export const CastButton = (
  isCastAvailable ? GoogleCast.CastButton : nothing
) as typeof GoogleCast.CastButton;

const inertCastContext = {
  ...GoogleCast.CastContext,
  getCastState: async () => GoogleCast.CastState.NO_DEVICES_AVAILABLE,
  getDiscoveryManager: () => undefined,
  getPlayServicesState: async () => GoogleCast.PlayServicesState.SUCCESS,
  getSessionManager: () => undefined,
  showCastDialog: async () => false,
  showExpandedControls: () => false,
  showIntroductoryOverlay: async () => false,
  showPlayServicesErrorDialog: async () => false,
} as unknown as typeof GoogleCast.CastContext;

export const CastContext = isCastAvailable
  ? GoogleCast.CastContext
  : inertCastContext;
export default CastContext;
