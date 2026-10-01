# Installing Asset Prompter (for agents)

The human asked you to install and start Asset Prompter on this machine. It is a local web app: the human generates images and video by hand, and you request and review them through a project folder. Do every step yourself; ask the human only where a step says so.

## 1. Get the folder

If you are not already inside it, clone the repository into a folder the human can find, such as their Desktop or home folder, and work from there:

```
git clone https://github.com/Djordje1998/asset-prompter.git
```

Without git, download https://github.com/Djordje1998/asset-prompter/archive/refs/heads/master.zip and unzip it.

## 2. Run setup

Setup installs whatever is missing (Bun, ffmpeg), installs the app's packages, puts an "Asset Prompter" icon on the Desktop and in the menu, and starts the app. It skips what is already installed.

- Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1`
- Linux: `sh setup.sh`. Installing ffmpeg uses sudo. If you cannot enter a password, tell the human to run `sh setup.sh` in a terminal themselves, and wait for them.

Read the output. If a step fails, fix that one thing and run setup again rather than working around it.

## 3. Check that it runs

```
curl -s http://127.0.0.1:4777/api/state
```

It returns JSON with `"ffmpeg": true` when ffmpeg was found. `false` means videos get no frame sheets; on Windows that usually clears after the human signs out and back in.

## 4. Hand over

Tell the human, in a few lines:

- the app is open at http://127.0.0.1:4777, and from now on they start it with the Asset Prompter icon;
- whether ffmpeg is working;
- to use it with an agent: open a project in the app, press Copy agent instructions, and paste that into the chat.

If you are also the agent who will request the assets, ask the human which project to use, or create one with a short name:

```
curl -s -X POST http://127.0.0.1:4777/api/projects -H "Content-Type: application/json" -d "{\"name\":\"my-project\"}"
```

Then read `projects/<name>/HOW-TO-USE.md` once and follow it.
