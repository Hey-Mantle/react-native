import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    alias: {
      "react-native-iap": new URL(
        "./src/__mocks__/react-native-iap.ts",
        import.meta.url
      ).pathname,
    },
  },
});
