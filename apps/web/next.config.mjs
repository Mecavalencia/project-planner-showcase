import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@planner/shared"],
  outputFileTracingRoot: path.resolve(process.cwd(), "../..")
};

export default nextConfig;
