import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { setFirewallRunnerForTesting } from "../src/lib/firewall/firewallManager";
import { POST, GET } from "../src/app/api/firewall/route";

test("W07: authorized booleans reach the firewall runner and overlapping operations cannot spawn", async () => {
  const calls: string[] = [];
  let complete: (() => void) | undefined;

  setFirewallRunnerForTesting((_exe: string, args: string[]) => new Promise(resolve => {
    const action = args.at(-1)!;
    calls.push(action);
    complete = () => resolve({
      stdout: JSON.stringify({
        success: true,
        rulesActive: action === "enable",
        networkProfile: "Private",
        networkName: "HomeWiFi",
        isPublic: false
      }),
      stderr: ""
    });
  }));

  const state = globalThis as typeof globalThis & { firewallNextStart?: number; firewallBusy?: boolean };
  try {
    const postReq = (enable: boolean) => new NextRequest("http://localhost:3000/api/firewall", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "x-is-local-client": "true" },
      body: JSON.stringify({ enable }),
    });

    for (const enable of [true, false]) {
      state.firewallNextStart = 0;
      const pending = POST(postReq(enable));
      await new Promise(resolve => setImmediate(resolve));
      assert.equal((await POST(postReq(enable))).status, 429);
      complete!();
      assert.equal((await pending).status, 200);
      assert.equal((await POST(postReq(enable))).status, 429, "Cooldown blocks repeated spawning");
    }
    assert.deepEqual(calls, ["enable", "disable"]);

    // Test GET status check
    state.firewallNextStart = 0;
    const getReq = new NextRequest("http://localhost:3000/api/firewall", {
      method: "GET",
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "x-is-local-client": "true" },
    });
    const pendingGet = GET(getReq);
    await new Promise(resolve => setImmediate(resolve));
    complete!();
    const getRes = await pendingGet;
    assert.equal(getRes.status, 200);
    assert.equal(calls.at(-1), "check");
  } finally {
    setFirewallRunnerForTesting(null);
    state.firewallNextStart = 0;
  }
});
