import { tg } from "./tg.js";
import { on, listen } from "./bus.js";
import { $, toast } from "./ui.js";
import * as finance from "./sections/finance.js";
import * as lamp from "./sections/lamp.js";
import * as power from "./sections/power.js";
import * as reminders from "./sections/reminders.js";

// home screen cards, top to bottom: a glance and a tap into the screen, lamp is controlled right here
const SECTIONS = [power, lamp, finance, reminders];

tg.ready();
tg.expand();

const home = $("#home");
SECTIONS.forEach(s => s.mount(home));

on("reply", d => toast(d.text.split("\n")[0]));
listen();
