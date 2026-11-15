import { measureFunction } from "reassure";
import { save, sessionCache } from "@/test-utils/tvSessionCache";
import { queryDehydrateOptions } from "./queryPersistence";

// Baseline for saving the query cache. The persister turns the whole dehydrated cache into one JSON string on the
// JS thread, at most once a second while queries change. This measures that
// work on a cache shaped like a TV session: the Home screen, a library browsed
// ten pages deep, and a few item pages.

// One save takes well under a millisecond in Node. Fifty made a run of 10 to
// 28 ms on CI, where the PR read 22 to 36% faster than its base on nearly
// every PR, the ones that change nothing this runs among them, though each
// side's runs mostly agreed to 1 or 2%: not timer noise, but a gap between the
// two Jest processes. The restore below, which collects no garbage before its
// runs, showed no such gap, which points at a cost paid once per run. Five
// hundred saves make a run ten times longer, where such a cost stays under
// the comment's 10% floor.
const SAVES_PER_RUN = 500;

test("saving the query cache of a TV session five hundred times", async () => {
  const client = sessionCache();

  // What the persister does on each save: dehydrate with the app's rules,
  // then serialise for MMKV.
  await measureFunction(
    () => {
      for (let index = 0; index < SAVES_PER_RUN; index++) {
        save(client, queryDehydrateOptions);
      }
    },
    // measureRenders collects garbage after each run and measureFunction does
    // not, so a run would start on whatever heap the earlier spec files left.
    { beforeEach: () => globalThis.gc?.() },
  );
  // Its garbage collection timers would keep Jest from exiting.
  client.clear();
});

test("restoring the query cache of a TV session five hundred times", async () => {
  const client = sessionCache();
  const blob = save(client, queryDehydrateOptions);

  await measureFunction(() => {
    for (let restore = 0; restore < SAVES_PER_RUN; restore++) {
      JSON.parse(blob);
    }
  });
  client.clear();
});
