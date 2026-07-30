#!/usr/bin/env node
/**
 * Write the landing page that sits above the language builds.
 *
 * Each language is compiled separately and served from its own subdirectory,
 * so the site root itself holds no app and would 404 without this. It is not a
 * language switcher — the two builds share nothing at runtime, not even a
 * storage key — it is a door with the languages written on it.
 *
 *   node scripts/build-site-index.mjs site [latin greek]
 *
 * The list comes from $LANG_PACKS or the arguments after the directory, and
 * every name in it must be a directory already built into <site>/<pack>/.
 * Names and colours are read from each pack's profile, so a new language needs
 * no edit here.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const [dir, ...named] = process.argv.slice(2);
if (!dir) {
  console.error("usage: build-site-index.mjs <site-dir> [pack ...]");
  process.exit(1);
}
const packs = (named.length ? named : (process.env.LANG_PACKS ?? "").split(/\s+/))
  .filter(Boolean);
if (!packs.length) {
  console.error("No packs named. Pass them as arguments or set LANG_PACKS.");
  process.exit(1);
}

const entries = packs.map((pack) => {
  const path = join(root, "languages", pack, "profile.json");
  if (!existsSync(path)) {
    console.error(`No profile at ${path} — is "${pack}" a language pack?`);
    process.exit(1);
  }
  const profile = JSON.parse(readFileSync(path, "utf8"));
  if (!existsSync(join(dir, pack, "index.html"))) {
    console.error(`${pack} has no build in ${join(dir, pack)}.`);
    process.exit(1);
  }
  return {
    pack,
    // The endonym is the name the language calls itself, which is what the
    // app's own splash shows; the English name says which one that is.
    endonym: profile.ui.appName,
    name: profile.l2.name,
    description: profile.ui.description,
    theme: profile.ui.themeColor,
  };
});

const escape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Deliberately one static file with no build step of its own: it exists so the
// root does not 404, and anything more would be a fourth thing to maintain.
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Grammar drills</title>
<meta name="theme-color" content="${escape(entries[0].theme)}">
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-content: center;
    gap: 2.5rem; padding: 2rem;
    background: ${escape(entries[0].theme)}; color: #f4efe6;
    font: 1rem/1.5 Georgia, "Times New Roman", serif;
  }
  h1 { font-size: 1.05rem; font-weight: normal; letter-spacing: .14em;
       text-transform: uppercase; opacity: .55; margin: 0; text-align: center; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem;
       width: min(30rem, 100%); }
  a { display: block; padding: 1.4rem 1.6rem; text-decoration: none;
      color: inherit; border: 1px solid #3a3547; border-radius: .75rem;
      background: #191723; transition: border-color .15s, background .15s; }
  a:hover, a:focus-visible { border-color: #e8c98a; background: #1e1b2a; }
  .endonym { font-size: 1.9rem; color: #e8c98a; }
  .name { font-size: .78rem; letter-spacing: .12em; text-transform: uppercase;
          opacity: .5; margin-top: .35rem; }
  .about { font-size: .9rem; opacity: .72; margin-top: .7rem; }
</style>
</head>
<body>
  <h1>Grammar drills</h1>
  <ul>
${entries
  .map(
    (e) => `    <li>
      <a href="./${e.pack}/">
        <div class="endonym">${escape(e.endonym)}</div>
        <div class="name">${escape(e.name)}</div>
        <div class="about">${escape(e.description)}</div>
      </a>
    </li>`,
  )
  .join("\n")}
  </ul>
</body>
</html>
`;

writeFileSync(join(dir, "index.html"), html);
console.log(`wrote ${join(dir, "index.html")}: ${entries.map((e) => e.pack).join(", ")}`);
