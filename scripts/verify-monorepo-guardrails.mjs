import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const rootDir = process.cwd()
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
const ignoredDirs = new Set(["node_modules", ".next", ".turbo", "dist", "build", "coverage", "out"])
const shouldPrintGraph = process.argv.includes("--graph")

const serverOnlySpecifierPrefixes = [
  "@hkmc/airtable",
  "@hkmc/authz",
  "@hkmc/program-config/server",
  "@/lib/airtable",
  "@/lib/authz",
  "@/lib/invite-log",
  "@/lib/supabase/admin",
  "@/lib/supabase/server",
]

const allowedPackageExternalImports = new Map([
  ["packages/airtable/src/index.ts", new Set(["lib/airtable.ts"])],
  ["packages/authz/src/index.ts", new Set(["lib/authz.ts"])],
  ["packages/ui/src/button.tsx", new Set(["components/ui/button.tsx"])],
])

const requiredTurboTasks = {
  build: { dependsOn: "^build" },
  lint: { dependsOn: "^lint" },
  typecheck: { dependsOn: "^typecheck" },
}

const errors = []
const warnings = []
const errorSet = new Set()
const warningSet = new Set()
const fileInfoCache = new Map()

function toPosix(value) {
  return value.split(path.sep).join("/")
}

function rel(filePath) {
  return toPosix(path.relative(rootDir, filePath))
}

function fail(message) {
  if (errorSet.has(message)) {
    return
  }

  errorSet.add(message)
  errors.push(message)
}

function warn(message) {
  if (warningSet.has(message)) {
    return
  }

  warningSet.add(message)
  warnings.push(message)
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"))
}

function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
}

function dirExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
}

function resolveFile(basePath) {
  if (fileExists(basePath)) {
    return path.normalize(basePath)
  }

  if (!path.extname(basePath)) {
    for (const extension of sourceExtensions) {
      const candidate = `${basePath}${extension}`
      if (fileExists(candidate)) {
        return path.normalize(candidate)
      }
    }
  }

  if (dirExists(basePath)) {
    for (const extension of sourceExtensions) {
      const candidate = path.join(basePath, `index${extension}`)
      if (fileExists(candidate)) {
        return path.normalize(candidate)
      }
    }
  }

  return null
}

function discoverWorkspaceProjects() {
  const projects = []

  for (const workspaceRoot of ["apps", "packages"]) {
    const absoluteWorkspaceRoot = path.join(rootDir, workspaceRoot)
    if (!dirExists(absoluteWorkspaceRoot)) {
      continue
    }

    for (const entry of fs.readdirSync(absoluteWorkspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }

      const projectDir = path.join(absoluteWorkspaceRoot, entry.name)
      const packageJsonPath = path.join(projectDir, "package.json")
      if (!fileExists(packageJsonPath)) {
        continue
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
      projects.push({
        name: packageJson.name,
        packageJson,
        absolutePath: projectDir,
        relativePath: rel(projectDir),
        kind: workspaceRoot === "apps" ? "app" : "package",
      })
    }
  }

  return projects
}

const workspaceProjects = discoverWorkspaceProjects()
const workspaceByName = new Map(workspaceProjects.map((project) => [project.name, project]))
const workspaceNames = [...workspaceByName.keys()].sort((a, b) => b.length - a.length)

function walkFiles(startPath) {
  const absoluteStartPath = path.join(rootDir, startPath)
  if (!fs.existsSync(absoluteStartPath)) {
    return []
  }

  if (fileExists(absoluteStartPath)) {
    return sourceExtensions.includes(path.extname(absoluteStartPath)) ? [absoluteStartPath] : []
  }

  const files = []
  const stack = [absoluteStartPath]

  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (ignoredDirs.has(entry.name)) {
        continue
      }

      const child = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(child)
        continue
      }

      if (entry.isFile() && sourceExtensions.includes(path.extname(entry.name))) {
        files.push(child)
      }
    }
  }

  return files
}

function getLineAndColumn(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return `${line + 1}:${character + 1}`
}

function isStringLiteralLike(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
}

