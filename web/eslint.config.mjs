import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    // Generated from docs/api/ (npm run api:gen) and build output: not linted.
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "src/api/**"],
  },
];

export default config;
