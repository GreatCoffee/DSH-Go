# @deepseek-ai/dsh-go-maintenance

English | [中文](README.zh.md)

<p align="center"><b>DSH-Go storage maintenance: clear the leftovers a deleted Session can leave behind.</b></p>

## Summary

A Settings section that counts and clears three kinds of residue: checkpoint records no stored Session names, session log directories no header names, and image attachments no surviving Session log mentions. Everything runs on request — a boot-time sweep would cost more the longer an installation lives, so the page's buttons drive the two Host Remotes (`goMaintenance.scan`, `goMaintenance.clean`).

Nothing is guessed. A category whose truth cannot be established stays empty: an unreadable Session log, or a persistence backend that keeps no directory, reports no orphan rather than freeing data another Session may still need.

## Use this package

Open **Settings → Maintenance**, press **Scan**, then clear one row or everything. Each row shows what a clear would reclaim; clearing rescans so the numbers match the disk.

The page ships with the DSH-Go portable build. Like every bundle in the installation, it can be switched off in the plugin manager, and switching it back on needs no restart of the Host.

## Understand the implementation

<details>
<summary>How the three categories are found</summary>

- Projections: the checkpoint table lives in the `session_projcache` domain, which the caching service keeps open for its whole life. The facility allows one open per domain, so this package asks that service — `orphanIds(known)` and `pruneOrphans(known)` — instead of opening the table itself.
- Session directories: `SessionPersistence.root` names the directory a backend writes under. A directory is an orphan when no listed header names it, whether it is spelled `session-<id>` (current) or `<id>` (older builds).
- Attachments: image objects are content-addressed (`sha256:<hex>`). Every listed Session log is read page by page and mined for digests; an object is an orphan when no log mentions its digest. A log that fails to read aborts the attachment scan for that call, because an unprovable reference must keep the blob.

</details>

## Model Experience

The maintenance page is a Settings section; no tool and no prompt text belongs to it. The model sees the section only if the user opens it.

## Known Limitations and Deferred Work

- Attachments only cover image objects under `attachments/v1/objects`. File blobs (`files/`, `file-objects/`) and request-image caches are not scanned yet: their manifests carry the referencing name, so a blind directory sweep could free a file another Session still shows.
- Projection records are counted, not weighed; a cleared record frees no bytes the report can claim.
- The cost ledger keeps billing history for deleted Sessions on purpose, and nothing here touches it.

## Dev Note

Host half: a `TypertRemoteService` (`goMaintenance`) with `@Remote('scan')` and `@Remote('clean')`. Browser half: one `settings.section` contribution; it reaches the Host through the `goMaintenance` namespace mounted by `@deepseek-ai/dsh-api-remotes`.
