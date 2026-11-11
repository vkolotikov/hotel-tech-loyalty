// Metro for the members' app. It also reads the member portal's words and framework-free logic
// (frontend/src/portal, through src/shared/portal.ts and src/lib/i18n/portalBundles.ts), so the app and the portal never
// disagree. A package a shared portal file imports (`i18next`, for one) resolves as if the app itself imported it:
// from this app's own node_modules, never the web frontend's copy — which would be a second i18next instance, and
// which does not exist on an EAS build machine at all.
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const portalRoot = path.resolve(projectRoot, '../../frontend/src/portal')
const config = getDefaultConfig(projectRoot)

config.watchFolders = [portalRoot]

const isBare = name => !name.startsWith('.') && !name.startsWith('/')
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (isBare(moduleName) && context.originModulePath.startsWith(portalRoot + path.sep)) {
    return context.resolveRequest({ ...context, originModulePath: path.join(projectRoot, 'index.js') }, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
