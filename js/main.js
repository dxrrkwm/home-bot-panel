import { tg } from "./tg.js";
import { on, listen } from "./bus.js";
import { $, toast } from "./ui.js";
import * as lamp from "./sections/lamp.js";
import * as laptop from "./sections/laptop.js";
import * as reminders from "./sections/reminders.js";
import * as power from "./sections/power.js";

// home screen cards, top to bottom; a new section is a new file here
const SECTIONS = [power, lamp, laptop, reminders];

tg.ready();
tg.expand();

const home = $("#home");
SECTIONS.forEach(s => s.mount(home));

on("reply", d => toast(d.text.split("\n")[0]));
listen();
