/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function (file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      results.push(file);
    }
  });
  return results;
}

const files = walk("./src");
files.forEach((file) => {
  let content = fs.readFileSync(file, "utf8");
  let original = content;

  // Remove dark: classes (including things like dark:hover:bg-zinc-800)
  content = content.replace(/dark:[a-zA-Z0-9_\/-]+/g, "");

  // Replace hardcoded zinc colors with theme variables for consistent dark purple theme
  content = content.replace(/bg-zinc-50/g, "bg-background");
  content = content.replace(/bg-white/g, "bg-background");
  content = content.replace(/text-zinc-950/g, "text-foreground");
  content = content.replace(/text-zinc-900/g, "text-foreground");
  content = content.replace(/border-zinc-200/g, "border-border");
  content = content.replace(/border-zinc-300/g, "border-input");
  content = content.replace(/text-zinc-500/g, "text-muted-foreground");
  content = content.replace(/bg-zinc-100/g, "bg-muted");

  // Clean up double spaces that might result
  content = content.replace(/  +/g, " ");
  content = content.replace(/ \"/g, '"');
  content = content.replace(/\" /g, '"');
  content = content.replace(/ className=""/g, "");

  // Some CustomGPT leftovers
  content = content.replace(/CustomGPT/g, "Hollywood GPT");
  content = content.replace(/Custom GPT/g, "Hollywood GPT");

  if (original !== content) {
    fs.writeFileSync(file, content);
    console.log("Updated " + file);
  }
});
