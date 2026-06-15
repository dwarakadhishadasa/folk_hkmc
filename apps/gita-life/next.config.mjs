import rootConfig from "../../next.config.mjs"

const nextConfig = {
  ...rootConfig,
  env: {
    ...rootConfig.env,
    PROGRAM_ID: "gita-life",
    NEXT_PUBLIC_PROGRAM_ID: "gita-life",
  },
}

export default nextConfig
