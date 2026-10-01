# Asset Prompter

A local app for the hand-off between an AI agent that needs images or video and the person who generates them by hand.

The agent writes prompt files into a project folder. You see them as a feed in the browser, copy each prompt into the generator, and drop the result back onto the card. Every result then goes to the agent: it reviews it from the same folder and either approves it or writes the next version. You confirm what it approves, or send a change request. When you are done with a batch, press Notify agent (or tell the agent "done") and it picks up every slot where it is its turn.

## Install

You need nothing installed beforehand. Download this folder (on GitHub: Code → Download ZIP, then unzip it, or `git clone`), then run setup once:

- **Windows 10/11:** double-click `setup.bat`.
- **Linux:** open a terminal in the folder and run `sh setup.sh`. It asks for your password to install ffmpeg.

Setup installs what is missing and skips what you already have, so it is safe to run again:

1. [Bun](https://bun.sh), which runs the app.
2. ffmpeg. The app works without it, but with it every dropped video gets frame sheets, a motion map, a first/last frame comparison and per-second motion numbers for the agent, and every result is checked against the length and aspect ratio its prompt asked for.
3. The app's packages.
4. An "Asset Prompter" icon: Desktop and Start menu on Windows, app menu and Desktop on Linux.

Then it starts the app in your browser at http://127.0.0.1:4777. It is reachable from this machine only.

From then on, start it with the icon. The icon starts the server in the background, or just opens the browser if it is already running. If you move the folder, run setup again to fix the icon.

To use it with an agent, open a project, press **Copy agent instructions** and paste it into a new chat with your agent. That is the only message the agent needs; after each batch you generate, press **Notify agent**.

### Let your agent install it

Paste this into a chat with a coding agent that can run commands (Claude Code, for example):

```
Install Asset Prompter for me: follow https://github.com/Djordje1998/asset-prompter/blob/master/AGENT-INSTALL.md
```

### Without setup

With Bun (and ideally ffmpeg) installed yourself:

```
bun install
bun start
```

Or double-click `start.bat` (Windows) or `start.sh` (Linux), which runs it with a console window.

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
