#!/usr/bin/env node
// scripts/check-square-item.mjs — read-only Square catalog inspector.
// Searches for a catalog item by text and dumps its full raw object, so we can
// see whether Square stores any event metadata (date/time/address) on the item
// beyond the standard variations. Does NOT write anything to Square or Postgres.
//
// Usage:
//   node scripts/check-square-item.mjs ["search string"]
//   node scripts/check-square-item.mjs --find-link <short-code>
process.loadEnvFile('.env.local');

const SQUARE_VERSION = '2026-07-15';
const token = process.env.SQUARE_ACCESS_TOKEN;
if (!token) {
  console.error('Missing SQUARE_ACCESS_TOKEN in env. Aborting.');
  process.exit(1);
}

const headers = {
  'Square-Version': SQUARE_VERSION,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

// --- Mode 2: resolve a checkout short-code to its PaymentLink (+ order) -------
async function findLink(shortCode) {
  console.log(`Searching payment links for short-code "${shortCode}"...`);
  let cursor;
  let match;
  let pages = 0;
  do {
    const url = new URL('https://connect.squareup.com/v2/online-checkout/payment-links');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`list payment-links failed: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const data = await res.json();
    pages += 1;
    for (const link of data.payment_links || []) {
      if ((link.url || '').includes(shortCode) || (link.long_url || '').includes(shortCode)) {
        match = link;
        break;
      }
    }
    cursor = match ? undefined : data.cursor;
  } while (cursor);

  if (!match) {
    console.log(
      `\nNo PaymentLink found for this short-code — likely a Square Online storefront page, not a Checkout API artifact. (scanned ${pages} page${pages === 1 ? '' : 's'})`,
    );
    return;
  }

  console.log(`\nMatching PaymentLink (found on page ${pages}):`);
  console.log(JSON.stringify(match, null, 2));
  console.log(
    `\nquick_pay block: ${match.order_id ? 'no' : match.quick_pay ? 'yes' : 'none'} | order_id: ${match.order_id ?? '(none)'}`,
  );

  if (!match.order_id) return;

  const orderRes = await fetch(
    `https://connect.squareup.com/v2/orders/${match.order_id}`,
    { headers },
  );
  if (!orderRes.ok) {
    console.error(`retrieve order failed: ${orderRes.status} ${await orderRes.text()}`);
    process.exit(1);
  }
  const orderData = await orderRes.json();
  console.log(`\nOrder ${match.order_id}:`);
  console.log(JSON.stringify(orderData, null, 2));
  const lineItems = orderData.order?.line_items || [];
  console.log('\nLine items (catalog_object_id / item_type):');
  for (const li of lineItems) {
    console.log(`  ${li.catalog_object_id ?? '(none)'}  ${li.item_type ?? '(none)'}  — ${li.name ?? ''}`);
  }
}

// --- Mode 1: catalog item search + full object dump --------------------------
async function searchCatalog(search) {
  const searchRes = await fetch(
    'https://connect.squareup.com/v2/catalog/search-catalog-items',
    { method: 'POST', headers, body: JSON.stringify({ text_filter: search }) },
  );
  if (!searchRes.ok) {
    console.error(`search-catalog-items failed: ${searchRes.status} ${await searchRes.text()}`);
    process.exit(1);
  }
  const searchData = await searchRes.json();
  const items = searchData.items || [];
  console.log(`Matches for "${search}":`);
  for (const it of items) console.log(`  ${it.id}  ${it.item_data?.name ?? '(no name)'}`);
  if (items.length === 0) {
    console.log('No matching items.');
    return;
  }

  const id = items[0].id;
  const objRes = await fetch(
    `https://connect.squareup.com/v2/catalog/object/${id}?include_related_objects=true`,
    { headers },
  );
  if (!objRes.ok) {
    console.error(`retrieve object failed: ${objRes.status} ${await objRes.text()}`);
    process.exit(1);
  }
  const data = await objRes.json();
  console.log(`\nFull object for ${id}:`);
  console.log(JSON.stringify(data, null, 2));

  // Flag anything on item_data that isn't a standard field — that's where
  // event-like metadata (date/time/address) would hide.
  const known = new Set(['name', 'description', 'variations', 'category_id', 'image_ids']);
  const itemData = data.object?.item_data ?? {};
  const extra = Object.keys(itemData).filter((k) => !known.has(k));
  console.log(
    extra.length
      ? `\nNon-standard item_data fields present (possible event metadata): ${extra.join(', ')}`
      : '\nNo non-standard item_data fields beyond name/description/variations/category_id/image_ids.',
  );
}

async function main() {
  const args = process.argv.slice(2);
  const flagIdx = args.indexOf('--find-link');
  if (flagIdx !== -1) {
    const shortCode = args[flagIdx + 1];
    if (!shortCode) {
      console.error('Usage: node scripts/check-square-item.mjs --find-link <short-code>');
      process.exit(1);
    }
    await findLink(shortCode);
    return;
  }
  await searchCatalog(args[0] || 'Joe Kaplow');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
