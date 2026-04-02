async function main() {
  console.log("Hello World!")
}

await main().catch((err) => {
  console.error(err)
  process.exit(1)
})