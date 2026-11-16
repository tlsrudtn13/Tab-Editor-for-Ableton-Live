import * as esbuild from "esbuild";
import * as fs from "fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
// --dev: include the test harness (src/dev). Release builds leave it out.
const dev = process.argv.includes("--dev");

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  outfile: manifest.entry,
  bundle: true,
  format: "cjs",
  platform: "node",
  sourcesContent: false,
  logLevel: "info",
  // .html 파일을 문자열로 import 할 수 있게 설정
  loader: { ".html": "text" },
  define: { __TAB_DEV__: JSON.stringify(dev) },
});