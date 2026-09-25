import { describeRuntime } from "lololog";

declare global {
	interface Window {
		__result?: string;
	}
}

window.__result = describeRuntime();
