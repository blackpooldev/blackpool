#!/usr/bin/env bash
# Builds the browser proving bundle into public/zk/:
#   worker.js                    cli/lib/localApi.js + zk.js + snarkjs, bundled for a classic web worker
#   transaction2-<sha8>.wasm     circuit witness generator  (content-addressed, cached immutably)
#   transaction2-<sha8>.zkey     Groth16 proving key        (content-addressed, cached immutably)
#   manifest.json                file names, sizes and SHA-256 (the worker and the CLI verify downloads)
# Run from frontend/ (deploy.sh calls it). The circuit files come from ../build/circuits.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/zk
SRC=../build/circuits
mkdir -p "$OUT"
# the worker bundles cli/lib, which needs the CLI dependencies (ethers v5, snarkjs, poseidon-lite)
[ -d ../cli/node_modules/ethers ] || npm ci --prefix ../cli --omit=dev --no-audit --no-fund
rm -f "$OUT"/transaction2-*.wasm "$OUT"/transaction2-*.zkey
entry() {
  local kind=$1 f=$SRC/transaction2.$1
  local sum; sum=$(sha256sum "$f" | cut -d' ' -f1)
  local name="transaction2-${sum:0:8}.$kind"
  cp "$f" "$OUT/$name"
  printf '"%s":{"path":"/zk/%s","sha256":"%s","bytes":%s}' "$kind" "$name" "$sum" "$(stat -c %s "$f")"
}
printf '{"circuit":"transaction2",%s,%s}\n' "$(entry wasm)" "$(entry zkey)" > "$OUT/manifest.json"
npx -y esbuild@0.24.2 zk/worker.js --bundle --minify --format=iife --platform=browser --target=es2020 \
  --external:crypto --external:fs --external:os --external:path --external:readline --external:worker_threads \
  --define:process.env.NODE_ENV='"production"' --define:global=globalThis \
  --legal-comments=none --log-level=warning --outfile="$OUT/worker.js"
echo "zk bundle: $(du -h "$OUT/worker.js" | cut -f1) worker, $(du -ch "$OUT"/transaction2-* | tail -1 | cut -f1) circuit"
