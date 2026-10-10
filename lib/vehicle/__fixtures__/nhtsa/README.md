# Recorded NHTSA responses (test fixtures)

Fetched live on 2026-10-10 (06:54–06:58 UTC, 01:54–01:58 CT). Content is unmodified; the repo pre-commit hook re-indented the JSON (Prettier, whitespace only). No key is needed for any of these.

| File pattern                               | Source URL                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `decode-extended-<VIN>.json`               | `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/<VIN>?format=json`         |
| `decode-extended-invalid-check-digit.json` | same endpoint, VIN `1HGCM82633A00435X` (bad check digit)                                    |
| `recall-models-<make>-<year>.json`         | `https://api.nhtsa.gov/products/vehicle/models?modelYear=<year>&make=<MAKE>&issueType=r`    |
| `recalls-<make>-<model>-<year>.json`       | `https://api.nhtsa.gov/recalls/recallsByVehicle?make=<MAKE>&model=<MODEL>&modelYear=<year>` |

VINs: `1HGCM82633A004352` (2003 Honda Accord, the vPIC docs sample VIN), `1G1FJ1R66P0139282`
(2023 Chevrolet Camaro ZL1) and `1FT7W2BT8GED11804` (2016 Ford F-250), the last two from MikeHunt
prod deal rows.

`recalls-ford-f-250-2016.json` (Count 0) next to `recalls-ford-f-250-sd-2016.json` (Count 4) is the
reason recalls are resolved through the catalog: vPIC names the model "F-250", NHTSA files the
2016 campaigns under "F-250 SD".

To refresh: re-run the URLs above with `curl -s -o <file> <url>` and re-run
`npx vitest run lib/vehicle app/api/vin`. Counts change as NHTSA adds campaigns.
