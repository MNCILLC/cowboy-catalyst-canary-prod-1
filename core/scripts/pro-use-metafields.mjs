import dotenv from 'dotenv';
import { parseArgs } from 'node:util';

dotenv.config({ path: ['.env.local', '../.env.local'], quiet: true });

const { values } = parseArgs({
  options: {
    setup: { type: 'boolean', default: false },
    'product-id': { type: 'string' },
    'customer-id': { type: 'string' },
    certified: { type: 'string' },
    expiration: { type: 'string' },
  },
});
const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
const token = process.env.BIGCOMMERCE_ACCESS_TOKEN;

if (!storeHash || !token) throw new Error('BigCommerce Management API credentials are required.');

const positiveId = (value) => {
  if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error('A positive entity ID is required.');
  }

  return value;
};

// Validate the entire command before writing anything.
if (values['product-id']) positiveId(values['product-id']);

if (values['customer-id']) {
  positiveId(values['customer-id']);

  if (!['true', 'false'].includes(values.certified)) {
    throw new Error('--certified must be true or false when setting a customer.');
  }
} else if (values.certified !== undefined || values.expiration !== undefined) {
  throw new Error('--customer-id is required for certification fields.');
}

if (values.expiration === '') throw new Error('Expiration must be a nonempty informational value.');

if (!values.setup && !values['product-id'] && !values['customer-id']) {
  throw new Error('Specify --setup, --product-id, or --customer-id.');
}

async function request(path, method = 'GET', body = null) {
  const response = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v3/${path}`, {
    method,
    headers: {
      'X-Auth-Token': token,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) throw new Error(`BigCommerce metafield ${method} failed (${response.status}).`);

  return response.json();
}

async function upsert(resource, namespace, key, value, permissionSet) {
  const path = `${resource}/metafields`;
  const query = new URLSearchParams({ namespace, key, limit: '250' });
  const { data } = await request(`${path}?${query}`);
  const existing = data.find((field) => field.namespace === namespace && field.key === key);
  const body = { namespace, key, value, permission_set: permissionSet };

  if (!existing || existing.value !== value || existing.permission_set !== permissionSet) {
    // Store metafields use bulk create/update; product and customer endpoints use a single object.
    if (resource === 'store') {
      await request(path, existing ? 'PUT' : 'POST', [
        { ...body, ...(existing ? { id: existing.id } : {}) },
      ]);
    } else {
      await request(existing ? `${path}/${existing.id}` : path, existing ? 'PUT' : 'POST', body);
    }
  }

  const verified = await request(`${path}?${query}`);

  if (
    !verified.data.some(
      (field) =>
        field.namespace === namespace &&
        field.key === key &&
        field.value === value &&
        field.permission_set === permissionSet,
    )
  ) {
    throw new Error(`Verification failed for ${namespace}.${key}.`);
  }

  // eslint-disable-next-line no-console
  console.log(`Verified ${resource}: ${namespace}.${key} = ${value}`);
}

if (values.setup) {
  await upsert(
    'store',
    'custom_site',
    'pro_use_message',
    '<h3>Pro Use Cert Required</h3>',
    'write',
  );
}

if (values['product-id']) {
  await upsert(
    `catalog/products/${values['product-id']}`,
    'custom_product',
    'pro_use_only',
    'true',
    'write_and_sf_access',
  );
}

if (values['customer-id']) {
  const resource = `customers/${values['customer-id']}`;

  // Customer certification is admin-managed and never storefront-writable.
  await upsert(resource, 'custom_customer', 'is_pro_use', values.certified, 'write');

  if (values.expiration !== undefined) {
    await upsert(
      resource,
      'custom_customer',
      'pro_use_cert_expiration',
      values.expiration,
      'write',
    );
  }
}
