// Execute the real gateway, policy, engine and server over HTTP against a local
// Postman simulation. Only Next/session and the centralized client boundary are adapted.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
const core = resolve("core");
const require = createRequire(resolve(core, "package.json"));
const ts = require("typescript");
const base = process.env.PICKUP_SIM_URL ?? "http://127.0.0.1:4017/checkout";
let sessionCart = "test-cart";
let signedIn = true;
let enabled = true;
const deps: Record<string, unknown> = {
  "server-only": {},
  zod: require("zod"),
  "~/client/graphql": { graphql: (query: string) => query },
  "~/auth": {
    getSessionCustomerAccessToken: async () =>
      signedIn ? "synthetic-customer" : undefined,
  },
  "~/lib/cart": { getCartId: async () => sessionCart },
};
async function request(path: string, body?: unknown) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer synthetic-token",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw Error("HTTP " + r.status);
  return r.json();
}
deps["~/client"] = {
  client: {
    fetch: async ({
      document,
      variables,
      fetchOptions,
      customerAccessToken,
    }: any) => {
      assert.equal(fetchOptions.cache, "no-store");
      assert.equal(customerAccessToken, "synthetic-customer");
      const data = await request("/graphql", { query: document, variables });
      if (data.errors) throw Error("GraphQL failure");
      return data;
    },
  },
};
const warehouse = {
  firstName: "",
  lastName: "",
  email: "",
  company: "",
  phone: "",
  address1: "200 Warehouse Road",
  address2: "",
  city: "Boonville",
  stateOrProvince: "Missouri",
  stateOrProvinceCode: "MO",
  postalCode: "65233",
  countryCode: "US",
};
const billing = {
  ...warehouse,
  firstName: "Test",
  lastName: "Shopper",
  email: "pickup@example.test",
  address1: "100 Test Street",
  city: "Austin",
  stateOrProvince: "Texas",
  stateOrProvinceCode: "TX",
  postalCode: "78701",
};
deps["~/lib/freight-cart/server"] = {
  freightCartEnabled: async () => enabled,
  getCartShippingState: async () => {
    const s = await request("/__state");
    const p = JSON.parse(
      s.fields.find((f: any) => f.key === "freight_fulfillment").value,
    );
    return { confirmed: true, preferences: p };
  },
};
deps["~/lib/map-section/actions"] = {
  loadShippingOriginDetails: async () => ({ fields: warehouse }),
};
for (const name of ["policy", "engine", "gateway", "server"]) {
  const exports = {};
  const source = await readFile(
    resolve(core, "lib/pickup-checkout", name + ".ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    require: (id: string) => {
      if (!(id in deps)) throw Error("Unmodeled dependency " + id);
      return deps[id];
    },
    process,
    console,
  });
  deps["./" + name] = exports;
}
const { pickupGateway } = deps["./gateway"] as any;
const { pickupFlow, clearPickup } = deps["./engine"] as any;
const server = deps["./server"] as any;
const reset = async (config = {}) => {
  sessionCart = "test-cart";
  signedIn = true;
  enabled = true;
  process.env.PICKUP_CHECKOUT_ENABLED = "true";
  await request("/__reset", config);
};
const flow = async () =>
  pickupFlow(await pickupGateway("test-cart"), warehouse, 1);
