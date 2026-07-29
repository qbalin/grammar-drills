import { render } from "ink";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Session } from "@latin-tutor/core";
import { App } from "./app.js";
import { loadContent } from "./content-loader.js";
import { LocalFileStorage } from "./storage-local.js";

const here = dirname(fileURLToPath(import.meta.url));
const languages = join(here, "..", "..", "..", "languages");

const { values } = parseArgs({
  options: {
    pack: { type: "string" },
    language: { type: "string" },
    content: { type: "string" },
    progress: { type: "string" },
  },
});

// A pack is a directory; the language name is the short way to name one that
// lives in this repo.
const packDir =
  values.pack ?? join(languages, values.language ?? process.env.LANG_PACK ?? "latin");
const contentDir = values.content ?? join(packDir, "content");
const progressPath =
  values.progress ?? join(homedir(), ".latin-tutor", "progress.json");

const content = loadContent(contentDir);
const storage = new LocalFileStorage(progressPath);
const progress = await storage.load();
const session = new Session(content, progress ?? undefined);

render(<App session={session} content={content} storage={storage} />);
