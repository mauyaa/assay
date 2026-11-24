import assert from "node:assert/strict";
import { test } from "node:test";
import { auditPackage, BUNDLED_SOURCES, DEMO_PACKAGES, GnoClient, SimulatedRegistry } from "../src/index";

test("trap package fails with a critical drain on line 18", async () => {
  const r = await auditPackage(DEMO_PACKAGES.trap, BUNDLED_SOURCES[DEMO_PACKAGES.trap]);
  assert.equal(r.verdict, "FAIL");
  assert.equal(r.score, 0);
  const drain = r.findings.find((f) => f.rule === "AS001");
  assert.ok(drain, "drain finding present");
  assert.equal(drain.severity, "critical");
  assert.equal(drain.line, 18);
  assert.match(drain.snippet, /SendCoins/);
  const rules = new Set(r.findings.map((f) => f.rule));
  for (const id of ["AS003", "AS004", "AS005", "AS006"]) assert.ok(rules.has(id), `expected ${id}`);
  // Comments mentioning SendCoins or addresses must not be reported.
  assert.ok(r.findings.every((f) => f.line > 7), "no findings inside the doc comment");
});

test("vault_math passes clean", async () => {
  const r = await auditPackage(DEMO_PACKAGES.clean, BUNDLED_SOURCES[DEMO_PACKAGES.clean]);
  assert.equal(r.verdict, "PASS");
  assert.equal(r.findings.length, 0);
  assert.equal(r.score, 100);
  assert.match(r.sourceHash, /^[0-9a-f]{64}$/);
});

test("registry realm passes with notes only", async () => {
  const r = await auditPackage("gno.land/r/nym-assay001/registry", BUNDLED_SOURCES["gno.land/r/nym-assay001/registry"]);
  assert.equal(r.verdict, "PASS", r.summary);
  assert.ok(r.findings.some((f) => f.rule === "AS007"));
  assert.ok(r.findings.filter((f) => f.rule === "AS011").length === 2);
  assert.ok(!r.findings.some((f) => f.rule === "AS009"), "registry asserts origin call");
});

test("unbounded loop and unguarded OriginSend are caught", async () => {
  const src = `package r
import "chain/runtime/unsafe"
func Spin(cur realm) {
	for {
		x := 1
		_ = x
	}
}
func Pay(cur realm) { _ = unsafe.OriginSend() }
func Ok() { for { break } }
`;
  const r = await auditPackage("gno.land/r/x/spin", [{ name: "spin.gno", body: src }]);
  const loops = r.findings.filter((f) => f.rule === "AS008");
  assert.equal(loops.length, 1);
  assert.equal(loops[0].line, 4);
  assert.ok(r.findings.some((f) => f.rule === "AS009" && f.line === 9));
  assert.equal(r.verdict, "FAIL");
});

test("simulator mirrors realm checks", async () => {
  const sim = new SimulatedRegistry();
  await assert.rejects(sim.executeAndPay("g1user", DEMO_PACKAGES.trap, 250, 1, "a"), /not audit-verified/);
  await assert.rejects(sim.executeAndPay("g1user", DEMO_PACKAGES.clean, 999, 1, "b"), /insufficient fee: sent 999ugnot, required 1000ugnot/);
  const rc = await sim.executeAndPay("g1user", DEMO_PACKAGES.clean, 1500, 7, "c");
  await assert.rejects(sim.executeAndPay("g1user", DEMO_PACKAGES.clean, 1000, 8, "c"), /duplicate request; already settled as receipt #1/);
  assert.equal(rc.refund, 500);
  assert.equal(rc.origin, "simulated");
  assert.match(sim.render(""), /\| 1 \| \[gno\.land\/p\/nym-assay001\/vault_math\]/);
  assert.match(sim.render("receipt/1"), /- refund: 500 ugnot/);
});

test("live Onyx: fetch and audit a real on-chain realm", { skip: process.env.OFFLINE === "1" }, async () => {
  const c = new GnoClient();
  const st = await c.status();
  assert.equal(st.chainId, "onyx-1");
  const files = await c.fetchPackage("gno.land/r/gnoland/wugnot");
  assert.ok(files && files.some((f) => f.name === "wugnot.gno"));
  const r = await auditPackage("gno.land/r/gnoland/wugnot", files!);
  assert.equal(r.verdict, "PASS", r.summary);
  assert.equal(await c.listFiles("gno.land/r/nym-assay001/does_not_exist"), null);
});
