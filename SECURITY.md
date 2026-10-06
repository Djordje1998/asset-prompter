# Security

Asset Prompter is a local app. The server listens on 127.0.0.1 only, refuses requests whose `Host` or `Origin` is not the app's own address, asks for no account and stores everything in the project folders you choose. The two things that leave the machine are the interface's fonts, loaded from Google Fonts, and whatever you paste into your generator yourself.

If you find a way for a web page in the same browser to reach the server, for a project folder to make the app read or write outside it, or for an agent's file to run anything, please report it privately rather than in a public issue: open a [private vulnerability report](https://github.com/Djordje1998/asset-prompter/security/advisories/new) on GitHub. You will get an answer within a week.
