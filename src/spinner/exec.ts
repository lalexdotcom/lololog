import type { Spinner } from "./spinner";

export type Task<T> = (onProgress: Spinner["update"]) => PromiseLike<T>;

export async function exec<T>(spinner: Spinner, task: Task<T>): Promise<T> {
	let value: T;
	try {
		value = await task(spinner.update);
	} catch (error) {
		spinner.fail();
		throw error;
	}
	// Outside the try: a throw while rendering success() must not be mistaken for a task failure
	// and turn into a fail() line.
	spinner.success();
	return value;
}
