import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose root is ./ui for the webview build.
export default defineConfig({
    test: {
        root: ".",
        include: ["src/**/*.test.ts", "ui/src/**/*.test.ts"],
    },
});
