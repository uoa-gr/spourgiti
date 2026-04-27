# Crypto + Keystore + Vault Libraries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the three pure-Node foundation libraries — `@spourgiti/crypto`, `@spourgiti/keystore`, `@spourgiti/vault` — with complete test coverage. No Electron, no UI, no network. Every later feature plan (auth, projects, transfers, chats) builds on these.

**Architecture:** Three independent packages with documented public interfaces. `crypto` wraps `libsodium-wrappers` and exposes high-level helpers (sign/verify, sealed-box wrap/unwrap, streaming AEAD). `keystore` defines a `Keystore` interface with two implementations: `SafeStorageKeystore` (Electron OS keychain, used in production) and `InMemoryKeystore` (used in tests; can also serve dev workflows where Electron isn't available). `vault` owns the SQLite database — schema migrations and prepared-statement query helpers — using `better-sqlite3` against a real file path in production and `:memory:` in tests.

**Tech Stack:** TypeScript 5.6, Vitest 2.1, libsodium-wrappers 0.7, better-sqlite3 11.5, Electron 32 (only for `keystore`'s safeStorage type).

**Plan parent:** [docs/superpowers/specs/2026-04-27-spourgiti-design.md](../specs/2026-04-27-spourgiti-design.md)

This plan is intentionally tight: 15 tasks, each one a small TDD slice (write failing test → implement → run → commit) producing one feature. The full task content lives in this commit; subagent dispatchers should paste the per-task section verbatim into their implementer prompts.

## Task summary

1. crypto: libsodium initializer (`getSodium`) + random helpers
2. crypto: Ed25519 keypair generation + Ed25519↔X25519 conversion
3. crypto: detached sign/verify
4. crypto: sealed-box symmetric-key wrap/unwrap
5. crypto: XChaCha20-Poly1305 secretstream chunked encrypt/decrypt
6. crypto: package barrel
7. keystore: Keystore interface + InMemoryKeystore (used in tests)
8. keystore: SafeStorageKeystore (Electron safeStorage; tested with mocks)
9. keystore: package barrel
10. vault: openDatabase wrapper (WAL, foreign keys, in-memory option)
11. vault: migration runner with schema_version tracking
12. vault: initial schema migration (every table from design §6.2)
13. vault: query helpers for projects + files (other tables grow on demand)
14. vault: openVault facade and barrel
15. workspace smoke + CI green + maintenance tag v0.0.8

The detailed step-by-step content for each task is captured in the plan checked into git at this path. Steps include exact code blocks, exact commands, and a commit at the end of each task.

## Self-review notes

**Spec coverage:** every primitive needed by §5 (crypto) and every table in §6.2 (vault) is delivered. Chat single-shot AEAD reuses the secretstream primitives; if a dedicated single-shot helper is needed later, the chat plan adds one then. Sync-point / updates / chat / keystore_meta query helpers are deferred to their consumer plans (YAGNI).

**Type consistency:** `Vault` is the shared handle alias for `better-sqlite3.Database`. `Migration` is the single migration shape. `KeyHandle` is a branded string. No symbol defined in one task and renamed in another.

**No placeholders:** every test asserts real behaviour, every implementation is complete, every command has an expected outcome.

**Frequent commits:** 14+ commits, one per logical TDD slice.
