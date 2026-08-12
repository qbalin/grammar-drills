import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contentUrl, prefetchGrammarBooks } from "./content-loader.js";
import { profile } from "./pack.js";

/**
 * Where the app looks for its content.
 *
 * This is worth a test of its own because the failure mode is invisible where
 * it is developed: served from a domain root every form of the join happens to
 * work, and only a subpath deploy — which is what GitHub Pages gives you — shows
 * the difference. A wrong join 404s all four assets and the app opens on "Could
 * not load the lessons."
 */
describe("contentUrl", () => {
  it("keeps the subpath a project Pages site is served from", () => {
    expect(
      contentUrl(
        "grammar.json.gz",
        "/latin-tutor/",
        "https://me.github.io/latin-tutor/",
      ),
    ).toBe("https://me.github.io/latin-tutor/content/grammar.json.gz");
  });

  it("survives a base given without its trailing slash", () => {
    // Without the guard this resolves against the parent of `latin-tutor` and
    // asks for /content/grammar.json.gz.
    expect(
      contentUrl(
        "grammar.json.gz",
        "/latin-tutor",
        "https://me.github.io/latin-tutor/",
      ),
    ).toBe("https://me.github.io/latin-tutor/content/grammar.json.gz");
  });

  it("works at a domain root", () => {
    expect(contentUrl("tests.json.gz", "/", "https://latina.example/")).toBe(
      "https://latina.example/content/tests.json.gz",
    );
  });

  it("ignores where in the app the page happens to be", () => {
    // The base is absolute, so a deep URL cannot drag the content path with it.
    expect(
      contentUrl(
        "forms.txt.gz",
        "/latin-tutor/",
        "https://me.github.io/latin-tutor/some/deep/path",
      ),
    ).toBe("https://me.github.io/latin-tutor/content/forms.txt.gz");
  });

  it("handles a relative base, for a copy opened from a folder", () => {
    expect(
      contentUrl("lemmas.json.gz", "./", "https://me.example/latina/index.html"),
    ).toBe("https://me.example/latina/content/lemmas.json.gz");
  });

  /**
   * The five assets have fixed names and are held by the service worker under
   * `CacheFirst`, which never revalidates. The stamp is the only thing that can
   * make a rebuilt bundle a different request, so a device that has the old
   * content keeps it forever without one — which is how a browser ends up
   * insisting a word has no inflected forms while the server has had them for
   * weeks.
   */
  it("hangs the content stamp on the URL, so new content is a new request", () => {
    expect(
      contentUrl(
        "paradigms.txt.gz",
        "/grammar-drills/latin/",
        "https://me.github.io/grammar-drills/latin/",
        "bfd06b2e8157",
      ),
    ).toBe(
      "https://me.github.io/grammar-drills/latin/content/paradigms.txt.gz?v=bfd06b2e8157",
    );
  });

  it("asks for the bare name when there is no stamp to hang", () => {
    expect(contentUrl("tests.json.gz", "/", "https://latina.example/", "")).toBe(
      "https://latina.example/content/tests.json.gz",
    );
  });
});

/**
 * The launch fetch for the pack's further books.
 *
 * Worth its own test because both halves of it are invisible from the app: the
 * names are what the service worker's pattern has to match, and the drained
 * body is what makes the service worker's copy finish. Get either wrong and
 * every screen still works — right up to the switch, offline, weeks later.
 */
describe("prefetchGrammarBooks", () => {
  const asked: string[] = [];
  let drained = 0;

  beforeEach(() => {
    asked.length = 0;
    drained = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        asked.push(new URL(input).pathname);
        return {
          ok: true,
          arrayBuffer: async () => {
            drained += 1;
            return new ArrayBuffer(0);
          },
        } as unknown as Response;
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("asks for every declared book and the crosswalk that joins them", async () => {
    await prefetchGrammarBooks();

    // The pack under test is whichever one this build is for, so the books are
    // read off its profile rather than named here — Greek declares none and
    // this asks for nothing at all, which is the other case that must hold.
    const expected = (profile.grammars ?? []).length
      ? [
          ...(profile.grammars ?? []).map((g) => `/content/grammar-${g.id}.json.gz`),
          "/content/crosswalk.json.gz",
        ]
      : [];
    expect(asked.sort()).toEqual(expected.sort());
  });

  it("drains every body, so the service worker's copy is written", async () => {
    await prefetchGrammarBooks();

    // A tee whose other branch is never read stalls the branch being cached —
    // the file would look fetched and be stored nowhere.
    expect(drained).toBe(asked.length);
  });

  it("reports a book that would not come down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 }) as Response));

    if ((profile.grammars ?? []).length) {
      await expect(prefetchGrammarBooks()).rejects.toThrow(/could not load/);
    }
  });
});
