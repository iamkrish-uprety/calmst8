// Turns a paid Stripe Checkout Session into an order, and the order into emails.
const LEAD_DAYS = 14;

export function buildOrder(session, catalog) {
  const currency = (session.currency || catalog.currency).toUpperCase();
  const money = pence => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format((pence || 0) / 100);

  const items = (session.metadata?.items || '').split('|').filter(Boolean).map(entry => {
    const [id, size, qty] = entry.split(':');
    const product = catalog.products.find(p => p.id === id) || { name: id, colour: '', price: 0 };
    const quantity = Number(qty) || 1;
    return { id, name: product.name, colour: product.colour, size, qty: quantity, lineTotal: money(product.price * quantity) };
  });

  const created = new Date((session.created || Date.now() / 1000) * 1000);
  const deliverBy = new Date(created.getTime() + LEAD_DAYS * 864e5);
  const customer = session.customer_details || {};
  // Newer Stripe API versions moved shipping details under collected_information.
  const ship = session.collected_information?.shipping_details || session.shipping_details || { name: customer.name, address: customer.address };

  return {
    number: `C8-${created.toISOString().slice(2, 10).replace(/-/g, '')}-${session.id.slice(-5).toUpperCase()}`,
    sessionId: session.id,
    paymentIntent: session.payment_intent || '',
    live: session.livemode === true,
    createdAt: created.toISOString(),
    deliverBy: deliverBy.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    items,
    subtotalFormatted: money(session.amount_subtotal),
    shippingFormatted: money(session.shipping_cost?.amount_total ?? session.total_details?.amount_shipping),
    totalFormatted: money(session.amount_total),
    customer: { name: customer.name || ship?.name || '', email: customer.email || '', phone: customer.phone || '' },
    shipTo: { name: ship?.name || customer.name || '', lines: addressLines(ship?.address) },
  };
}

