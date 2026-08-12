import {
  Content,
  type Crosswalk,
  type GrammarSection,
  type LemmaEntry,
  type Test,
} from "@lang-tutor/core";
import { LemmaIndex } from "./lemma-index.js";
import { profile } from "./pack.js";
import { ParadigmIndex } from "./paradigm-index.js";

/**
 * The web twin of `apps/cli/src/content-loader.ts`: same bundle, fetched
 * instead of read off disk.
 *
 * Everything ships pre-gzipped and is inflated here rather than left to the
 * host's `Content-Encoding`. That fixes the transfer and cache size wherever
 * the app is served from — GitHub Pages, a plain file server, or the service
 * worker's own cache — instead of leaving it to the server's configuration.
 */

/**
 * Resolve a content path against the deploy base — `/` at a domain root,
 * `/<repo>/` on GitHub Pages.
 *
 * The trailing slash is load-bearing: `new URL("content/x", ".../latin-tutor")`
 * reads `latin-tutor` as a file and resolves against its parent, quietly asking
 * for `/content/x`. That 404s every asset on Pages while working perfectly at a
 * root, so it is exactly the bug that survives local testing. Exported so a
 * test can pin it.
 *
 * `version` is the content bundle's hash, compiled in by `vite.config.ts`. The
 * five assets have fixed names, and the service worker holds three of them
 * under `CacheFirst` — which never revalidates. Hanging the hash on the URL is
 * what lets new content reach a device that already has old content: same
 * bytes, same URL, nobody re-downloads; new bytes, new URL, everybody does.
 */
export function contentUrl(
  name: string,
  base: string,
  href: string,
  version?: string,
): string {
  const dir = base.endsWith("/") ? base : `${base}/`;
  const query = version ? `?v=${version}` : "";
  return new URL(`${dir}content/${name}${query}`, href).href;
}

function url(name: string): string {
  return contentUrl(
    name,
    import.meta.env.BASE_URL || "/",
    location.href,
    __CONTENT_VERSION__,
  );
}

