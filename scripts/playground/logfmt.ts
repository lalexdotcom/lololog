import { L } from "../../src/index";
import { demo, spinnerDemo } from "./demo";

L.format = "logfmt";
// The 5 s default would show a single heartbeat in this 6 s scenario.
L.spinnerInterval = 1000;
demo(L);
await spinnerDemo(L);
