let initialized = false;

export function initSync() {
	initialized = true;
}

export class Rewriter {
	constructor() {
		if (!initialized) {
			throw new Error("Scramjet rewriter WASM is not initialized");
		}
		throw new Error("Scramjet rewriter bindings were not generated during the build");
	}
}
