import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  // Path to the Next.js app, so next.config and .env files load in tests
  dir: "./",
});

const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // See jest/react-email-render.cjs: the real render needs a dynamic import.
    "^@react-email/render$": "<rootDir>/jest/react-email-render.cjs",
  },
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)"],
};

export default createJestConfig(customJestConfig);
