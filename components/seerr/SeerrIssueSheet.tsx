import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { SheetColors } from "@/constants/Colors";
import { useSeerr } from "@/hooks/useSeerr";
import { writeErrorLog } from "@/utils/log";
import { type IssueType, IssueTypeName } from "@/utils/seerr/types";
import { createSubmission } from "@/utils/submission";

export interface SeerrIssueSheetRef {
  present: () => void;
}

interface Props {
  /**
   * Seerr's media id for the title (its mediaInfo), not TMDB's. Undefined
   * while Seerr has no record of it.
   */
  mediaId: number | undefined;
  /**
   * False while the page does not know which title it shows: a submit then
   * does nothing.
   */
  ready?: boolean;
}

/**
 * The phone's report issue sheet on a Seerr title's page: the kind of issue,
 * what is wrong, and Seerr files it against the title. The TV has its own,
 * `tv-issue-modal`.
 */
export const SeerrIssueSheet = forwardRef<SeerrIssueSheetRef, Props>(
  ({ mediaId, ready = true }, ref) => {
    const { t } = useTranslation();
    const { seerrApi } = useSeerr();
    const sheetRef = useRef<BottomSheetModal>(null);

    const [issueType, setIssueType] = useState<IssueType>();
    const [message, setMessage] = useState<string>();
    const [issueTypeDropdownOpen, setIssueTypeDropdownOpen] = useState(false);

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      ),
      [],
    );

    const submission = useRef(createSubmission()).current;
    const submit = useCallback(() => {
      // A title Seerr has never seen carries no mediaInfo, so there is nothing
      // to file an issue against.
      if (
        !ready ||
        !seerrApi ||
        !issueType ||
        !message ||
        mediaId === undefined
      )
        return;
      // A second tap while the first is on its way would file the issue twice.
      if (!submission.start()) return;
      seerrApi
        .submitIssue(mediaId, Number(issueType), message)
        .then(() => {
          setIssueType(undefined);
          setMessage(undefined);
          sheetRef.current?.close();
        })
        // The response interceptor already logs and reports the failure with
        // its route; an uncaught rejection here would re-report it as a
        // stackless unhandledrejection event.
        .catch((error) => {
          writeErrorLog("Seerr submitIssue failed", String(error));
        })
        .finally(() => submission.finish());
    }, [ready, seerrApi, mediaId, issueType, message, submission]);

    const handleDismiss = useCallback(() => {
      setIssueTypeDropdownOpen(false);
    }, []);

    const issueTypeOptionGroups = useMemo(
      () => [
        {
          title: t("seerr.types"),
          options: Object.entries(IssueTypeName)
            .reverse()
            .map(([key, value]) => ({
              type: "radio" as const,
              label: value,
              value: key,
              selected: key === String(issueType),
              onPress: () => setIssueType(key as unknown as IssueType),
            })),
        },
      ],
      [issueType, t],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: SheetColors.background,
        }}
        backdropComponent={renderBackdrop}
        stackBehavior='push'
        onDismiss={handleDismiss}
      >
        <BottomSheetView>
          <View className='flex flex-col px-4 pb-8 pt-2' style={{ gap: 16 }}>
            <View>
              <Text className='font-bold text-2xl text-neutral-100'>
                {t("seerr.whats_wrong")}
              </Text>
            </View>
            <View className='flex flex-col items-start' style={{ gap: 8 }}>
              <View className='flex flex-col w-full'>
                <Text className='opacity-50 mb-1 text-xs'>
                  {t("seerr.issue_type")}
                </Text>
                <PlatformDropdown
                  groups={issueTypeOptionGroups}
                  trigger={
                    <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
                      <Text numberOfLines={1}>
                        {issueType
                          ? IssueTypeName[issueType]
                          : t("seerr.select_an_issue")}
                      </Text>
                    </View>
                  }
                  title={t("seerr.types")}
                  open={issueTypeDropdownOpen}
                  onOpenChange={setIssueTypeDropdownOpen}
                />
              </View>

              <View className='p-4 border border-neutral-800 rounded-xl bg-neutral-900 w-full'>
                <BottomSheetTextInput
                  multiline
                  maxLength={254}
                  style={{ color: "white" }}
                  clearButtonMode='always'
                  placeholder={t("seerr.issue_details")}
                  placeholderTextColor='#9CA3AF'
                  // Issue with multiline + Textinput inside a portal
                  // https://github.com/callstack/react-native-paper/issues/1668
                  defaultValue={message}
                  onChangeText={setMessage}
                />
              </View>
            </View>
            <Button className='mt-auto' onPress={submit} color='purple'>
              {t("seerr.submit_button")}
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