function hasRuntimeImportClause(importClause) {
  if (!importClause) {
    return true
  }

  if (importClause.isTypeOnly) {
    return false
  }

  if (importClause.name) {
    return true
  }

  const namedBindings = importClause.namedBindings
  if (!namedBindings) {
    return false
  }

  if (ts.isNamespaceImport(namedBindings)) {
    return true
  }

  return namedBindings.elements.some((specifier) => !specifier.isTypeOnly)
}

function hasRuntimeExportClause(exportClause) {
  if (!exportClause) {
    return true
  }

  if (ts.isNamespaceExport(exportClause)) {
    return true
  }

  return exportClause.elements.some((specifier) => !specifier.isTypeOnly)
}

function parseSourceFile(filePath) {
  const normalizedPath = path.normalize(filePath)
  if (fileInfoCache.has(normalizedPath)) {
    return fileInfoCache.get(normalizedPath)
  }

  const text = fs.readFileSync(normalizedPath, "utf8")
  const sourceFile = ts.createSourceFile(normalizedPath, text, ts.ScriptTarget.Latest, true)
  const imports = []
  let hasUseClient = false
  let hasServerOnlyMarker = false

  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && isStringLiteralLike(statement.expression)) {
      if (statement.expression.text === "use client") {
        hasUseClient = true
      }
      continue
    }

    if (ts.isEmptyStatement(statement)) {
      continue
    }

    break
  }

  function addImport(specifier, isRuntime, node) {
    if (specifier === "server-only" && isRuntime) {
      hasServerOnlyMarker = true
    }

    imports.push({
      specifier,
      isRuntime,
      location: `${rel(normalizedPath)}:${getLineAndColumn(sourceFile, node)}`,
    })
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && isStringLiteralLike(node.moduleSpecifier)) {
      addImport(node.moduleSpecifier.text, hasRuntimeImportClause(node.importClause), node)
      return
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier && isStringLiteralLike(node.moduleSpecifier)) {
      addImport(node.moduleSpecifier.text, !node.isTypeOnly && hasRuntimeExportClause(node.exportClause), node)
      return
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      isStringLiteralLike(node.arguments[0])
    ) {
      addImport(node.arguments[0].text, true, node)
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length === 1 &&
      isStringLiteralLike(node.arguments[0])
    ) {
      addImport(node.arguments[0].text, true, node)
    }

    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)

  const info = {
    absolutePath: normalizedPath,
    relativePath: rel(normalizedPath),
    imports,
    hasUseClient,
    hasServerOnlyMarker,
  }

  fileInfoCache.set(normalizedPath, info)
  return info
}

function workspaceNameForSpecifier(specifier) {
  return workspaceNames.find((name) => specifier === name || specifier.startsWith(`${name}/`)) || null
}

function resolveWorkspacePackageImport(specifier) {
  const packageName = workspaceNameForSpecifier(specifier)
  if (!packageName) {
    return null
  }

  const project = workspaceByName.get(packageName)
  const packageJson = project.packageJson
  const subpath = specifier === packageName ? "." : `.${specifier.slice(packageName.length)}`
  const exportsField = packageJson.exports
  let exportTarget = null

  if (typeof exportsField === "string" && subpath === ".") {
    exportTarget = exportsField
  } else if (exportsField && typeof exportsField === "object") {
    const configuredExport = exportsField[subpath]
    if (typeof configuredExport === "string") {
      exportTarget = configuredExport
    } else if (configuredExport && typeof configuredExport === "object") {
      exportTarget = configuredExport.import || configuredExport.default || configuredExport.types || null
    }
  }

  if (exportTarget) {
    return resolveFile(path.join(project.absolutePath, exportTarget))
  }

  if (subpath === ".") {
    return resolveFile(path.join(project.absolutePath, "src", "index"))
  }

  return resolveFile(path.join(project.absolutePath, "src", subpath.slice(2)))
}

function resolveImport(fromFilePath, specifier) {
  if (specifier.startsWith("@/")) {
    return resolveFile(path.join(rootDir, specifier.slice(2)))
  }

  if (specifier.startsWith(".")) {
    return resolveFile(path.resolve(path.dirname(fromFilePath), specifier))
  }

  return resolveWorkspacePackageImport(specifier)
}