let count = 0;
async function test(name: string, fn: () => Promise<void>) {
  await reset();
  await fn();
  count++;
  console.log("PASS " + name);
}
await test("Pickup assigns before addresses, retains separate billing, selects fresh free quote and all physical items", async () => {
  await server.savePickupBilling("test-cart", billing, 1);
  await server.preparePickupCheckout("test-cart");
  const s = await request("/__state");
  assert.equal(s.billing.address1, billing.address1);
  assert.equal(s.shipping[0].address.address1, warehouse.address1);
  assert.equal(s.shipping[0].selectedShippingOption.entityId, "fresh-pickup");
  assert.deepEqual(s.shipping[0].lineItemIds, ["item-1", "item-2"]);
  assert.ok(
    s.events.indexOf("AssignPickupCart") < s.events.indexOf("AddPickupBilling"),
  );
  await server.preparePickupCheckout("test-cart");
  const retry = await request("/__state");
  assert.equal(
    retry.events.filter((x: string) => x === "AssignPickupCart").length,
    1,
  );
  assert.equal(retry.shipping.length, 1);
});
await test("Pickup refuses empty or warehouse billing", async () => {
  await assert.rejects(
    () => server.preparePickupCheckout("test-cart"),
    /billing/,
  );
  await assert.rejects(
    async () =>
      (await flow()).saveBilling({
        ...warehouse,
        firstName: "Test",
        lastName: "Shopper",
        email: billing.email,
      }),
    /billing/,
  );
});
await test("Saved billing preserves customer email, never trusts posted email", async () => {
  await server.savePickupBilling(
    "test-cart",
    { ...billing, email: "other@example.test" },
    1,
  );
  assert.equal((await request("/__state")).billing.email, billing.email);
});
await test("Ship without a pickup marker makes no checkout mutations", async () => {
  await request("/__patch", {
    fields: [
      {
        entityId: 1,
        key: "freight_fulfillment",
        value: JSON.stringify({ fulfillmentMethod: "ship", version: 2 }),
      },
    ],
  });
  await server.preparePickupCheckout("test-cart");
  await server.cleanupPickupCheckout("test-cart");
  assert.deepEqual((await request("/__state")).events, []);
});
await test("Pickup → Ship clears created consignment but retains billing", async () => {
  await server.savePickupBilling("test-cart", billing, 1);
  await server.preparePickupCheckout("test-cart");
  const s = await request("/__state");
  s.fields[0].value = JSON.stringify({ fulfillmentMethod: "ship", version: 2 });
  await request("/__patch", { fields: s.fields });
  await server.preparePickupCheckout("test-cart");
  const after = await request("/__state");
  assert.equal(after.shipping.length, 0);
  assert.equal(after.billing.address1, billing.address1);
  assert.equal(after.fields.length, 1);
});
await test("Pickup → Ship restores original destination without a stale quote", async () => {
  await request("/__patch", {
    shipping: [
      {
        entityId: "original",
        address: { ...billing, customFields: [] },
        lineItemIds: ["item-1", "item-2"],
        availableShippingOptions: [],
        selectedShippingOption: null,
      },
    ],
  });
  await server.savePickupBilling("test-cart", billing, 1);
  await server.preparePickupCheckout("test-cart");
  await server.cleanupPickupCheckout("test-cart");
  const s = await request("/__state");
  assert.equal(s.shipping[0].address.address1, billing.address1);
  assert.equal(s.shipping[0].selectedShippingOption, null);
});
await test("Cleanup preserves a shopper-edited shipping destination", async () => {
  await server.savePickupBilling("test-cart", billing, 1);
  await server.preparePickupCheckout("test-cart");
  const s = await request("/__state");
  s.shipping[0].address.address1 = "300 Shopper Edit";
  await request("/__patch", { shipping: s.shipping });
  await server.cleanupPickupCheckout("test-cart");
  assert.equal(
    (await request("/__state")).shipping[0].address.address1,
    "300 Shopper Edit",
  );
});
for (const setting of ["noOption", "paidOption", "ambiguousOption"])
  await test("Reject " + setting, async () => {
    await reset({ [setting]: true });
    await server.savePickupBilling("test-cart", billing, 1);
    await assert.rejects(
      () => server.preparePickupCheckout("test-cart"),
      /unavailable/,
    );
    assert.ok(
      !(await request("/__state")).events.includes("SelectPickupShipping"),
    );
  });
for (const op of [
  "AssignPickupCart",
  "AddPickupBilling",
  "AddPickupShipping",
  "SelectPickupShipping",
])
  await test("Recover upstream failure: " + op, async () => {
    await reset({ fail: op });
    if (op === "AssignPickupCart" || op === "AddPickupBilling") {
      await assert.rejects(() =>
        server.savePickupBilling("test-cart", billing, 1),
      );
      await server.savePickupBilling("test-cart", billing, 1);
    } else {
      await server.savePickupBilling("test-cart", billing, 1);
      await assert.rejects(() => server.preparePickupCheckout("test-cart"));
    }
    await server.preparePickupCheckout("test-cart");
    assert.equal(
      (await request("/__state")).shipping[0].selectedShippingOption.entityId,
      "fresh-pickup",
    );
  });
