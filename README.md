# home-bot-panel

Telegram Mini App for my home bot: power station and outages, lamp, finances, reminders.
Static page on GitHub Pages, no build step.

## How it works

- The bot runs on my laptop with long polling, there is no public server.
- The panel sends commands to a private [ntfy](https://ntfy.sh) topic, the bot listens to it.
- The bot sends answers back to `<topic>d`, encrypted with a key that exists only in the panel button url.

## Design

- Home is a column of cards. Each card shows the state at a glance (icon, title, one line, maybe a bar)
  and opens its own screen on tap. The lamp is the exception: it is used most, so its controls live on the card.
- One look everywhere: Telegram theme colors, pastel blue and pink accents, [Lucide](https://lucide.dev) icons
  from `js/icons.js`, cards 18px, controls 12px, switches and segmented controls instead of rows of buttons.
- Screens have a back button and, where data comes from the bot, a refresh button. Automatic refresh stays rare
  (power: every 30 s while open, finance: on open if the statement is older than 15 min).

## Structure

```
index.html            shell, loads css and js/main.js
css/base.css          design tokens and shared components: cards, card head, switch, segmented, chips, bars
css/finance.css       finance screens
css/power.css         power screen
css/prices.css        snack prices screen
js/main.js            entry point, list of home cards
js/icons.js           the icon set
js/tg.js              telegram webapp helpers
js/bus.js             transport: send commands, receive answers
js/seal.js            decrypts bot data
js/ui.js              dom helpers, card head, screens with back and refresh, toast
js/sections/*.js      one file per feature: power, lamp, finance, reminders, answer (bot text as is)
```

`sections/power.js`: is there power, station battery with input and output watts, AC / UPS / eco controls,
battery for 24 hours, outages for 7 days (what happened vs the schedule) and the upcoming schedule.
Data comes from the bot on request `station-panel` (`station-panel:force` skips the cache).
`sections/finance.js`: `fin-panel`, `fin-panel:force` also pulls a new monobank statement.
`sections/prices.js`: energy drinks 0.5 and bars at Silpo and Novus, cheapest first; `prices-panel`,
`prices-panel:force` checks the shops again.

A new feature is a new file in `js/sections/` with `mount(home)`, plus one line in `SECTIONS` in `main.js`.
Sections with their own screen create it with `screen(id, title, { refresh })` and open it with `open(id)`.

GitHub Pages and the Telegram webview cache files for 10 minutes. `index.html` adds `?v=<panel_version>`
(from the button url) to every css and js file through an import map, so after a change: bump `panel_version`
in the bot config and send the new keyboard. A new css or js file must be added to the lists in `index.html`.
