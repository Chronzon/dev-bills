import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: ["features/db/generated/**"],
  },
  ...nextVitals,
];

export default eslintConfig;
