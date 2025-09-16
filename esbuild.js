// esbuild.js
const { build } = require("esbuild");

const baseConfig = {
  bundle: true,
  minify: true,
  sourcemap: true,
};

const extensionConfig = {
  ...baseConfig,
  platform: "node",
  mainFields: ["module", "main"],
  format: "cjs",
  entryPoints: ["./client/src/extension.ts"],
  outfile: "./client/out/extension.js",
  external: ["vscode"],
};

const serverConfig = {
  ...baseConfig,
  platform: "node",
  format: "cjs",
  entryPoints: ["./server/src/server.ts"],
  outfile: "./server/out/server.js",
  external: ["vscode"],
};

(async () => {
  try {
    await build(extensionConfig);
    await build(serverConfig);
    console.log("build complete");
  } catch (err) {
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();
