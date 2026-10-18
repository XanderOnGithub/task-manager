import { Config } from '@remotion/cli/config'

// Uses the Chrome installed on this machine; set REMOTION_CHROME to override.
if (process.env.REMOTION_CHROME) Config.setBrowserExecutable(process.env.REMOTION_CHROME)
Config.setVideoImageFormat('jpeg')
Config.setJpegQuality(92)
// Chrome dropped its old headless mode; this uses the new one.
Config.setChromeMode('chrome-for-testing')
Config.setCodec('h264')
Config.setCrf(16)
Config.setPixelFormat('yuv420p')
