# home-bot-panel

Telegram Mini App for my home bot (lamp, laptop power modes, power outage schedule, reminders, finances).
Static page on GitHub Pages, no build step.

## How it works

- The bot runs on my laptop with long polling, there is no public server.
- The panel sends commands to a private [ntfy](https://ntfy.sh) topic, the bot listens to it.
- The bot sends answers back to `<topic>d`, encrypted with a key that exists only in the panel button url.

## Structure

```
index.html            shell, loads css and js/main.js
css/base.css          theme, layout, buttons, inputs
css/finance.css       finance screens
js/main.js            entry point, list of home sections
js/tg.js              telegram webapp helpers
js/bus.js             transport: send commands, receive answers
js/seal.js            decrypts bot data
js/ui.js              dom helpers, toast, screen stack
js/sections/*.js      one file per feature
```

A new feature is a new file in `js/sections/` with `mount(home)`, plus one line in `SECTIONS` in `main.js`.
Sections that need their own screen create it with `screen(id, title)` and open it with `open(id)`.

GitHub Pages caches files for 10 minutes, so changes can show up with a delay.
