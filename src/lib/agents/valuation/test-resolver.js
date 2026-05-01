import { resolve as pathResolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

const ROOT = pathResolve(process.cwd(), "src");

export function resolve(specifier, context, nextResolve) {
  // Map @/ to ./src/
  if (specifier.startsWith("@/")) {
    const bare = pathResolve(ROOT, specifier.slice(2));
    const withJs = bare + ".js";
    const indexJs = pathResolve(bare, "index.js");
    const resolved = existsSync(withJs) ? withJs : existsSync(indexJs) ? indexJs : bare;
    return nextResolve(pathToFileURL(resolved).href, context);
  }
  // server-only is a no-op outside Next.js
  if (specifier === "server-only") {
    return { shortCircuit: true, url: "data:text/javascript," };
  }
  // Handle bare relative imports without .js extension
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (!specifier.endsWith(".js") && !specifier.endsWith(".json") && !specifier.endsWith(".mjs")) {
      const parent = context.parentURL ? new URL(context.parentURL).pathname.replace(/^\/([A-Z]:)/, "$1") : process.cwd();
      const dir = pathResolve(parent, "..");
      const bare = pathResolve(dir, specifier);
      const withJs = bare + ".js";
      if (existsSync(withJs)) {
        return nextResolve(pathToFileURL(withJs).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
