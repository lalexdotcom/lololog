import { L } from "../../src/index";
import { demo } from "./demo";

if (!process.stdout.isTTY) console.error("stdout is not a TTY: run this directly in a terminal");
demo(L);
