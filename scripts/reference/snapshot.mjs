#!/usr/bin/env node
/**
 * Save a pack's reference databases somewhere another machine can get them.
 *
 *   node scripts/reference/snapshot.mjs pack    --pack languages/latin
 *   node scripts/reference/snapshot.mjs restore --pack languages/latin
 *   node scripts/reference/snapshot.mjs verify  --pack languages/latin
 *
 * The reference is hundreds of megabytes and `.gitignore` keeps it out, which
 * is right — but "rebuild it" is not a real answer for the dictionary. kaikki
 * regenerates its dumps, so a rebuild a year from now is a *different* file,
 * and the pack's committed content was built from this one. Two of Latin's
 * seven corpus texts have no recoverable edition at all. So the databases are
 * archived as they stand, once, and fetched rather than rebuilt.
 *
 * Where they go is a GitHub release on this same repo: 2 GB per asset, no LFS
 * quota, and `curl` is enough to read one off a public repo. What the repo
 * keeps is `snapshots.json` — the release tag and a SHA-256 per file — so a
 * restore can prove it got the same bytes the snapshot was made from.
 *
 * This is an accelerator and never a dependency. Nothing under `scripts/` or
 * any gate may learn about it; they answer from the pack's committed content,
 * which is the arrangement `scripts/lib/reference.mjs` exists to preserve.
 *
 * Plain `node`, and it resolves `--pack` itself rather than importing
 * `scripts/lib/pack.mjs`: this is the script you run on a machine where the
 * workspace has not been installed yet, so it must not need `tsx` or
 * `@lang-tutor/core`.
 *
 * `pack` needs the `zstd` binary (`brew install zstd`, `apt install zstd`).
 * `restore` does not — Node decompresses zstd itself.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createZstdDecompress } from "node:zlib";

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const MANIFEST = join(REPO, "scripts", "reference", "snapshots.json");
const CACHE = join(REPO, ".cache", "snapshots");

const argv = process.argv.slice(2);
const command = argv[0];
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (name) => argv.includes(name);

/** The same resolution order as `scripts/lib/pack.mjs`, without its imports. */
function packDir() {
  const explicit = opt("--pack");
  if (explicit) return resolve(REPO, explicit);
  const named = opt("--language") ?? process.env.LANG_PACK ?? "latin";
  return join(REPO, "languages", named);
}

/** The two databases, plus the corpus the frequency list was counted from. */
const DATABASES = ["dictionary.db", "frequencies.db"];
const TEXTS = "texts";

function die(message) {
  console.error(message);
  process.exit(1);
}

function sha256(path) {
  const hash = createHash("sha256");
  const fd = createReadStream(path);
  return new Promise((ok, fail) => {
    fd.on("data", (chunk) => hash.update(chunk));
    fd.on("error", fail);
    fd.on("end", () => ok(hash.digest("hex")));
  });
}

