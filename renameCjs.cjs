const fs = require("fs");
const path = require("path");

// First, rename ESM .js files to .mjs in the build directory
function renameJsToMjsRecursive(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            renameJsToMjsRecursive(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            const newPath = fullPath.replace(".js", ".mjs");
            fs.renameSync(fullPath, newPath);
            console.log(`Renamed ESM: ${fullPath} → ${newPath}`);
        }
    }
}

// Then, copy CJS .js files from build-cjs to build (keeping .js extension)
function copyCjsRecursive(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            copyCjsRecursive(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            const newPath = fullPath.replace("build-cjs", "build");
            // Ensure directory exists
            fs.mkdirSync(path.dirname(newPath), { recursive: true });
            fs.copyFileSync(fullPath, newPath);
            console.log(`Copied CJS: ${fullPath} → ${newPath}`);
        }
    }
}

console.log("Renaming ESM files to .mjs...");
renameJsToMjsRecursive("build");

console.log("\nCopying CJS files...");
copyCjsRecursive("build-cjs");