function isServerOnlySpecifier(specifier) {
  return serverOnlySpecifierPrefixes.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`))
}

function projectForFile(filePath) {
  const normalizedPath = path.normalize(filePath)
  return workspaceProjects.find((project) => {
    const relativePath = path.relative(project.absolutePath, normalizedPath)
    return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
  })
}

function declaredWorkspaceDeps(project) {
  return new Set([
    ...Object.keys(project.packageJson.dependencies || {}),
    ...Object.keys(project.packageJson.devDependencies || {}),
    ...Object.keys(project.packageJson.peerDependencies || {}),
  ])
}

function validateRootScripts() {
  const packageJson = readJson("package.json")

  if (packageJson.scripts?.guardrails !== "node scripts/verify-monorepo-guardrails.mjs") {
    fail('Root package.json must expose "guardrails": "node scripts/verify-monorepo-guardrails.mjs".')
  }

  if (!packageJson.scripts?.["typecheck:workspace"]?.includes("pnpm -r")) {
    fail('Root package.json must make "typecheck:workspace" run a recursive pnpm typecheck across workspace packages.')
  }

  if (
    !packageJson.scripts?.["quality:ci"]?.includes("guardrails") ||
    !packageJson.scripts?.["quality:ci"]?.includes("typecheck:workspace")
  ) {
    fail('Root package.json must keep "quality:ci" wired through guardrails and workspace typecheck before app builds.')
  }
}

function validateTurboConfig() {
  const turbo = readJson("turbo.json")

  for (const [taskName, requirement] of Object.entries(requiredTurboTasks)) {
    const task = turbo.tasks?.[taskName]
    if (!task) {
      fail(`turbo.json is missing the "${taskName}" task.`)
      continue
    }

    if (requirement.dependsOn && !task.dependsOn?.includes(requirement.dependsOn)) {
      fail(`turbo.json task "${taskName}" must depend on "${requirement.dependsOn}".`)
    }
  }

  if (turbo.tasks?.dev?.cache !== false || turbo.tasks?.dev?.persistent !== true) {
    fail('turbo.json task "dev" must remain uncached and persistent.')
  }
}

function validateProjectConfig(project) {
  const relativePackageJsonPath = `${project.relativePath}/package.json`

  if (project.packageJson.private !== true) {
    fail(`${relativePackageJsonPath} must stay private.`)
  }

  if (project.packageJson.type !== "module") {
    fail(`${relativePackageJsonPath} must keep "type": "module".`)
  }

  if (project.packageJson.scripts?.lint !== "eslint .") {
    fail(`${relativePackageJsonPath} must expose "lint": "eslint .".`)
  }

  if (project.packageJson.scripts?.typecheck !== "tsc --noEmit -p tsconfig.json") {
    fail(`${relativePackageJsonPath} must expose "typecheck": "tsc --noEmit -p tsconfig.json".`)
  }

  if (project.kind === "app") {
    for (const scriptName of ["dev", "build", "start"]) {
      if (!project.packageJson.scripts?.[scriptName]) {
        fail(`${relativePackageJsonPath} must expose a "${scriptName}" script.`)
      }
    }
  }

  const tsconfigPath = `${project.relativePath}/tsconfig.json`
  if (!fileExists(path.join(rootDir, tsconfigPath))) {
    fail(`${tsconfigPath} is missing.`)
    return
  }

  const tsconfig = readJson(tsconfigPath)
  if (tsconfig.extends !== "../../tsconfig.base.json") {
    fail(`${tsconfigPath} must extend "../../tsconfig.base.json".`)
  }
}

function validateWorkspaceGraph() {
  const graph = new Map(workspaceProjects.map((project) => [project.name, new Set()]))
  const sourceGraph = new Map(workspaceProjects.map((project) => [project.name, new Set()]))

  for (const project of workspaceProjects) {
    const declaredDeps = declaredWorkspaceDeps(project)

    for (const dependencyName of declaredDeps) {
      if (workspaceByName.has(dependencyName)) {
        graph.get(project.name).add(dependencyName)
      }
    }

    for (const filePath of walkFiles(project.relativePath)) {
      const info = parseSourceFile(filePath)

      for (const imported of info.imports) {
        const dependencyName = workspaceNameForSpecifier(imported.specifier)
        if (dependencyName && dependencyName !== project.name) {
          sourceGraph.get(project.name).add(dependencyName)
          graph.get(project.name).add(dependencyName)

          if (!declaredDeps.has(dependencyName)) {
            fail(`${imported.location} imports ${dependencyName}, but ${project.relativePath}/package.json does not declare it.`)
          }
        }

        const resolved = resolveImport(filePath, imported.specifier)
        if (!resolved) {
          continue
        }

        const targetProject = projectForFile(resolved)
        if (project.kind === "package" && !targetProject) {
          const sourceRel = info.relativePath
          const targetRel = rel(resolved)
          const allowedTargets = allowedPackageExternalImports.get(sourceRel)

          if (!allowedTargets?.has(targetRel)) {
            fail(`${imported.location} reaches outside ${project.relativePath} into ${targetRel}. Add a real package export instead of a new root-source bridge.`)
          }
        }
      }
    }
  }

  for (const cycle of findCycles(graph)) {
    fail(`Workspace dependency cycle detected: ${cycle.join(" -> ")}`)
  }

  return sourceGraph
}

function findCycles(graph) {
  const cycles = []
  const visited = new Set()
  const visiting = new Set()
  const stack = []

  function visit(node) {
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node)
      cycles.push([...stack.slice(cycleStart), node])
      return
    }

    if (visited.has(node)) {
      return
    }

    visiting.add(node)
    stack.push(node)

    for (const next of graph.get(node) || []) {
      visit(next)
    }

    stack.pop()
    visiting.delete(node)
    visited.add(node)
  }

  for (const node of graph.keys()) {
    visit(node)
  }

  return cycles
}

function validateClientServerBoundaries() {
  const scannedRoots = ["apps", "components", "hooks", "lib", "packages"]
  const sourceFiles = scannedRoots.flatMap((scanRoot) => walkFiles(scanRoot))

  for (const filePath of sourceFiles) {
    parseSourceFile(filePath)
  }

  const clientRoots = [...fileInfoCache.values()].filter((info) => info.hasUseClient)

  for (const clientRoot of clientRoots) {
    const visited = new Set()
    const stack = []

    function visit(info) {
      if (visited.has(info.absolutePath)) {
        return
      }

      visited.add(info.absolutePath)
      stack.push(info)

      for (const imported of info.imports) {
        if (!imported.isRuntime) {
          if (isServerOnlySpecifier(imported.specifier)) {
            warn(`${imported.location} type-imports ${imported.specifier}. Prefer moving shared client-safe types into @hkmc/data-contracts.`)
          }
          continue
        }

        if (isServerOnlySpecifier(imported.specifier)) {
          fail(`${imported.location} runtime-imports server-only module ${imported.specifier} from client graph rooted at ${clientRoot.relativePath}.`)
          continue
        }

        const resolved = resolveImport(info.absolutePath, imported.specifier)
        if (!resolved || !fileExists(resolved)) {
          continue
        }

        const targetInfo = parseSourceFile(resolved)
        if (targetInfo.hasServerOnlyMarker) {
          const chain = [...stack.map((entry) => entry.relativePath), targetInfo.relativePath].join(" -> ")
          fail(`${imported.location} reaches server-only file ${targetInfo.relativePath} from client graph rooted at ${clientRoot.relativePath}. Chain: ${chain}`)
          continue
        }

        visit(targetInfo)
      }

      stack.pop()
    }

    visit(clientRoot)
  }
}

function printGraph(graph) {
  console.log("Workspace source dependency graph:")
  for (const project of workspaceProjects) {
    const deps = [...(graph.get(project.name) || [])].sort()
    console.log(`- ${project.name}: ${deps.length > 0 ? deps.join(", ") : "(none)"}`)
  }
}

validateRootScripts()
validateTurboConfig()

for (const project of workspaceProjects) {
  validateProjectConfig(project)
}

const sourceGraph = validateWorkspaceGraph()
validateClientServerBoundaries()

if (warnings.length > 0) {
  console.warn("Monorepo guardrail warnings:")
  for (const warning of warnings) {
    console.warn(`- ${warning}`)
  }
}

if (shouldPrintGraph) {
  printGraph(sourceGraph)
}

if (errors.length > 0) {
  console.error("Monorepo guardrails failed:")
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log("Monorepo guardrails passed.")