function mb(bytes) {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

function loadManifest() {
  if (!existsSync(MANIFEST)) return { tag: null, packs: {} };
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

/** The repo the release lives on, read off the git remote rather than fixed. */
function originSlug() {
  const out = spawnSync("git", ["-C", REPO, "remote", "get-url", "origin"], {
    encoding: "utf8",
  });
  const url = out.status === 0 ? out.stdout.trim() : "";
  const m = url.match(/github\.com[:/]+(.+?)(?:\.git)?$/);
  return m ? m[1] : null;
}

/** Whatever `meta` the ingest recorded — the provenance worth writing down. */
function readMeta(path) {
  try {
    const db = new DatabaseSync(path, { readOnly: true });
    const rows = db.prepare("select key, value from meta").all();
    db.close();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------- pack

/**
 * What each pack's databases are derived from, and so what publishing one
 * obliges. `licence` names a file under `licences/` that travels inside the
 * archive: a pointer is enough for CC BY-SA, but the GPL asks for its text to
 * accompany the thing conveyed, and the archive is the thing conveyed.
 */
const ATTRIBUTION = {
  latin: {
    notice: [
      "dictionary.db derives from kaikki.org's machine-readable extract of the",
      "English Wiktionary. Wiktionary's text is CC BY-SA 4.0; this database and",
      "anything built from it carry the same terms and the same attribution.",
      "https://kaikki.org/  https://en.wiktionary.org/",
    ],
  },
  "ancient-greek": {
    notice: [
      "dictionary.db derives from the lexical data shipped with Eulexis_off_line",
      "(PhVerkerk/Eulexis_off_line), which is GPLv3, over a Morpheus-derived",
      "analysis table. This database is a derived work under those terms, and",
      "LICENSE.GPLv3 beside it is that licence. The source it was built from is",
      "that repository, and scripts/reference/ingest_dictionary_greek.py in this",
      "one.",
      "https://github.com/PhVerkerk/Eulexis_off_line",
    ],
    licence: { file: "GPL-3.0.txt", as: "LICENSE.GPLv3" },
  },
};

function provenance(packId, refDir, members) {
  const width = Math.max(...members.map((m) => m.name.length));
  const lines = [
    `Reference snapshot — ${packId}`,
    "",
    "Built by scripts/reference/snapshot.mjs from the databases that",
    "scripts/reference/ingest_*.py produced, and that the pack's committed",
    "content/ was generated out of. The databases are VACUUMed copies; nothing",
    "else about them was changed.",
    "",
    "Contents",
    ...members.map((m) => `  ${m.name.padEnd(width)} ${String(m.bytes).padStart(12)}  ${m.sha256}`),
    "",
  ];
  for (const db of DATABASES) {
    const meta = readMeta(join(refDir, db));
    if (Object.keys(meta).length === 0) continue;
    lines.push(`${db} meta`);
    for (const [k, v] of Object.entries(meta)) lines.push(`  ${k} = ${v}`);
    lines.push("");
  }
  const attribution = ATTRIBUTION[packId];
  lines.push("Attribution and licence");
  if (attribution) lines.push(...attribution.notice.map((l) => `  ${l}`));
  else
    lines.push(
      "  Unrecorded for this pack. Add it to ATTRIBUTION in snapshot.mjs before",
      "  publishing the asset: a snapshot is redistribution.",
    );
  lines.push("");
  return lines.join("\n");
}

async function doPack() {
  const dir = packDir();
  const packId = basename(dir);
  const refDir = join(dir, "reference");
  const outDir = resolve(REPO, opt("--out") ?? join(".cache", "snapshots", "out"));
  const tag = opt("--tag") ?? `reference-${new Date().toISOString().slice(0, 10)}`;

  if (!existsSync(join(refDir, "dictionary.db")))
    die(
      `No dictionary.db under ${refDir}.\n` +
        "There is nothing to snapshot until it is built; see scripts/reference/README.md.",
    );
  if (spawnSync("zstd", ["--version"], { stdio: "ignore" }).status !== 0)
    die("`zstd` is not installed. brew install zstd / apt install zstd.");

  const staging = join(outDir, `${packId}-staging`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  // VACUUM INTO rather than a copy: it writes the same database without the
  // free pages an incremental build leaves behind, and never touches the
  // original. Anything derived — the FTS index, the three form indexes — stays,
  // because the point of a snapshot is that it *is* the file, not a rebuild of
  // one that ought to come out the same.
  for (const db of DATABASES) {
    const src = join(refDir, db);
    if (!existsSync(src)) {
      console.warn(`  (no ${db}; skipping)`);
      continue;
    }
    process.stdout.write(`  vacuuming ${db}… `);
    const handle = new DatabaseSync(src, { readOnly: true });
    handle.exec(`VACUUM INTO '${join(staging, db).replaceAll("'", "''")}'`);
    handle.close();
    console.log(mb(statSync(join(staging, db)).size));
  }
  if (existsSync(join(refDir, TEXTS))) {
    cpSync(join(refDir, TEXTS), join(staging, TEXTS), { recursive: true });
    const n = readdirSync(join(staging, TEXTS)).length;
    console.log(`  ${TEXTS}/: ${n} file${n === 1 ? "" : "s"}`);
  }

  const licence = ATTRIBUTION[packId]?.licence;
  if (licence) {
    const src = join(REPO, "scripts", "reference", "licences", licence.file);
    if (!existsSync(src))
      die(
        `${packId} must ship ${licence.file} and it is not in scripts/reference/licences/.\n` +
          "Refusing to build an archive that cannot legally be published.",
      );
    cpSync(src, join(staging, licence.as));
    console.log(`  ${licence.as}: ${licence.file}`);
  }

  const members = [];
  for (const name of walk(staging)) {
    const path = join(staging, name);
    members.push({ name, bytes: statSync(path).size, sha256: await sha256(path) });
  }
  writeFileSync(join(staging, "PROVENANCE.txt"), provenance(packId, refDir, members));
  members.push({
    name: "PROVENANCE.txt",
    bytes: statSync(join(staging, "PROVENANCE.txt")).size,
    sha256: await sha256(join(staging, "PROVENANCE.txt")),
  });

  const asset = `${packId}-reference.tar.zst`;
  const assetPath = join(outDir, asset);
  process.stdout.write(`  compressing → ${asset}… `);
  await tarZstd(staging, assetPath);
  const bytes = statSync(assetPath).size;
  console.log(mb(bytes));
  rmSync(staging, { recursive: true, force: true });

  const manifest = loadManifest();
  if (manifest.tag && manifest.tag !== tag)
    console.warn(
      `\n  note: the manifest currently points at ${manifest.tag}; writing ${tag}.\n` +
        "  Re-snapshot the other packs against this tag too, or the release will be half old.",
    );
  manifest.tag = tag;
  manifest.packs[packId] = { asset, bytes, sha256: await sha256(assetPath), members };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  const notes = join(outDir, "RELEASE_NOTES.md");
  writeFileSync(notes, releaseNotes(manifest));
  const slug = originSlug() ?? "<owner>/<repo>";
  console.log(
    [
      "",
      `Wrote ${assetPath}`,
      `and recorded it in scripts/reference/snapshots.json under ${tag}.`,
      "",
      "Publishing it is a separate, deliberate step — a release asset on a public",
      "repo is redistribution, so read PROVENANCE.txt's licence note first:",
      "",
      `  gh release create ${tag} --repo ${slug} --title "${tag}" --notes-file ${notes}`,
      `  gh release upload ${tag} --repo ${slug} ${join(outDir, "*.tar.zst")}`,
      "",
      "Then commit snapshots.json. A later snapshot gets a new tag; releases that",
      "an older commit's manifest points at are never rewritten.",
    ].join("\n"),
  );
}

/**
 * Notes for the release, rewritten from the whole manifest on every `pack` so
 * that whichever pack you archive last describes all of them. The checksums are
 * here as well as in `snapshots.json` because a release should say what it is
 * to somebody who found it without the repo.
 */
function releaseNotes(manifest) {
  const lines = [
    `# Reference databases — ${manifest.tag}`,
    "",
    "The reference each language pack was built from: a dictionary of every",
    "inflected form, the frequency database behind the committed",
    "`reference/frequency.tsv.gz`, and the corpus that was counted to make it.",
    "",
    "**You do not need these to work on the repo.** Every gate, both reports and",
    "the question generator answer from what each pack already ships. They are",
    "needed to add a language or to rebuild a pack's citations, and they are here",
    "rather than rebuilt because kaikki.org regenerates its dumps: a rebuild is a",
    "different file, and the packs' committed content came from these.",
    "",
    "```",
    "node scripts/reference/snapshot.mjs restore --pack languages/<id>",
    "```",
    "",
    "which checks what it downloads against `scripts/reference/snapshots.json` on",
    "the commit you are standing on. Unpack one by hand with `zstd -dc … | tar -x`",
    "if you would rather; each carries a `PROVENANCE.txt` with its own checksums,",
    "the ingest's own record of what it read, and the licence it comes under —",
    "CC BY-SA 4.0 for the Wiktionary-derived packs, GPLv3 for Ancient Greek, whose",
    "data comes from Eulexis_off_line.",
    "",
    "| asset | size | sha256 |",
    "|---|---|---|",
  ];
  for (const [packId, entry] of Object.entries(manifest.packs))
    lines.push(`| \`${entry.asset}\` (${packId}) | ${mb(entry.bytes)} | \`${entry.sha256}\` |`);
  lines.push("");
  return lines.join("\n");
}

function walk(root, prefix = "") {
  const out = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...walk(root, rel));
    else out.push(rel);
  }
  return out.sort();
}

/**
 * `tar -cf - . | zstd -19 --long=27`. Piped rather than `tar --zstd` because
 * macOS's bsdtar and GNU tar disagree about that flag; both are happy to write
 * an archive to a pipe. --long=27 asks for a 128 MB window, which is the
 * largest a default `zstd -d` will accept without being told to.
 */
function tarZstd(staging, out) {
  return new Promise((ok, fail) => {
    const tar = spawn("tar", ["-cf", "-", "-C", staging, "."], { stdio: ["ignore", "pipe", "inherit"] });
    const zstd = spawn("zstd", ["-19", "--long=27", "-T0", "-q", "-f", "-o", out], {
      stdio: [tar.stdout, "inherit", "inherit"],
    });
    let failed = null;
    tar.on("error", fail);
    zstd.on("error", fail);
    tar.on("exit", (code) => {
      if (code !== 0) failed = `tar exited ${code}`;
    });
    zstd.on("exit", (code) => {
      if (code !== 0) return fail(new Error(`zstd exited ${code}`));
      if (failed) return fail(new Error(failed));
      ok();
    });
  });
}

// ------------------------------------------------------------- restore

async function doRestore() {
  const dir = packDir();
  const packId = basename(dir);
  const refDir = join(dir, "reference");
  const manifest = loadManifest();
  const entry = manifest.packs[packId];
  if (!entry)
    die(
      `snapshots.json has no entry for ${packId}.\n` +
        "Either no snapshot was ever published for this pack, or you are on a commit\n" +
        "from before it was. Build the reference instead: scripts/reference/README.md.",
    );
  const tag = opt("--tag") ?? manifest.tag;

  const existing = DATABASES.filter((db) => existsSync(join(refDir, db)));
  if (existing.length > 0 && !flag("--force"))
    die(
      `${refDir} already has ${existing.join(", ")}.\n` +
        "Pass --force to overwrite, or `verify` to check what is there against the manifest.",
    );

  const assetPath = opt("--from") ?? (await fetchAsset(tag, entry.asset));
  process.stdout.write(`  checking ${basename(assetPath)}… `);
  const got = await sha256(assetPath);
  if (got !== entry.sha256)
    die(
      `\nSHA-256 mismatch.\n  expected ${entry.sha256}\n  got      ${got}\n` +
        "Refusing to unpack it. Delete the download and try again; if it keeps\n" +
        "failing, the release asset is not the one this commit's manifest describes.",
    );
  console.log("ok");

  mkdirSync(refDir, { recursive: true });
  process.stdout.write(`  unpacking into ${refDir}… `);
  await unZstdTar(assetPath, refDir);
  console.log("done");

  const bad = await verifyMembers(refDir, entry);
  if (bad.length > 0) die(`\nUnpacked files do not match the manifest: ${bad.join(", ")}`);
  console.log(`  ${entry.members.length} files, all matching the manifest.`);

  console.log(
    [
      "",
      "The reference is a build input, so prove it is the right one before you",
      "build anything on it — both of these already exist and both are cheap:",
      "",
      `  node --import tsx scripts/make-reference.mjs --pack languages/${packId} \\`,
      `    --ref languages/${packId}/reference --check`,
      `  node --import tsx scripts/validate-pack.mjs --pack languages/${packId} \\`,
      `    --ref languages/${packId}/reference --require-ref --profile-only`,
      "",
      "The first says the restored databases still produce the frequency list the",
      "repo committed; the second is gate D2, that the fold agrees with them.",
    ].join("\n"),
  );
}

/** From `--from`, else the cache, else the release. */
async function fetchAsset(tag, asset) {
  if (!tag) die("No release tag: pass --tag, or snapshots.json is missing one.");
  const cached = join(CACHE, tag, asset);
  if (existsSync(cached)) {
    console.log(`  using cached ${cached}`);
    return cached;
  }
  const slug = originSlug();
  if (!slug) die("Cannot tell which GitHub repo this is; pass --from <file>.");
  mkdirSync(dirname(cached), { recursive: true });

  const url = `https://github.com/${slug}/releases/download/${tag}/${asset}`;
  console.log(`  downloading ${asset} from ${tag}…`);
  const gh = spawnSync("gh", ["--version"], { stdio: "ignore" }).status === 0;
  const run = gh
    ? spawnSync(
        "gh",
        ["release", "download", tag, "--repo", slug, "--pattern", asset, "--dir", dirname(cached), "--clobber"],
        { stdio: "inherit" },
      )
    : spawnSync("curl", ["-fL", "--progress-bar", "-o", cached, url], { stdio: "inherit" });
  if (run.status !== 0)
    die(
      `Download failed.\n  ${url}\n` +
        "If the release is not public, authenticate with `gh auth login`, or fetch it\n" +
        "by hand and pass --from <file>.",
    );
  return cached;
}

/**
 * `zstd -d | tar -x`, with the decompression done in Node so that restoring on
 * a fresh machine needs nothing installed. `tar` is everywhere; `zstd` is not.
 */
async function unZstdTar(assetPath, into) {
  const tar = spawn("tar", ["-xf", "-", "-C", into], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, fail) => {
    tar.on("error", fail);
    tar.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`tar exited ${code}`))));
  });
  await pipeline(createReadStream(assetPath), createZstdDecompress(), tar.stdin);
  await done;
}

