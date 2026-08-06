import { describe, expect, it } from "vitest";
import { contentUrl } from "./content-loader.js";

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
