// Phase 2, step 5 — link each pre-existing Birdhaus band to its Twin Scene
// counterpart by setting twin_scene_band_id (and synced_at) from the mapping
// file the import produced.
//
// DRY-RUN BY DEFAULT. Only `--confirm` performs the update. This is the one
// legitimate backfill of this migration — a one-time linkage of rows that
// already existed, not an ongoing pattern.
//
// Usage (from the Birdhaus repo root, with bands-id-mapping.json copied in):
//   node scripts/migrate/backfill-twin-scene-ids.mjs                    # dry-run
//   node scripts/migrate/backfill-twin-scene-ids.mjs --confirm          # real update
//   node scripts/migrate/backfill-twin-scene-ids.mjs --confirm --allow-unmapped
//   node scripts/migrate/backfill-twin-scene-ids.mjs --file=/abs/path/bands-id-mapping.json
//
// If any Birdhaus row has no entry in the mapping file (or vice versa), the
// script lists them and refuses to --confirm unless --allow-unmapped is passed
// — missing mappings are investigated, never silently skipped.

import fs from "node:fs";
import path from "node:path";
import { parseArgs, confirmTarget, connect, die } from "./_safety.mjs";

const { confirm, allowUnmapped, file } = parseArgs(process.argv);

const url = await confirmTarget({
  scriptName: "backfill-twin-scene-ids",
  mode: confirm ? "CONFIRM — WILL UPDATE bands.twin_scene_band_id" : "DRY-RUN (no writes)",
});

const mappingPath = file ? path.resolve(file) : path.join(process.cwd(), "bands-id-mapping.json");
if (!fs.existsSync(mappingPath)) {
  die(`mapping file not found: ${mappingPath}\n  Copy bands-id-mapping.json from the Twin Scene repo, or pass --file=<path>.`);
}

let mapping;
try {
  mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
} catch (err) {
  die(`could not parse ${mappingPath}: ${err.message}`);
}
if (!Array.isArray(mapping) || mapping.length === 0) {
  die(`${mappingPath} is empty or not a JSON array — refusing to proceed.`);
}
for (const m of mapping) {
  if (m.birdhaus_id === undefined || m.twin_scene_id === undefined) {
    die(`mapping entry missing birdhaus_id/twin_scene_id: ${JSON.stringify(m)}`);
  }
}
console.log(`\nLoaded ${mapping.length} mapping entries from ${mappingPath}`);

const sql = connect(url);

try {
  const byBirdhaus = new Map(mapping.map((m) => [String(m.birdhaus_id), m]));
  if (byBirdhaus.size !== mapping.length) {
    die("mapping file contains duplicate birdhaus_id entries — aborting.");
  }

  const bhRows = await sql`select id, name, twin_scene_band_id from bands order by id`;
  const bhIds = new Set(bhRows.map((r) => String(r.id)));

  // Two failure modes, both loud: Birdhaus rows with no mapping, and mapping
  // entries pointing at Birdhaus rows that no longer exist.
  const unmappedRows = bhRows.filter((r) => !byBirdhaus.has(String(r.id)));
  const orphanMappings = mapping.filter((m) => !bhIds.has(String(m.birdhaus_id)));

  console.log("\n================ AUDIT ================");
  console.log(`Birdhaus rows:        ${bhRows.length}`);
  console.log(`Mapping entries:      ${mapping.length}`);
  console.log(`Would update:         ${mapping.length - orphanMappings.length}`);
  console.log(`Unmapped BH rows:     ${unmappedRows.length}  (no mapping entry)`);
  console.log(`Orphan mappings:      ${orphanMappings.length}  (BH row gone)`);
  console.log(`Already linked:       ${bhRows.filter((r) => r.twin_scene_band_id !== null).length}`);

  if (unmappedRows.length) {
    console.log("\n-- Birdhaus rows with NO mapping (investigate, do not skip) --");
    for (const r of unmappedRows) console.log(`   id=${r.id} name=${JSON.stringify(r.name)}`);
  }
  if (orphanMappings.length) {
    console.log("\n-- mapping entries whose Birdhaus row is missing --");
    for (const m of orphanMappings) console.log(`   birdhaus_id=${m.birdhaus_id} -> twin_scene_id=${m.twin_scene_id}`);
  }
  console.log("======================================");

  if (!confirm) {
    console.log("\nDRY-RUN complete. No rows were updated.");
    console.log("Resolve any unmapped/orphan rows above, then re-run with --confirm.");
  } else {
    if ((unmappedRows.length || orphanMappings.length) && !allowUnmapped) {
      die(
        `Refusing to --confirm with ${unmappedRows.length} unmapped and ${orphanMappings.length} orphan rows.\n` +
          `  Investigate them. If they're genuinely expected, re-run with --confirm --allow-unmapped.`,
      );
    }

    const updated = await sql.begin(async (tx) => {
      let count = 0;
      for (const m of mapping) {
        if (!bhIds.has(String(m.birdhaus_id))) continue; // orphan, already reported
        const res = await tx`
          update bands
          set twin_scene_band_id = ${m.twin_scene_id}, synced_at = now()
          where id = ${m.birdhaus_id}
        `;
        if (res.count !== 1) {
          throw new Error(`expected to update exactly 1 row for birdhaus_id=${m.birdhaus_id}, got ${res.count}`);
        }
        count += 1;
      }
      return count;
    });

    const [{ n: nulls }] = await sql`select count(*)::int as n from bands where twin_scene_band_id is null`;
    console.log(`\nUpdated ${updated} rows.`);
    console.log(`bands with twin_scene_band_id still null: ${nulls}` + (nulls ? "  (expected only if --allow-unmapped)" : ""));
  }
} finally {
  await sql.end();
}
