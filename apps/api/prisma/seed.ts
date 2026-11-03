async function main() {
  console.log("Seed skipped: this repository starts with an empty planner instance.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