await test("Recover shipping committed before network failure", async () => {
  await reset({ failAfter: "AddPickupShipping" });
  await server.savePickupBilling("test-cart", billing, 1);
  await assert.rejects(() => server.preparePickupCheckout("test-cart"));
  await server.preparePickupCheckout("test-cart");
  assert.equal((await request("/__state")).shipping.length, 1);
});
for (const setting of ["changeQuantity", "switchToShip"])
  await test("Reject concurrent " + setting, async () => {
    await reset({ [setting]: true });
    await server.savePickupBilling("test-cart", billing, 1);
    await assert.rejects(
      () => server.preparePickupCheckout("test-cart"),
      /changed/,
    );
    assert.ok(
      !(await request("/__state")).events.includes("SelectPickupShipping"),
    );
  });
await test("Stale preferences cannot save billing", async () => {
  await assert.rejects(
    () => server.savePickupBilling("test-cart", billing, 9),
    /changed/,
  );
  assert.deepEqual((await request("/__state")).events, []);
});
await test("Changed session cart and unsigned customer fail before mutations", async () => {
  sessionCart = "other";
  await assert.rejects(() => server.savePickupBilling("test-cart", billing, 1));
  await assert.rejects(() => server.preparePickupCheckout("test-cart"));
  sessionCart = "test-cart";
  signedIn = false;
  await assert.rejects(() => pickupGateway("test-cart"));
  assert.deepEqual((await request("/__state")).events, []);
});
await test("Multiple consignments fail closed", async () => {
  const c = {
    entityId: "c1",
    address: { ...billing, customFields: [] },
    lineItemIds: ["item-1"],
    availableShippingOptions: [],
    selectedShippingOption: null,
  };
  await request("/__patch", { shipping: [c, { ...c, entityId: "c2" }] });
  await assert.rejects(
    () => server.preparePickupCheckout("test-cart"),
    /one shipping/,
  );
});
await test("Disabled flag cleans already prepared pickup", async () => {
  await server.savePickupBilling("test-cart", billing, 1);
  await server.preparePickupCheckout("test-cart");
  process.env.PICKUP_CHECKOUT_ENABLED = "false";
  await server.preparePickupCheckout("test-cart");
  assert.equal((await request("/__state")).shipping.length, 0);
});
await test("Digital-only and disabled untouched carts bypass pickup mutations", async () => {
  await request("/__patch", { items: [] });
  await server.preparePickupCheckout("test-cart");
  assert.deepEqual((await request("/__state")).events, []);
  await reset();
  enabled = false;
  await server.preparePickupCheckout("test-cart");
  assert.deepEqual((await request("/__state")).events, []);
});
await test("Quantity/version conflict fails instead of overriding a newer checkout", async () => {
  const gateway = await pickupGateway("test-cart");
  const s = await gateway.read();
  await request("/__patch", { checkoutVersion: s.checkoutVersion + 1 });
  await assert.rejects(() => gateway.bill(billing, s), /409/);
});
await test("Retry interrupted original-address restore with stale pickup selection", async () => {
  await request("/__patch", {
    shipping: [
      {
        entityId: "original",
        address: { ...billing, customFields: [] },
        lineItemIds: ["item-1", "item-2"],
        availableShippingOptions: [],
        selectedShippingOption: null,
      },
    ],
  });
  await server.savePickupBilling("test-cart", billing, 1);
  await server.preparePickupCheckout("test-cart");
  const s = await request("/__state");
  s.shipping[0].address = { ...billing, customFields: [] };
  await request("/__patch", { shipping: s.shipping });
  await server.cleanupPickupCheckout("test-cart");
  const after = await request("/__state");
  assert.equal(after.shipping[0].address.address1, billing.address1);
  assert.equal(after.shipping[0].selectedShippingOption, null);
  assert.ok(after.events.includes("DeletePickupShipping"));
});
await test("Retry restore when deletion committed but address recreation failed", async () => {
  await request("/__patch", {
    shipping: [
      {
        entityId: "original",
        address: { ...billing, customFields: [] },
        lineItemIds: ["item-1", "item-2"],
        availableShippingOptions: [],
        selectedShippingOption: null,
      },
    ],
  });
  await server.savePickupBilling("test-cart", billing, 1);
  await server.preparePickupCheckout("test-cart");
  await request("/__patch", { config: { fail: "AddPickupShipping" } });
  await assert.rejects(() => server.cleanupPickupCheckout("test-cart"));
  assert.equal((await request("/__state")).shipping.length, 0);
  await server.cleanupPickupCheckout("test-cart");
  const after = await request("/__state");
  assert.equal(after.shipping[0].address.address1, billing.address1);
  assert.equal(after.shipping[0].selectedShippingOption, null);
});
console.log(`${count} Pickup HTTP simulation scenarios passed.`);
