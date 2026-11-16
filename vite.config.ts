// vite.config.ts
// Vite 빌드 설정: ui/ 폴더를 읽어서 dist-ui/index.html 로 단일 파일 출력
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";


export default defineConfig(({ mode }) => ({
  root: "ui",

  // `vite build --mode dev` turns on ui/src/devReporter.ts (test harness only)
  define: { __TAB_DEV__: JSON.stringify(mode === "dev") },

  build: {
    outDir: "../dist-ui",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000, // 폰트 포함 모든 에셋을 base64 인라인
    sourcemap: false,
  },

  resolve: {
    alias: {
      // @coderline/alphatab 의 exports 제한을 우회해서
      // dist/font/ 폴더에 직접 접근할 수 있게 alias 등록
      "@alphatab-font": path.resolve(
        "./node_modules/@coderline/alphatab/dist/font"
      ),
    },
  },

  plugins: [viteSingleFile()],
}));
