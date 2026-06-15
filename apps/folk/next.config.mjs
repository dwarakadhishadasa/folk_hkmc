import rootConfig from "../../next.config.mjs"

const nextConfig = {
  ...rootConfig,
  env: {
    ...rootConfig.env,
    PROGRAM_ID: "folk",
    NEXT_PUBLIC_PROGRAM_ID: "folk",
  },
}

export default nextConfig