async function fetchGzipped(name: string): Promise<string> {
  const res = await fetch(url(name));
  if (!res.ok) {
    throw new Error(`could not load ${name} (${res.status})`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());

  // Whether these arrive compressed is not ours to decide. A host that knows
  // about `.gz` sets `Content-Encoding: gzip` and the browser has already
  // inflated the body before we see it; a host that treats it as an opaque file
  // hands over the raw member. Both are correct and the app must work on
  // either, so the gzip magic number settles it rather than a header — headers
  // lie about this often enough (Vite's dev server and GitHub Pages disagree)
  // that trusting them means the app works in development and not in
  // production, or the reverse.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }
  return new TextDecoder().decode(bytes);
}

async function fetchJson<T>(name: string): Promise<T> {
  return JSON.parse(await fetchGzipped(name)) as T;
}

/**
 * The study bundle: the syllabus and every test. Precached by the service
 * worker, so a fresh launch offline gets the whole loop.
 *
 * The dictionary is not here, because this is what the app waits on before it
 * can show anything and the dictionary is several times the size. It is fetched
 * straight afterwards instead — see `App`'s prefetch — so the only thing being
 * bought by the split is a first screen that arrives before the largest file.
 */
export async function loadContent(): Promise<Content> {
  const [grammar, tests] = await Promise.all([
    fetchJson<GrammarSection[]>("grammar.json.gz"),
    fetchJson<Record<string, Test[]>>("tests.json.gz"),
  ]);
  // The build strips `Test.sectionId` (it is the map key) to save bytes; put it
  // back, since `Session.serveTest` hands whole tests to callers that read it.
  for (const [sectionId, list] of Object.entries(tests)) {
    for (const test of list) test.sectionId = sectionId;
  }
  // The dictionary arrives later, if at all, but `Content` is built once and
  // handed to `Session` — so it gets a lookup that resolves at call time rather
  // than a rebuilt bundle. Before the download it reports a miss, which is
  // exactly how `Content.lookup` already describes an unknown word.
  return new Content({ grammar, tests, lemmaLookup: lateBoundDictionary }, profile);
}

/**
 * Take on one of the pack's further grammars, the first time it is opened.
 *
 * Not part of `loadContent` on purpose. Lane's syllabus is 416 KB gzipped
 * against the primary's 129, and the first screen should not wait on a book
 * nobody has asked for — the same reason the dictionary is fetched separately.
 * The crosswalk that makes a second book teachable is small enough to come with
 * the first one that needs it and is then kept.
 *
 * What is deferred is now the parse alone: `prefetchGrammarBooks` has the bytes
 * on the device by then, so this is a read out of the cache rather than the
 * download it used to be — and it works with no connection at all, which is the
 * whole reason the prefetch exists.
 *
 * Safe to call again: `Content.addGrammar` ignores a book it already holds, so
 * switching back and forth costs one fetch.
 */
export async function loadGrammarBook(content: Content, id: string): Promise<void> {
  if (content.grammarIds().includes(id)) return;
  const [sections, crosswalk] = await Promise.all([
    fetchJson<GrammarSection[]>(`grammar-${id}.json.gz`),
    loadCrosswalk(),
  ]);
  const walk = crosswalk[id];
  if (!walk) {
    throw new Error(
      `the bundle has no crosswalk for "${id}", so its topics would have nothing to teach`,
    );
  }
  content.addGrammar(id, sections, walk);
}

let crosswalk: Promise<Record<string, Crosswalk>> | undefined;
function loadCrosswalk(): Promise<Record<string, Crosswalk>> {
  crosswalk ??= fetchJson<Record<string, Crosswalk>>("crosswalk.json.gz");
  return crosswalk;
}

/**
 * Pull every further grammar onto the device, and stop there.
 *
 * The fetch is the whole point and the parse is deliberately not done: what a
 * student on a plane needs is the bytes in the cache, and building Lane's
 * syllabus into memory at boot would charge every student the CPU for a book
 * most of them never open. `loadGrammarBook` still does that on the switch, and
 * by then it is reading out of the cache this warmed.
 *
 * The body has to be drained rather than dropped. The service worker's copy is
 * a tee of this one, and a branch nobody reads stalls the branch that is being
 * written to the cache — so an undrained response is a file that looks fetched
 * and is not stored, which is the failure this function exists to fix.
 */
export async function prefetchGrammarBooks(): Promise<void> {
  const ids = (profile.grammars ?? []).map((g) => g.id);
  if (ids.length === 0) return;
  await Promise.all(
    [...ids.map((id) => `grammar-${id}.json.gz`), "crosswalk.json.gz"].map(
      async (name) => {
        const res = await fetch(url(name));
        if (!res.ok) throw new Error(`could not load ${name} (${res.status})`);
        await res.arrayBuffer();
      },
    ),
  );
}

let loaded: LemmaIndex | undefined;
let pending: Promise<LemmaIndex> | undefined;

const lateBoundDictionary = {
  lookup: (form: string) => loaded?.lookup(form) ?? [],
};

/**
 * Fetch the dictionary, at most once per page. The UI awaits this before
 * offering a lookup; `Content.lookup` itself stays synchronous, so nothing in
 * the engine has to learn about loading.
 */
export function loadDictionary(): Promise<LemmaIndex> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= (async () => {
    const [entries, index] = await Promise.all([
      fetchJson<LemmaEntry[]>("lemmas.json.gz"),
      fetchGzipped("forms.txt.gz"),
    ]);
    loaded = new LemmaIndex(entries, index);
    return loaded;
  })().catch((err) => {
    pending = undefined; // a failed fetch should not poison later attempts
    throw err;
  });
  return pending;
}

let paradigms: ParadigmIndex | undefined;
let paradigmsPending: Promise<ParadigmIndex> | undefined;

/**
 * Fetch the paradigms, at most once per page.
 *
 * Separate from the dictionary, and after it: it is bigger than the
 * dictionary's two files together, and only a student who double-taps a word
 * ever wants it. Both are fetched at launch now, so what the split still buys
 * is the order — the file every gesture wants does not queue behind the file
 * one gesture wants.
 */
export function loadParadigms(): Promise<ParadigmIndex> {
  if (paradigms) return Promise.resolve(paradigms);
  paradigmsPending ??= (async () => {
    paradigms = new ParadigmIndex(await fetchGzipped("paradigms.txt.gz"));
    return paradigms;
  })().catch((err) => {
    paradigmsPending = undefined; // as above: one bad fetch, not a dead feature
    throw err;
  });
  return paradigmsPending;
}

/** True once the dictionary is in memory, so the UI can skip its spinner. */
export function dictionaryReady(): boolean {
  return loaded !== undefined;
}
