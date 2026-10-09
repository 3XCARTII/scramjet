import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { stdout } from "node:process";
import { execSync } from "node:child_process";
import http from "node:http";
import chalk from "chalk";
import { createServer } from "vite";
//@ts-expect-error no typedefs
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import {
  normalizeWebsocketUrl,
  warnOnUrlEscape,
  runRspack,
  black,
  printBanner,
} from "./devlib.ts";
import rspackConfig from "./rspack.config.ts";

const image = await fs.readFile("./assets/scramjet-mini-noalpha.png");

const commit = execSync("git rev-parse --short HEAD", {
  encoding: "utf-8",
}).replace(/\r?\n|\r/g, "");
const branch = execSync("git rev-parse --abbrev-ref HEAD", {
  encoding: "utf-8",
}).replace(/\r?\n|\r/g, "");
const packagejson = JSON.parse(await fs.readFile("./package.json", "utf-8"));
const version = packagejson.version;

const DEMO_PORT = process.env.DEMO_PORT || 4141;
const WISP_PORT = process.env.WISP_PORT || 4142;
const configuredWispUrl = process.env.VITE_WISP_URL
  ? normalizeWebsocketUrl(process.env.VITE_WISP_URL)
  : undefined;

// A loopback URL is only valid for the local dev server. Treat it as unset so
// the URL is updated when the Wisp server moves to an available port.
const hasExternalWispUrl = Boolean(
  configuredWispUrl &&
    !["localhost", "127.0.0.1", "::1"].includes(
      new URL(configuredWispUrl).hostname,
    ),
);

if (hasExternalWispUrl) {
  process.env.VITE_WISP_URL = configuredWispUrl;
} else {
  process.env.VITE_WISP_URL = `ws://localhost:${WISP_PORT}/`;
}

const wispserver = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("wisp server js rewrite");
});
wisp.options.allow_private_ips = true;
wisp.options.allow_loopback_ips = true;

wispserver.on("upgrade", (req, socket, head) => {
  wisp.routeRequest(req, socket, head);
});

const listenOnAvailablePort = async (
  server: typeof wispserver,
  requestedPort: number,
) => {
  let port = requestedPort;

  while (true) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };

        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port);
      });
      return port;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
        throw error;
      }
      port += 1;
    }
  }
};

const actualWispPort = await listenOnAvailablePort(
  wispserver,
  Number(WISP_PORT),
);
if (!hasExternalWispUrl) {
  process.env.VITE_WISP_URL = `ws://localhost:${actualWispPort}/`;
}

const server = await createServer({
  configFile: "./packages/demo/vite.config.ts",
  root: "./packages/demo",
  server: {
    // Let Vite move to the next available port when the preferred port is busy.
    port: Number(DEMO_PORT),
    strictPort: false,
  },
});

warnOnUrlEscape(server);

await server.listen();

const demoAddress = server.httpServer?.address();
const actualDemoPort =
  typeof demoAddress === "object" && demoAddress !== null
    ? demoAddress.port
    : Number(DEMO_PORT);

const accent = (text: string) => chalk.hex("#f1855bff").bold(text);
const highlight = (text: string) => chalk.hex("#fdd76cff").bold(text);
const urlColor = (text: string) => chalk.hex("#64DFDF").underline(text);
const note = (text: string) => chalk.hex("#CDB4DB")(text);
const connector = chalk.hex("#8D99AE").dim("@");

const lines = [
  black()(`${highlight("SCRAMJET DEV SERVER")}`),
  black()(
    `${accent("demo")} ${connector} ${urlColor(
      `http://localhost:${actualDemoPort}/`,
    )}`,
  ),
  black()(
    `${accent("wisp")} ${connector} ${urlColor(
      process.env.VITE_WISP_URL ?? "",
    )}`,
  ),
  black()(chalk.dim(`[${branch}] ${commit} scramjet/${version}`)),
];

runRspack(rspackConfig);

printBanner(image, lines);
