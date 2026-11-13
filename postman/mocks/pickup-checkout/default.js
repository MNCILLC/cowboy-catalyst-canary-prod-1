// Local synthetic GraphQL state. No live store credentials or customer data.
const http = require("node:http");
let state;
const blankAddress = {
  firstName: "Test",
  lastName: "Customer",
  email: "pickup@example.test",
  company: "",
  phone: "5550100100",
  address1: "100 Test Street",
  address2: "",
  city: "Austin",
  stateOrProvince: "Texas",
  stateOrProvinceCode: "TX",
  postalCode: "78701",
  countryCode: "US",
  customFields: [],
};
const pickup = {
  entityId: "fresh-pickup",
  description: "Pick up at warehouse",
  type: "shipping_pickupinstore",
  cost: { value: 0 },
};
function reset(config = {}) {
  state = {
    cartVersion: 1,
    checkoutVersion: 1,
    fields: [
      {
        entityId: 1,
        key: "freight_fulfillment",
        value: JSON.stringify({ fulfillmentMethod: "pickup", version: 1 }),
      },
    ],
    billing: null,
    shipping: [],
    items: [
      { entityId: "item-1", quantity: 2 },
      { entityId: "item-2", quantity: 1 },
    ],
    customerId: 7,
    events: [],
    config,
    ...config.state,
  };
}
reset();
http
  .createServer((req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (req.url === "/__reset") {
      reset(body);
      return send(200, {});
    }
    if (req.url === "/__state") return send(200, state);
    if (req.url === "/__patch") {
      Object.assign(state, body);
      return send(200, {});
    }
    if (req.url !== "/graphql" || req.method !== "POST")
      return send(501, { error: "Unmodeled endpoint" });
    if (req.headers.authorization !== "Bearer synthetic-token")
      return send(401, {});
    const { query, variables } = body;
    const op = query.match(/(?:query|mutation)\s+(\w+)/)?.[1];
    const input = variables?.input;
    const cartId =
      variables?.cartId || input?.cartEntityId || input?.checkoutEntityId;
    if (cartId && cartId !== "test-cart")
      return send(200, { errors: [{ message: "Unknown cart" }] });
    if (op === "PickupBillingChoices")
      return send(200, {
        data: {
          customer: {
            entityId: 7,
            email: blankAddress.email,
            firstName: "Test",
            lastName: "Customer",
            phone: "",
            addresses: {
              edges: (state.config.savedAddresses ?? []).map((node, index) => ({
                node: { entityId: index + 10, ...node },
              })),
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
          geography: { countries: [{ code: "US", name: "United States" }] },
        },
      });
    if (op === "PickupRecovery")
      return send(200, {
        data: {
          site: {
            cart: {
              lineItems: { physicalItems: state.items },
              metafields: {
                edges: state.fields
                  .filter((f) => f.key === "pickup_checkout")
                  .map((node) => ({ node })),
              },
            },
          },
        },
      });
    if (op === "PickupCheckoutQuery")
      return send(200, {
        data: {
          customer: { entityId: state.customerId, email: blankAddress.email },
          site: {
            cart: {
              entityId: "test-cart",
              version: state.cartVersion,
              lineItems: { physicalItems: state.items },
              metafields: { edges: state.fields.map((node) => ({ node })) },
            },
            checkout: {
              entityId: "test-cart",
              version: state.checkoutVersion,
              billingAddress: state.billing,
              shippingConsignments: state.shipping,
            },
          },
        },
      });
    state.events.push(op);
    if (state.config.fail === op) {
      state.config.fail = null;
      return send(503, { error: "Simulated upstream unavailable" });
    }
    if (
      [
        "CreatePickupMarker",
        "UpdatePickupMarker",
        "DeletePickupMarker",
      ].includes(op)
    ) {
      const name =
        op === "CreatePickupMarker"
          ? "createCartMetafield"
          : op === "UpdatePickupMarker"
            ? "updateCartMetafield"
            : "deleteCartMetafield";
      const existing = state.fields.find((f) => f.key === "pickup_checkout");
      if (op === "CreatePickupMarker" && existing)
        return send(200, {
          data: {
            cart: {
              [name]: { errors: [{ __typename: "AlreadyExistsError" }] },
            },
          },
        });
      if (op === "DeletePickupMarker")
        state.fields = state.fields.filter((f) => f !== existing);
      else {
        const field = { entityId: 2, ...input.data };
        state.fields = state.fields
          .filter((f) => f.key !== "pickup_checkout")
          .concat(field);
      }
      state.cartVersion++;
      return send(200, {
        data: {
          cart: {
            [name]: {
              errors: [],
              metafield: state.fields.find((f) => f.key === "pickup_checkout"),
            },
          },
        },
      });
    }
    if (op === "AssignPickupCart") {
      if (input.version !== state.cartVersion) return send(409, {});
      state.shipping = [];
      state.billing = null;
      state.cartVersion++;
      state.checkoutVersion++;
      return send(200, {
        data: {
          cart: { assignCartToCustomer: { cart: { entityId: "test-cart" } } },
        },
      });
    }
    if (input?.version !== state.checkoutVersion)
      return send(409, { error: "Stale checkout" });
    const methods = {
      AddPickupBilling: "addCheckoutBillingAddress",
      UpdatePickupBilling: "updateCheckoutBillingAddress",
      AddPickupShipping: "addCheckoutShippingConsignments",
      UpdatePickupShipping: "updateCheckoutShippingConsignment",
      SelectPickupShipping: "selectCheckoutShippingOption",
      DeletePickupShipping: "deleteCheckoutConsignment",
    };
    if (!methods[op]) return send(501, { error: `Unmodeled operation: ${op}` });
    if (op.includes("Billing")) {
      if (input.data.address.shouldSaveAddress !== false)
        return send(400, { error: "Address book writes forbidden" });
      state.billing = {
        ...blankAddress,
        ...input.data.address,
        entityId: "bill-1",
      };
    } else if (op === "AddPickupShipping" || op === "UpdatePickupShipping") {
      const c = input.data.consignment || input.data.consignments[0];
      if (c.address.shouldSaveAddress !== false)
        return send(400, { error: "Address book writes forbidden" });
      let options = [pickup];
      if (state.config.noOption) options = [];
      if (state.config.paidOption)
        options = [{ ...pickup, cost: { value: 10 } }];
      if (state.config.ambiguousOption)
        options = [pickup, { ...pickup, entityId: "other-pickup" }];
      state.shipping = [
        {
          entityId: "consignment-1",
          address: { ...blankAddress, ...c.address },
          lineItemIds: c.lineItems.map((i) => i.lineItemEntityId),
          availableShippingOptions: options,
          selectedShippingOption:
            op === "UpdatePickupShipping"
              ? (state.shipping[0]?.selectedShippingOption ?? null)
              : null,
        },
      ];
      if (state.config.changeQuantity) {
        state.items[0].quantity++;
        state.config.changeQuantity = false;
      }
      if (state.config.switchToShip) {
        state.fields[0].value = JSON.stringify({
          fulfillmentMethod: "ship",
          version: 2,
        });
        state.config.switchToShip = false;
      }
    } else if (op === "SelectPickupShipping") {
      const c = state.shipping.find(
        (c) => c.entityId === input.consignmentEntityId,
      );
      c.selectedShippingOption = c.availableShippingOptions.find(
        (o) => o.entityId === input.data.shippingOptionEntityId,
      );
    } else if (op === "DeletePickupShipping")
      state.shipping = state.shipping.filter(
        (c) => c.entityId !== input.consignmentEntityId,
      );
    state.checkoutVersion++;
    if (state.config.failAfter === op) {
      state.config.failAfter = null;
      return send(503, { error: "Committed then response failed" });
    }
    return send(200, {
      data: {
        checkout: { [methods[op]]: { checkout: { entityId: "test-cart" } } },
      },
    });
  })
  .listen(process.env.PORT);
