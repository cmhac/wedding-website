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
  it("gives the browser's storage, or null when asking for it throws", () => {
    expect(browserStorage()).toBe(window.localStorage);
    jest.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(browserStorage()).toBeNull();
    jest.restoreAllMocks();
  });
});

describe("THEME_INIT_SCRIPT", () => {
  function run(setup: () => void) {
    delete document.documentElement.dataset.theme;
    setup();
    new Function(THEME_INIT_SCRIPT)();
    return document.documentElement.dataset.theme;
  }

  afterEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it("applies a saved dark or light choice", () => {
    expect(run(() => window.localStorage.setItem(THEME_KEY, "dark"))).toBe(
      "dark",
    );
    expect(run(() => window.localStorage.setItem(THEME_KEY, "light"))).toBe(
      "light",
    );
  });

  it("leaves the device setting alone when nothing is saved", () => {
    expect(run(() => window.localStorage.clear())).toBeUndefined();
  });

  it("ignores any other saved value", () => {
    expect(run(() => window.localStorage.setItem(THEME_KEY, "pink"))).toBe(
      undefined,
    );
  });

  it("does not throw when storage is blocked", () => {
    expect(
      run(() => {
        jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
          throw new Error("denied");
        });
      }),
    ).toBeUndefined();
  });
});
