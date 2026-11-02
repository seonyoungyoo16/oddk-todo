import test from "node:test";
import assert from "node:assert/strict";
import { installNativeTouchPolicy } from "../../app/todo/native-touch-policy.ts";

const root = (value = null) => {
  const attributes = new Map(value === null ? [] : [["data-oddk-native-touch", value]]);
  return { getAttribute: key => attributes.get(key) ?? null, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
};
test("web leaves its existing touch policy untouched", () => {
  const document = root("web-owned");
  const stop = installNativeTouchPolicy(document, false);
  assert.equal(document.getAttribute("data-oddk-native-touch"), "web-owned");
  stop();
  assert.equal(document.getAttribute("data-oddk-native-touch"), "web-owned");
});
test("native mount/unmount and React effect replay restore the previous policy", () => {
  for (const previous of [null, "existing"]) {
    const document = root(previous);
    for (let replay = 0; replay < 2; replay++) {
      const stop = installNativeTouchPolicy(document, true);
      assert.equal(document.getAttribute("data-oddk-native-touch"), "manipulation");
      stop();
      assert.equal(document.getAttribute("data-oddk-native-touch"), previous);
    }
  }
});
