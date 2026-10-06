# Contributing

Thanks for helping. The most useful contributions, in order:

1. **A preset for a generator that is missing, or a fix to one that drifted.** Generators change their settings weekly. A preset is one file, `presets/<tool>.md`, with the tool's logo next to it. Copy an existing one, keep the same keys, and put the date you checked the tool's interface in `checked:`. `bun test` checks that every preset loads and that its modes are consistent.
2. **A bug report** with the version file (`vN.md`) that triggered it and what the app showed. Nothing in a project folder is secret to the app, so a small example folder is the best report.
3. **A pull request.** Keep it to one change. Run `bun test` before you open it, and say in the description what you did by hand in the app to check it.

## Running it from source

```
bun install
bun dev        # the server with hot reload, at http://127.0.0.1:4777
bun test       # the test suite
```

`src/server` is the Bun server, `src/web` the React app, `src/shared` the types both use. The README explains how a project folder is laid out; `HOW-TO-USE.md`, which the app writes into every project, is the contract the agent follows, and `src/server/howto.ts` is where it is written.

## Style

- Plain English in the interface and in the comments, in full sentences. The app explains itself; the comments explain why, not what.
- One idea per function, no abstraction before the second use.
- Folders and files are the only state. Do not add a database, a cache that outlives a restart, or a background job the folder cannot explain.

## Releasing

The version lives in `package.json` only; the app shows it in its footer and links it to the release on GitHub.

1. Add a `## <version> (<date>)` section at the top of `CHANGELOG.md` with what changed, and commit it.
2. Run `bun run release <version>`, for example `bun run release 0.2.0`. It checks the changelog has that section, writes the version into `package.json`, commits, tags `v<version>` and pushes the branch and the tag.
3. The Release workflow publishes the GitHub release for the tag, with the changelog section as its notes. Nothing else to fill in.
