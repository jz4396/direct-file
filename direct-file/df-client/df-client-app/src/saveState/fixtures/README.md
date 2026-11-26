# Frozen save files

Generated at main `8b8084f9b56352e1d7406d60ceb5422becc0b743` on 2026-11-26 from the synthetic golden profiles. Test-only. No real taxpayer data, no real identifiers, and no credentials.

| File                      | Export                              | Profile                                  |
| ------------------------- | ----------------------------------- | ---------------------------------------- |
| `golden-t.json`           | Plaintext `df-save-state`           | Golden T, `profileTFlMfjSpouseScheduleC` |
| `golden-x.encrypted.json` | Encrypted `df-save-state-encrypted` | Golden X, `profileXPaMfj8959`            |

Both files are what `exportSaveFile` wrote at that commit, pretty-printed with two-space JSON. `savedAt` is `2026-11-26T00:00:00.000Z`, the generation date.

Golden X uses the fixed test passphrase `correct horse battery staple` (`PASSPHRASE` in `saveStateTestUtils.ts`). That passphrase is test-only. It is not a user passphrase, and it is not stored in the encrypted file. The KDF is the production `PBKDF2_ITERATIONS` (600000), which is what `exportSaveFile` writes. Salt and IV are the random values from this one generation.

`frozenSaveFixtures.test.ts` imports each file with the current build and checks the headline lines the golden scenario checks: AGI (`/agi`), total tax (`/totalTax`), and refund (`/overpayment`) or amount owed (`/balanceDue`).

## Do not edit these files

`importSaveFile` rejects a fact path this build's dictionary does not have. If a later change renames or removes a path that is stored here, that test fails. The fix is a reviewed save-state migration. Do not edit a fixture to make the test pass. Editing the fixture would hide the break for someone who saved a return at this build.
