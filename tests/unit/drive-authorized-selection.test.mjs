import assert from "node:assert/strict";
import test from "node:test";
import { authorizedDriveSelection } from "../../src/lib/drive-authorized-selection.ts";

test("authorized browser imports only explicitly selected provider-listed files", () => {
  const files = [{ id: "allowed-a", name: "a" }, { id: "allowed-b", name: "b" }];
  assert.deepEqual(authorizedDriveSelection(files, ["allowed-b", "unlisted"]), [files[1]]);
});
test("empty authorization or no selection never supplies import files", () => {
  assert.deepEqual(authorizedDriveSelection([], ["unlisted"]), []);
  assert.deepEqual(authorizedDriveSelection([{ id: "allowed" }], []), []);
});
test("duplicate provider records are imported once", () => {
  assert.deepEqual(authorizedDriveSelection([{ id: "allowed" }, { id: "allowed" }], ["allowed", "allowed"]), [{ id: "allowed" }]);
});