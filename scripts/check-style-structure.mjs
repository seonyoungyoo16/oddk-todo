import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const root = fileURLToPath(new URL("../app/todo/", import.meta.url));
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(path.join(directory, item.name)) : [path.join(directory, item.name)]);
const relative = file => path.relative(root, file).replaceAll("\\", "/");
const errors = [];
const styles = new Map();
const all = files(root);
for (const file of all.filter(file => file.endsWith(".css"))) {
  try { styles.set(file, postcss.parse(readFileSync(file, "utf8"), { from: file })); }
  catch (error) { errors.push(error.message); }
}
const imported = new Set(), visiting = new Set();
function visit(file) {
  if (visiting.has(file)) { errors.push(`CSS import cycle: ${relative(file)}`); return; }
  if (imported.has(file)) { errors.push(`Duplicate CSS import: ${relative(file)}`); return; }
  imported.add(file); visiting.add(file);
  const ast = styles.get(file);
  if (!ast) { errors.push(`Missing CSS: ${relative(file)}`); return; }
  ast.walkAtRules("import", rule => {
    const target = rule.params.match(/^["'](.+?)["']/)?.[1];
    if (!target?.startsWith(".")) errors.push(`Use local, explicit CSS imports: ${relative(file)}`);
    else visit(path.resolve(path.dirname(file), target));
  });
  visiting.delete(file);
}
visit(path.join(root, "styles.css"));
for (const file of styles.keys()) if (!imported.has(file)) errors.push(`CSS missing from entry: ${relative(file)}`);

for (const file of all.filter(file => /\.[jt]sx?$/.test(file))) {
  const imports = [...readFileSync(file, "utf8").matchAll(/import\s+["']([^"']+\.css)["']/g)];
  for (const match of imports) if (relative(file) !== "layout.tsx" || match[1] !== "./styles.css") errors.push(`CSS entry belongs to layout.tsx: ${relative(file)}`);
}
if (!readFileSync(path.join(root, "layout.tsx"), "utf8").includes('import "./styles.css";')) errors.push("Route layout must import styles.css");

const declarations = new Set(), references = [];
for (const [file, ast] of styles) {
  const name = relative(file);
  ast.walkDecls(declaration => {
    if (declaration.prop.startsWith("--")) declarations.add(declaration.prop);
    if (declaration.prop.startsWith("--oddk-") && name !== "styles/tokens.css") errors.push(`Shared token must be defined in tokens.css: ${name}:${declaration.source.start.line} ${declaration.prop}`);
    for (const match of declaration.value.matchAll(/var\((--oddk-[\w-]+)\s*\)/g)) references.push({ name: match[1], file: name });
  });
  ast.walkRules(rule => {
    if (/\.oddk-workspace\b|\.oddk-pageHeader\b/.test(rule.selector) && name !== "page-layout.css") errors.push(`Workspace frame has one owner: ${name}:${rule.source.start.line}`);
    if (/oddk-dailyGrid|oddk-paneSwitch/.test(rule.selector) && name !== "styles/daily-layout.css") errors.push(`Daily layout has one owner: ${name}:${rule.source.start.line}`);
    if ([".oddk-primary", ".oddk-dialog", ".oddk-dialogHeader", ".oddk-dialogActions", ".oddk-dialogField"].includes(rule.selector.trim()) && name !== "styles/controls.css") errors.push(`Common control belongs to controls.css: ${name}:${rule.source.start.line}`);
  });
}
for (const reference of references) if (!declarations.has(reference.name)) errors.push(`Undefined token ${reference.name} in ${reference.file}`);
if (errors.length) {
  console.error([...new Set(errors)].join("\n")); process.exitCode = 1;
} else console.log(`Style structure OK: ${styles.size} stylesheets, one entry, shared token and layout ownership verified.`);
