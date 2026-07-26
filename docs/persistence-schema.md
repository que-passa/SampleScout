# Persistence schema

## Schema version

`SCHEMA_VERSION = 1` in `src/lib/persistence/paths.ts`.

Dexie database name: `samplescout`.

## IndexedDB tables

| Table         | Key  | Indexes                                                | Purpose                             |
| ------------- | ---- | ------------------------------------------------------ | ----------------------------------- |
| `sessions`    | `id` | `status`, `updatedAt`                                  | Capture sessions                    |
| `takes`       | `id` | `sessionId`, `sequence`, `lifecycleState`, `updatedAt` | Take metadata + recipe              |
| `uploadJobs`  | `id` | `takeId`, `state`, `updatedAt`                         | Persistent upload queue             |
| `cleanupJobs` | `id` | `deleteAfter`                                          | Deferred OPFS deletes after Undo    |
| `settings`    | `id` | —                                                      | App preferences (`id = 'settings'`) |

Migrations must be additive. Use `runMigrations()` as the bump hook.

## Collection identity does not change schema

The UI label **Collection** maps to the existing `/drafts` view, and **Field Session** maps to `sessions`. **Field Notes** labels the existing take metadata/details surface; do not add a `notes` column or field. A deterministic specimen mark is computed from already-persisted take/source facts and is not a waveform, fingerprint, score, or new persisted asset.

## OPFS layout

```text
/sessions/{sessionId}/takes/{takeId}/source.bin
/sessions/{sessionId}/takes/{takeId}/peaks-v1.bin
/sessions/{sessionId}/takes/{takeId}/rendered-{hash}.wav
/sessions/{sessionId}/takes/{takeId}/rendered-{hash}.mp3
/trash/{cleanupId}/...
```

Paths are relative to the OPFS root returned by `navigator.storage.getDirectory()`.

### `peaks-v1.bin` (PKS1)

Little-endian header (16 bytes) then planar Float32 min/max pairs:

| Offset | Field          | Type                                 |
| ------ | -------------- | ------------------------------------ |
| 0      | magic `PKS1`   | uint32                               |
| 4      | format version | uint16 (`1`)                         |
| 6      | channels       | uint16                               |
| 8      | peakCount      | uint32                               |
| 12     | framesPerPeak  | uint32                               |
| 16…    | peak data      | Float32 planar `[ch][peak][min,max]` |

Metadata for the asset is stored on `Take.peaks` in IndexedDB.

## Saved-locally rule

A take may show **Local Draft** (supporting copy: “Saved on this device”) only when:

1. Source binary is flushed to OPFS
2. Take metadata record is written to IndexedDB
3. `lifecycleState === 'saved'`

**Extract** creates another take that reuses an existing OPFS `source.fileRef` (no second write). The Local Draft gate is the IndexedDB commit of the new take. Optional `derivedFromTakeId` records lineage. Cleanup must not delete a `fileRef` while any non-deleted take still references it (see ADR 0003).

## Delete all local data

`deleteAllLocalData()` clears Dexie tables and attempts recursive OPFS wipe. Browser “Clear site data” also removes everything for the origin.
