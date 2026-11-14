const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
// Supply the temporary test dependency via NODE_PATH; no storefront dependency.
const { JSDOM } = require("jsdom");
const source = fs.readFileSync(
  path.join(__dirname, "pickup-billing-visibility.js"),
  "utf8",
);
const config = {
  allowedHosts: ["sandbox.example.test"],
  pickupMethod: "Pick up at warehouse",
};
const compiled = source.replace(
  /\/\*__PICKUP_BILLING_CONFIG__\*\/\s*\{\}/,
  JSON.stringify(config),
);
function address(street) {
  return `<div data-test="static-address"><span class="address-line-1">${street}</span><span class="locality">City, </span><span class="postal-code">12345 / </span><span class="country-name">United States</span></div>`;
}
function fixture({
  method = "Pick up at warehouse",
  checked = false,
  billing = "100 Billing St",
  editing = false,
  shipping = "200 Warehouse Rd",
} = {}) {
  return `<div class="checkout-step--shipping ${editing ? "checkout-step--current" : ""}">${address(shipping)}<div data-test="static-shipping-option"><span class="shippingOption-desc">${method}</span></div></div><div class="checkout-billing-form"><div class="form-field"><input type="checkbox" name="billingSameAsShipping" data-test="billingSameAsShipping" ${checked ? "checked" : ""}><label>Same as shipping address</label></div>${billing ? `<a data-test="address-select-button">${address(billing)}</a>` : ""}</div>`;
}
function setup(options = {}, host = "sandbox.example.test") {
  const dom = new JSDOM(
    `<!doctype html><head></head><body>${fixture(options)}</body>`,
    {
      url: `https://${host}/checkout`,
      runScripts: "outside-only",
      pretendToBeVisual: true,
    },
  );
  const observers = [];
  const Observer = dom.window.MutationObserver;
  dom.window.MutationObserver = class extends Observer {
    constructor(callback) {
      super(callback);
      observers.push(this);
    }
  };
  let refresh;
  dom.window.setInterval = (fn) => {
    refresh = fn;
    return 1;
  };
  dom.window.fetch = () => {
    throw Error("Network access forbidden");
  };
  dom.window.eval(compiled);
  return {
    dom,
    close: () => {
      observers.forEach((o) => o.disconnect());
      dom.window.close();
    },
    doc: dom.window.document,
    refresh: () => refresh?.(),
    hidden: () =>
      !!dom.window.document.querySelector(
        '[data-pickup-billing-hidden="true"]',
      ),
  };
}
function scenario(name, options, expected) {
  test(name, () => {
    const s = setup(options);
    try {
      assert.equal(s.hidden(), expected);
      assert.equal(
        s.doc.querySelector("input").checked,
        options.checked ?? false,
      );
    } finally {
      s.close();
    }
  });
}
scenario(
  "Pickup with distinct billing hides only the unchecked control",
  {},
  true,
);
scenario("Shipping keeps the control visible", { method: "Flat rate" }, false);
scenario(
  "Checked control is never hidden or toggled",
  { checked: true },
  false,
);
scenario("Missing billing remains visible", { billing: null }, false);
scenario(
  "Warehouse copied into billing remains visible",
  { billing: "200 Warehouse Rd" },
  false,
);
scenario("Editing Shipping restores the control", { editing: true }, false);
scenario(
  "Similar method name is not considered Pickup",
  { method: "Pick up at warehouse express" },
  false,
);
scenario(
  "Method whitespace and case normalize safely",
  { method: "  PICK UP AT WAREHOUSE  " },
  true,
);
test("Switch Pickup → Ship → Pickup without changing checkbox state", () => {
  const s = setup();
  try {
    const label = s.doc.querySelector(".shippingOption-desc");
    label.textContent = "Flat rate";
    s.refresh();
    assert.equal(s.hidden(), false);
    label.textContent = config.pickupMethod;
    s.refresh();
    assert.equal(s.hidden(), true);
    assert.equal(s.doc.querySelector("input").checked, false);
  } finally {
    s.close();
  }
});
test("React node replacement receives the rule; unrelated controls stay visible", () => {
  const s = setup();
  try {
    s.doc.body.innerHTML =
      fixture() +
      '<div class="form-field"><input id="terms" type="checkbox"></div>';
    s.refresh();
    assert.equal(s.hidden(), true);
    assert.equal(
      s.doc
        .querySelector("#terms")
        .parentElement.hasAttribute("data-pickup-billing-hidden"),
      false,
    );
  } finally {
    s.close();
  }
});
test("Property-only checkbox changes restore visibility", () => {
  const s = setup();
  try {
    s.doc.querySelector("input").checked = true;
    s.refresh();
    assert.equal(s.hidden(), false);
    assert.equal(s.doc.querySelector("input").checked, true);
  } finally {
    s.close();
  }
});
test("Multiple shipping destinations fail open", () => {
  const s = setup();
  try {
    s.doc
      .querySelector(".checkout-step--shipping")
      .insertAdjacentHTML("beforeend", address("Other Destination"));
    s.refresh();
    assert.equal(s.hidden(), false);
  } finally {
    s.close();
  }
});
test("Unrecognized markup restores visibility", () => {
  const s = setup();
  try {
    s.doc.querySelector(".shippingOption-desc").remove();
    s.refresh();
    assert.equal(s.hidden(), false);
  } finally {
    s.close();
  }
});
test("Production hostname has no effect", () => {
  const s = setup({}, "production.example.test");
  try {
    assert.equal(s.hidden(), false);
    assert.equal(s.doc.querySelector("style"), null);
  } finally {
    s.close();
  }
});
test("Duplicate loading installs once", () => {
  const s = setup();
  try {
    s.dom.window.eval(compiled);
    assert.equal(
      s.doc.querySelectorAll("#pickup-billing-visibility-style").length,
      1,
    );
  } finally {
    s.close();
  }
});
test("MutationObserver responds to rendered method changes", async () => {
  const s = setup();
  try {
    s.doc.querySelector(".shippingOption-desc").textContent = "Flat rate";
    await new Promise((resolve) =>
      s.dom.window.requestAnimationFrame(() =>
        s.dom.window.requestAnimationFrame(resolve),
      ),
    );
    assert.equal(s.hidden(), false);
  } finally {
    s.close();
  }
});

test("Unselected dropdown addresses never count as selected billing", () => {
  const s = setup({ billing: null });
  try {
    s.doc
      .querySelector(".checkout-billing-form")
      .insertAdjacentHTML(
        "beforeend",
        `<ul id="addressDropdown"><li>${address("100 Billing St")}</li></ul>`,
      );
    s.refresh();
    assert.equal(s.hidden(), false);
  } finally {
    s.close();
  }
});
test("Opening address menu preserves the selected billing decision", () => {
  const s = setup({ billing: "200 Warehouse Rd" });
  try {
    s.doc
      .querySelector(".checkout-billing-form")
      .insertAdjacentHTML(
        "afterbegin",
        `<ul id="addressDropdown"><li>${address("100 Billing St")}</li></ul>`,
      );
    s.refresh();
    assert.equal(s.hidden(), false);
  } finally {
    s.close();
  }
});
