import {
  THEME_INIT_SCRIPT,
  browserStorage,
  THEME_KEY,
  parseTheme,
  readSavedTheme,
  saveTheme,
} from "../theme";

function storage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe("parseTheme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["Dark", null],
    ["system", null],
    ["", null],
    [null, null],
    [undefined, null],
    [1, null],
  ])("%p gives %p", (value, expected) => {
    expect(parseTheme(value)).toBe(expected);
  });
});

describe("readSavedTheme and saveTheme", () => {
  it("round-trips a choice under the theme key", () => {
    const s = storage();
    saveTheme(s, "dark");
    expect(s.data[THEME_KEY]).toBe("dark");
    expect(readSavedTheme(s)).toBe("dark");
  });

  it("ignores a saved value that is not a theme", () => {
    expect(readSavedTheme(storage({ [THEME_KEY]: "<script>" }))).toBeNull();
  });

  it("never throws when storage is missing or blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readSavedTheme(blocked)).toBeNull();
    expect(() => saveTheme(blocked, "light")).not.toThrow();
    expect(readSavedTheme(null)).toBeNull();
    expect(() => saveTheme(null, "light")).not.toThrow();
  });
});

describe("browserStorage", () => {
  it("gives the storage of the window it is given", () => {
    const fake = storage();
    expect(browserStorage({ localStorage: fake })).toBe(fake);
  });

  it("gives null when there is no window or no storage", () => {
    expect(browserStorage(null)).toBeNull();
    expect(browserStorage({})).toBeNull();
  });

  it("gives null when asking for the storage throws", () => {
    const blocked = {
      get localStorage(): never {
        throw new Error("denied");
      },
    };
    expect(browserStorage(blocked)).toBeNull();
  });
});

// The script runs in the page head, so it is evaluated here against a fake
// window and document instead of the real browser storage, which differs
// between Node and jsdom versions.
describe("THEME_INIT_SCRIPT", () => {
  function run(localStorage: unknown): string | undefined {
    const documentElement = { dataset: {} as Record<string, string> };
    new Function("window", "document", THEME_INIT_SCRIPT)(
      { localStorage },
      { documentElement },
    );
    return documentElement.dataset.theme;
  }

  it("applies a saved dark or light choice", () => {
    expect(run(storage({ [THEME_KEY]: "dark" }))).toBe("dark");
    expect(run(storage({ [THEME_KEY]: "light" }))).toBe("light");
  });

  it("leaves the device setting alone when nothing is saved", () => {
    expect(run(storage())).toBeUndefined();
  });

  it("ignores any other saved value", () => {
    expect(run(storage({ [THEME_KEY]: "pink" }))).toBeUndefined();
    expect(run(storage({ [THEME_KEY]: "<script>" }))).toBeUndefined();
  });

  it("does not throw when storage is blocked or missing", () => {
    const blocked = {
      getItem: () => {
        throw new Error("denied");
      },
    };
    expect(run(blocked)).toBeUndefined();
    expect(run(undefined)).toBeUndefined();
  });
});
