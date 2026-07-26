import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { Content, Session } from "@latin-tutor/core";
import { loadContent } from "./content-loader.js";
import { SyncingStorage } from "./storage/sync.js";
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
            If this is the first time you have opened Latina, you need to be
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