export function orderEmails(order, env) {
  const from = { email: env.FROM_EMAIL, name: 'CALMST8' };
  const count = order.items.reduce((n, i) => n + i.qty, 0);
  const itemsLabel = `${count} ${count === 1 ? 'item' : 'items'}`;
  const dashboard = order.paymentIntent
    ? `https://dashboard.stripe.com/${order.live ? '' : 'test/'}payments/${order.paymentIntent}`
    : '';
  const emails = [];

  // Owner: the full receipt, ready to forward to the warehouse if no warehouse address is set.
  emails.push({
    from, to: env.OWNER_EMAIL,
    replyTo: order.customer.email || undefined,
    subject: `New order ${order.number}: ${itemsLabel}, ${order.totalFormatted}`,
    text: [
      `New paid order ${order.number}${order.live ? '' : ' (TEST MODE)'}`,
      '',
      ...order.items.map(i => `${i.qty} × ${i.name}, ${i.colour}, size ${i.size}: ${i.lineTotal}`),
      '',
      `Subtotal: ${order.subtotalFormatted}`, `Delivery: ${order.shippingFormatted}`, `Total paid: ${order.totalFormatted}`,
      '',
      `Customer: ${order.customer.name}`, `Email: ${order.customer.email}`, `Phone: ${order.customer.phone || 'not given'}`,
      '', 'Ship to:', order.shipTo.name, ...order.shipTo.lines,
      '', `Promised delivery: about 2 weeks, by ${order.deliverBy}.`,
      env.WAREHOUSE_EMAIL ? `A production copy was sent to the warehouse (${env.WAREHOUSE_EMAIL}).` : 'Forward this email to the warehouse to start production.',
      dashboard ? `Payment in Stripe: ${dashboard}` : '',
    ].join('\n'),
    html: layout(`New order ${order.number}`, `
      ${order.live ? '' : '<p style="background:#fff3cd;padding:8px 12px">Test mode: no real money was taken.</p>'}
      ${itemsTable(order, true)}
      ${totals(order)}
      ${block('Customer', [order.customer.name, order.customer.email, order.customer.phone || 'Phone not given'])}
      ${block('Ship to', [order.shipTo.name, ...order.shipTo.lines])}
      <p>Promised delivery: about 2 weeks, by <strong>${esc(order.deliverBy)}</strong>.</p>
      <p>${env.WAREHOUSE_EMAIL ? `A production copy was sent to the warehouse (${esc(env.WAREHOUSE_EMAIL)}).` : '<strong>Forward this email to the warehouse to start production.</strong>'}</p>
      ${dashboard ? `<p><a href="${esc(dashboard)}">View the payment in Stripe</a></p>` : ''}`),
  });

  // Warehouse: what to make and where to send it. No prices.
  if (env.WAREHOUSE_EMAIL) {
    emails.push({
      from, to: env.WAREHOUSE_EMAIL,
      replyTo: env.OWNER_EMAIL,
      subject: `Production order ${order.number}: ${itemsLabel}, deliver by ${order.deliverBy}`,
      text: [
        `Production order ${order.number}${order.live ? '' : ' (TEST, do not make)'}`, '',
        ...order.items.map(i => `${i.qty} × ${i.name}, ${i.colour}, size ${i.size}`),
        '', 'Ship to:', order.shipTo.name, ...order.shipTo.lines, order.customer.phone ? `Phone: ${order.customer.phone}` : '',
        '', `Customer must receive it by ${order.deliverBy}.`, 'Reply to this email with questions about this order.',
      ].join('\n'),
      html: layout(`Production order ${order.number}`, `
        ${order.live ? '' : '<p style="background:#fff3cd;padding:8px 12px">Test order: do not make.</p>'}
        ${itemsTable(order, false)}
        ${block('Ship to', [order.shipTo.name, ...order.shipTo.lines, order.customer.phone ? `Phone: ${order.customer.phone}` : ''])}
        <p>The customer must receive this by <strong>${esc(order.deliverBy)}</strong>.</p>
        <p>Reply to this email with questions about this order.</p>`),
    });
  }

  // Customer: confirmation with the delivery promise.
  if (order.customer.email) {
    emails.push({
      from, to: order.customer.email,
      replyTo: env.OWNER_EMAIL,
      subject: `Your CALMST8 order ${order.number}`,
      text: [
        `Thank you${order.customer.name ? `, ${order.customer.name.split(' ')[0]}` : ''}. Your order ${order.number} is confirmed.`, '',
        ...order.items.map(i => `${i.qty} × ${i.name}, ${i.colour}, size ${i.size}: ${i.lineTotal}`),
        '', `Total paid: ${order.totalFormatted}`,
        '', 'Your order will arrive in about 2 weeks, by ' + order.deliverBy + '.',
        '', 'Delivering to:', order.shipTo.name, ...order.shipTo.lines,
        '', 'Questions? Reply to this email or message @calmst8.world on Instagram.',
      ].join('\n'),
      html: layout('Your order is confirmed', `
        <p>Thank you${order.customer.name ? `, ${esc(order.customer.name.split(' ')[0])}` : ''}. Order <strong>${esc(order.number)}</strong> is confirmed.</p>
        ${itemsTable(order, true)}
        ${totals(order)}
        <p>Your order will arrive in about 2 weeks, by <strong>${esc(order.deliverBy)}</strong>.</p>
        ${block('Delivering to', [order.shipTo.name, ...order.shipTo.lines])}
        <p>Questions? Reply to this email or message <a href="https://www.instagram.com/calmst8.world/">@calmst8.world</a> on Instagram.</p>`),
    });
  }
  return emails;
}

function addressLines(a) {
  if (!a) return [];
  return [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', '), a.postal_code, a.country].filter(Boolean);
}

function itemsTable(order, withPrices) {
  const rows = order.items.map(i => `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #ddd">${esc(i.name)}<br><span style="color:#6a6965">${esc(i.colour)}</span></td>
    <td style="padding:10px 12px;border-bottom:1px solid #ddd">Size ${esc(i.size)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #ddd">× ${i.qty}</td>
    ${withPrices ? `<td style="padding:10px 0;border-bottom:1px solid #ddd;text-align:right">${esc(i.lineTotal)}</td>` : ''}
  </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>`;
}

function totals(order) {
  return `<p style="text-align:right;line-height:1.8">Subtotal ${esc(order.subtotalFormatted)}<br>Delivery ${esc(order.shippingFormatted)}<br><strong>Total ${esc(order.totalFormatted)}</strong></p>`;
}

function block(title, lines) {
  return `<p><strong>${esc(title)}</strong><br>${lines.filter(Boolean).map(esc).join('<br>')}</p>`;
}

function layout(title, body) {
  return `<!doctype html><html><body style="margin:0;background:#e3e2de;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#151515;font-size:15px;line-height:1.6">
  <div style="max-width:560px;margin:0 auto;background:#edece9;padding:32px">
    <p style="font-family:Georgia,serif;font-size:24px;letter-spacing:1px;margin:0 0 24px">CALMST8</p>
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 8px">${esc(title)}</h1>
    ${body}
  </div></body></html>`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
