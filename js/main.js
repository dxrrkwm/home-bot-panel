import { tg } from "./tg.js";
import { onFailure, listen } from "./bus.js";
import { $, toast } from "./ui.js";
import * as finance from "./sections/finance.js";
import * as lamp from "./sections/lamp.js";
import * as power from "./sections/power.js";
import * as prices from "./sections/prices.js";
import * as reminders from "./sections/reminders.js";

// home screen cards, top to bottom: a glance and a tap into the screen, lamp is controlled right here
const SECTIONS = [power, lamp, finance, prices, reminders];

tg.ready();
tg.expand();

const home = $("#home");
SECTIONS.forEach(s => s.mount(home));

// a failed command or a bot that does not answer shows up as a red toast
onFailure(d => toast(d.text.split("\n")[0].replace(/^[^\p{L}\d]+/u, ""), true));
listen();