// -------------------------------------------------------------- verify

async function verifyMembers(refDir, entry) {
  const bad = [];
  for (const member of entry.members) {
    const path = join(refDir, member.name);
    if (!existsSync(path)) {
      bad.push(`${member.name} (missing)`);
      continue;
    }
    if ((await sha256(path)) !== member.sha256) bad.push(`${member.name} (differs)`);
  }
  return bad;
}

async function doVerify() {
  const dir = packDir();
  const packId = basename(dir);
  const manifest = loadManifest();
  const entry = manifest.packs[packId];
  if (!entry) die(`snapshots.json has no entry for ${packId}.`);
  const bad = await verifyMembers(join(dir, "reference"), entry);
  if (bad.length === 0) {
    console.log(`${packId}: matches ${manifest.tag} (${entry.members.length} files).`);
    return;
  }
  console.error(`${packId}: does not match ${manifest.tag} — ${bad.join(", ")}`);
  console.error(
    "A VACUUMed snapshot is not byte-identical to a database that has been written\n" +
      "to since, so this is expected if you rebuilt or edited the reference locally.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------- main

const commands = { pack: doPack, restore: doRestore, verify: doVerify };
if (!commands[command]) {
  console.error(
    [
      "usage: node scripts/reference/snapshot.mjs <pack|restore|verify> --pack languages/<id>",
      "",
      "  pack     archive this pack's reference into one .tar.zst and record it",
      "           in snapshots.json. --tag <tag> --out <dir>",
      "  restore  fetch that archive off the release, check it, unpack it.",
      "           --tag <tag> --from <file> --force",
      "  verify   hash what is on disk against snapshots.json.",
    ].join("\n"),
  );
  process.exit(1);
}
await commands[command]();
