import { L } from "../../src/index";
import { demo, spinnerDemo } from "./demo";

if (!process.stdout.isTTY) console.error("stdout is not a TTY: run this directly in a terminal");
demo(L);
await spinnerDemo(L, () => {
	console.log("a direct console.log, not through lololog");
	process.stdout.write("a partial write… ");
	process.stdout.write("ended later\n");
});
