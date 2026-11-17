import { describe, it, expect } from "vitest";
import { injectableJson } from "../../inject.js";

describe("injectableJson", () => {
    it("round-trips through JSON.parse in a script and never contains a closing script tag", () => {
        const value = [{ name: "riff </script><b>x</b> <!--   \"q\" \\", notes: [{ p: 40, b: 0.5 }] }];
        const js = injectableJson(value);
        expect(js).not.toMatch(/<\/script/i);
        expect(js).not.toContain("<");
        expect(new Function(`return JSON.parse(${js});`)()).toEqual(value);
    });
});
