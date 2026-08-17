#!/usr/bin/env node
// Installed by Theme Factory (tf chat). Do not edit — regenerated each launch.
let input = "";
process.stdin.on("data", function (c) { input += c; });
process.stdin.on("end", function () {
  var cmd = "";
  try { cmd = ((JSON.parse(input) || {}).tool_input || {}).command || ""; } catch (e) {}
  var parts = String(cmd).toLowerCase().split(/\s+/);
  var blocked = false;
  for (var i = 0; i < parts.length - 1; i++) {
    if (parts[i] === "theme" && parts[i + 1] === "dev") { blocked = true; break; }
  }
  if (blocked) {
    process.stderr.write("Blocked by Theme Factory: do NOT run \`shopify theme dev\` or any blocking local preview server — it never returns and hangs this session. To let the user preview, push to an unpublished theme and share the preview URL. For a local hot-reload preview, tell the user to run \`tf serve --latest\` themselves. To debug a visual / 'not visible' issue, reason from the Liquid + CSS + schema, run \`shopify theme check\`, and inspect any screenshot the user provided.");
    process.exit(2);
  }
  process.exit(0);
});
