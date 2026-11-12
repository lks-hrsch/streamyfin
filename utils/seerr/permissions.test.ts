import {
  canCreateIssues,
  canSeeRecentlyAdded,
  hasPermission,
  Permission,
} from "./permissions";

describe("hasPermission", () => {
  test("lets an administrator through whatever is asked", () => {
    expect(hasPermission(Permission.MANAGE_REQUESTS, Permission.ADMIN)).toBe(
      true,
    );
  });

  test("refuses a permission the user does not hold", () => {
    expect(hasPermission(Permission.MANAGE_REQUESTS, Permission.REQUEST)).toBe(
      false,
    );
  });

  test("accepts a permission the user holds among others", () => {
    expect(
      hasPermission(
        Permission.REQUEST,
        Permission.REQUEST | Permission.REQUEST_MOVIE,
      ),
    ).toBe(true);
  });

  test("needs every permission when asked for all of them", () => {
    expect(
      hasPermission([Permission.REQUEST, Permission.VOTE], Permission.REQUEST, {
        type: "and",
      }),
    ).toBe(false);
  });

  test("needs only one when asked for any", () => {
    expect(
      hasPermission([Permission.REQUEST, Permission.VOTE], Permission.REQUEST, {
        type: "or",
      }),
    ).toBe(true);
  });

  // NONE is 0, and asking for nothing is not the same as being refused.
  test("asks for nothing and gets it", () => {
    expect(hasPermission(Permission.NONE, Permission.NONE)).toBe(true);
  });

  // The values are a bitmask a server sends as a plain number, so a wrong one
  // silently grants or refuses the wrong thing. These are the six the app
  // reads, checked against the values Seerr assigns them.
  test("keeps the values Seerr assigns", () => {
    expect(Permission.ADMIN).toBe(2);
    expect(Permission.MANAGE_REQUESTS).toBe(16);
    expect(Permission.REQUEST).toBe(32);
    expect(Permission.REQUEST_ADVANCED).toBe(8192);
    expect(Permission.REQUEST_MOVIE).toBe(262144);
    expect(Permission.REQUEST_TV).toBe(524288);
  });
});

// Seerr's recently added row shows to those who manage requests or may see
// what was added (RecentlyAddedSlider), and to nobody else.
describe("canSeeRecentlyAdded", () => {
  test("shows it to a request manager or to Recent View", () => {
    expect(canSeeRecentlyAdded(Permission.MANAGE_REQUESTS)).toBe(true);
    expect(canSeeRecentlyAdded(Permission.RECENT_VIEW)).toBe(true);
    expect(canSeeRecentlyAdded(Permission.ADMIN)).toBe(true);
  });

  test("hides it from someone who may only request", () => {
    expect(canSeeRecentlyAdded(Permission.REQUEST)).toBe(false);
    expect(canSeeRecentlyAdded(0)).toBe(false);
  });
});

// Seerr's own rule for POST /issue: either permission will do. The Seerr
// page offered its report button to everyone, and anyone else filled in the
// sheet to be refused with a 403.
describe("canCreateIssues", () => {
  test("takes an issue from those who may create or manage issues", () => {
    expect(canCreateIssues(Permission.CREATE_ISSUES)).toBe(true);
    expect(canCreateIssues(Permission.MANAGE_ISSUES)).toBe(true);
    expect(canCreateIssues(Permission.ADMIN)).toBe(true);
    expect(canCreateIssues(Permission.REQUEST | Permission.CREATE_ISSUES)).toBe(
      true,
    );
  });

  test("refuses everyone else", () => {
    expect(canCreateIssues(Permission.REQUEST | Permission.VIEW_ISSUES)).toBe(
      false,
    );
    expect(canCreateIssues(Permission.NONE)).toBe(false);
    // No Seerr user signed in.
    expect(canCreateIssues(undefined)).toBe(false);
  });
});
