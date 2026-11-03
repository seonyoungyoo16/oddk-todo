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
      assert.equal(document.getAttribute("data-oddk-native-touch"), "locked");
      stop();
      assert.equal(document.getAttribute("data-oddk-native-touch"), previous);
    }
  }
});

test("native event fallback blocks multi-touch/gesture zoom but preserves single-finger scrolling and cleans up", () => {
  const listeners = new Map();
  const surface = { addEventListener: (name, listener, options) => { assert.equal(options.passive, false); listeners.set(name, listener); }, removeEventListener: (name, listener) => { assert.equal(listeners.get(name), listener); listeners.delete(name); } };
  const stop = installNativeTouchPolicy(root(), true, surface);
  const event = count => ({ touches: Array(count).fill({}), cancelable: true, prevented: false, preventDefault() { this.prevented = true; } });
  const single = event(1); listeners.get("touchstart")(single); assert.equal(single.prevented, false);
  const pinch = event(2); listeners.get("touchstart")(pinch); assert.equal(pinch.prevented, true);
  const gesture = event(0); listeners.get("gesturestart")(gesture); assert.equal(gesture.prevented, true);
  stop(); assert.equal(listeners.size, 0);
});
