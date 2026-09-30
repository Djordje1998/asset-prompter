# Asset Prompter

A local app for the hand-off between an AI agent that needs images or video and the person who generates them by hand.

The agent writes prompt files into a project folder. You see them as a feed in the browser, copy each prompt into the generator, and drop the result back onto the card. The agent then reads the result from the same folder and, if needed, writes the next version.

## Run

Requires [Bun](https://bun.sh). `ffmpeg` is optional: with it, every dropped video gets frame sheets an agent can review.

```
bun install
bun start
```

Or double-click `start.sh` (Linux) or `start.bat` (Windows). The app opens at http://127.0.0.1:4777 and is reachable from this machine only.

## How it is organised

- A **project** is a folder. By default projects live in `projects/`; you can also add a folder from anywhere, such as one inside a repo your agent works in.
- A **slot** is a subfolder: one asset you need.
- A **version** is a prompt file (`v1.md`, `v2.md`, …) plus a folder of results (`v1/`).

The folder is the only source of truth. There is no database. The exact file layout and the rules agents follow are in the `HOW-TO-USE.md` that the app writes into every project; "Copy agent instructions" in the top bar gives you a message that points an agent at it.

## Settings

- `config.json` (created on first run): port, projects folder, added external folders, whether to open the browser.
- `presets/*.md`: the models and settings each generator offers. They feed `HOW-TO-USE.md` and the warnings on cards. Edit `presets/google-flow.md` when Flow changes.

## Tests

```
bun test
```
