const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const fs = require("fs");
const path = require("path");

const config = getDefaultConfig(__dirname);

const defaultResolveRequest = config.resolver.resolveRequest;
const zustandMiddleware = path.join(__dirname, "node_modules", "zustand", "middleware.js");

function resolveNestedTslib(originModulePath) {
  let current = path.dirname(originModulePath);
  const root = path.parse(current).root;

  while (current !== root) {
    const candidate = path.join(current, "node_modules", "tslib", "tslib.es6.js");
    if (fs.existsSync(candidate)) return candidate;
    current = path.dirname(current);
  }

  return null;
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "zustand/middleware") {
    return { type: "sourceFile", filePath: zustandMiddleware };
  }

  if (moduleName === "tslib") {
    const nestedTslib = resolveNestedTslib(context.originModulePath);
    if (nestedTslib) return { type: "sourceFile", filePath: nestedTslib };
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./src/global.css" });
