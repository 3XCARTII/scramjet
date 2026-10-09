import { existsSync, mkdirSync, mkdtempSync, copyFileSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const wasmPath = join(root, "packages/core/dist/scramjet.wasm");

if (existsSync(wasmPath)) {
	process.exit(0);
}

const packageJson = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8"));
const temp = mkdtempSync(join(tmpdir(), "scramjet-wasm-"));
const archive = join(temp, "package.tgz");
const extractDir = join(temp, "package");

try {
	const metadata = await fetch(
		`https://registry.npmjs.org/@mercuryworkshop/scramjet/${packageJson.version}`
	);
	if (!metadata.ok) {
		throw new Error(`npm registry returned ${metadata.status}`);
	}
	const { dist } = await metadata.json();
	if (!dist?.tarball) throw new Error("published package has no tarball");

	const response = await fetch(dist.tarball);
	if (!response.ok || !response.body) {
		throw new Error(`failed to download published package (${response.status})`);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	writeFileSync(archive, buffer);
	execFileSync("tar", ["-xzf", archive, "-C", temp]);

	const publishedWasm = join(extractDir, "dist/scramjet.wasm");
	if (!existsSync(publishedWasm)) {
		throw new Error("published package does not contain dist/scramjet.wasm");
	}
	mkdirSync(resolve(wasmPath, ".."), { recursive: true });
	copyFileSync(publishedWasm, wasmPath);
	console.log(`Recovered scramjet.wasm from @mercuryworkshop/scramjet@${packageJson.version}`);
} finally {
	rmSync(temp, { recursive: true, force: true });
}

