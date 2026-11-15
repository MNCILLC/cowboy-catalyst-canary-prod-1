// Installed as an inline Script Manager script on the configured sandbox channel.
// The installer replaces __PICKUP_BILLING_CONFIG__ with non-secret configuration.
// This changes presentation only: it never clicks controls, edits addresses,
// submits forms, reads payment fields, or sends network requests.
(function pickupBillingVisibility(config) {
  "use strict";
  if (
    !config.allowedHosts?.includes(window.location.hostname) ||
    !/^\/checkout\/?$/.test(window.location.pathname) ||
    !config.pickupMethod
  )
    return;

  const marker = "data-pickup-billing-hidden";
  const styleId = "pickup-billing-visibility-style";
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `[${marker}="true"] { display: none !important; }`;
  document.head.appendChild(style);

  const clean = (value) =>
    (value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[,/]/g, "")
      .replace(/\s+/g, " ");
  function destination(root) {
    if (!root) return null;
    const fields = [
      ".address-line-1",
      ".locality",
      ".postal-code",
      ".country-name",
    ];
    const values = fields.map((selector) =>
      clean(root.querySelector(selector)?.textContent),
    );
    if (values.some((value) => !value)) return null;
    return JSON.stringify([
      ...values,
      clean(root.querySelector(".address-line-2")?.textContent),
    ]);
  }
  function restore(except) {
    document.querySelectorAll(`[${marker}]`).forEach((field) => {
      if (field !== except) field.removeAttribute(marker);
    });
  }
  function refresh() {
    try {
      const shipping = document.querySelector(".checkout-step--shipping");
      const billing = document.querySelector(".checkout-billing-form");
      const checkbox = billing?.querySelector(
        'input[data-test="billingSameAsShipping"]',
      );
      const field = checkbox?.closest(".form-field");
      const methods = shipping?.querySelectorAll(
        '[data-test="static-shipping-option"]',
      );
      const addresses = shipping?.querySelectorAll(
        '[data-test="static-address"]',
      );
      const shippingAddress =
        addresses?.length === 1 ? destination(addresses[0]) : null;
      const billingAddress = destination(
        billing?.querySelector(
          '[data-test="address-select-button"] [data-test="static-address"]',
        ),
      );
      const pickup =
        methods?.length === 1 &&
        clean(methods[0].querySelector(".shippingOption-desc")?.textContent) ===
          clean(config.pickupMethod);
      const editingShipping =
        shipping?.classList.contains("checkout-step--current") ||
        shipping?.querySelector(
          '[data-test="step-edit-button"][aria-expanded="true"]',
        );
      const hide =
        field &&
        checkbox?.type === "checkbox" &&
        !checkbox.checked &&
        pickup &&
        !editingShipping &&
        shippingAddress &&
        billingAddress &&
        shippingAddress !== billingAddress;

      // Unknown or incomplete state stays usable. Never hide a checked control.
      restore(hide ? field : null);
      if (hide && field.getAttribute(marker) !== "true")
        field.setAttribute(marker, "true");
    } catch {
      restore(null);
    }
  }
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      refresh();
    });
  }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "checked", "value", "aria-expanded"],
  });
  document.addEventListener("change", schedule, true);
  document.addEventListener("input", schedule, true);
  window.addEventListener("pageshow", schedule);
  // Property-only React updates need not produce DOM mutations. This local
  // fallback performs no I/O and also restores visibility after such updates.
  window.setInterval(refresh, 1000);
  refresh();
})(/*__PICKUP_BILLING_CONFIG__*/ {});
