import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { Content, Session } from "@lang-tutor/core";
import { loadContent, loadGrammarBook } from "./content-loader.js";
import { profile } from "./pack.js";
import { SyncingStorage } from "./storage/sync.js";
import { persistIfSilent } from "./storage/quota.js";
import { App } from "./app.js";
import { Spinner, Toast } from "./ui.js";
import "./styles.css";

/**
 * Boot: fetch the bundle, restore progress, hand both to the engine.
 *
 * Nothing here talks to a server. The content is static files and the progress
 * is this device's — which is what makes the whole app work on a plane.
 */
function Boot() {
  const [state, setState] = useState<
    | { t: "loading" }
    | { t: "ready"; content: Content; session: Session; storage: SyncingStorage }
    | { t: "failed"; message: string }
  >({ t: "loading" });
  const [updateReady, setUpdateReady] = useState<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const content = await loadContent();
        const storage = new SyncingStorage();
        const progress = await storage.load();
        if (cancelled) return;
        /*
         * The book they were reading, if it is not the one that ships with the
         * bundle. A further grammar is fetched on demand, so on a cold start it
         * is not here yet — and `Session.grammarId` refuses to name a book it
         * cannot draw, which would quietly put a Lane reader back in Bennett
         * every time they closed the tab.
         *
         * Failure is not fatal: falling back to the primary is exactly what the
         * refusal does anyway, and a student offline with an empty cache should
         * get the app rather than an error page.
         */
        if (progress?.grammarId && progress.grammarId !== content.primaryGrammar) {
          try {
            await loadGrammarBook(content, progress.grammarId);
          } catch {
            /* the primary is always loaded, and is where they will land */
          }
          if (cancelled) return;
        }
        setState({
          t: "ready",
          content,
          storage,
          session: new Session(content, progress ?? undefined),
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          t: "failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // A reload mid-sentence would lose the answer being typed, so a new version
    // waits to be asked for rather than taking over.
    const update = registerSW({
      onNeedRefresh: () => setUpdateReady(() => () => void update(true)),
    });
  }, []);

  // Ask to be exempt from eviction, before anything is downloaded that would be
  // worth losing. Nothing waits on the answer and nothing is shown either way:
  // this is silent where it is granted and a no-op where it is not, and Settings
  // both reports the outcome and offers the ask a student can make by hand.
  useEffect(() => {
    void persistIfSilent();
  }, []);

  return (
    <>
      {state.t === "loading" && (
        <div className="centered">
          <Spinner />
          <p>Opening the grammar…</p>
        </div>
      )}
      {state.t === "failed" && (
        <div className="centered">
          <h1>Could not load the lessons.</h1>
          <p>{state.message}</p>
          <p>
            If this is the first time you have opened {profile.ui.appName}, you need to be
            online once so it can save itself to this device.
          </p>
        </div>
      )}
      {state.t === "ready" && (
        <App
          content={state.content}
          session={state.session}
          storage={state.storage}
        />
      )}
      {updateReady && (
        <Toast
          message="A new version is ready."
          action="Reload"
          onAction={updateReady}
        />
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
