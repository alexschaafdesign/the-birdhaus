// Phase 2, step 1 — export Birdhaus's canonical bands to a local JSON file.
//
// READ-ONLY against Birdhaus's DB: it only writes a local file, never the
// database, so there's no --confirm flag. It still confirms the target host,
// per the phase's safety rules.
//
// Usage (from the Birdhaus repo root):
//   node scripts/migrate/export-birdhaus-bands.mjs
//
// Output: ./bands-export.json (gitignored). Copy it into the Twin Scene repo
// root before running the import.

import fs from "node:fs";
import path from "node:path";
import { confirmTarget, connect, die } from "./_safety.mjs";

const url = await confirmTarget({
  scriptName: "export-birdhaus-bands",
  mode: "READ-ONLY (exports to a local file; never writes the DB)",
});

const sql = connect(url);
try {
  // All rows, all columns — the export is the raw source of truth for the
  // import step, which decides what to keep.
  const rows = await sql`select * from bands order by id`;
  if (rows.length === 0) {
    die("bands table is empty — refusing to write an empty export.");
  }

  const outPath = path.join(process.cwd(), "bands-export.json");
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2) + "\n");

  console.log(`\nExported ${rows.length} bands → ${outPath}`);
  console.log("\n--- 3 sample rows ---");
  for (const row of rows.slice(0, 3)) {
    console.log(JSON.stringify(row));
  }
  console.log("\nNext: copy bands-export.json into the Twin Scene repo root, then run");
  console.log("      node scripts/migrate/import-bands-to-twinscene.mjs   (dry-run first)");
} finally {
  await sql.end();
}
