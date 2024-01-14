const { logger } = require('firebase-functions');
const Stripe = require('stripe');
const { InvoicePayload } = require('./interfaces');

function startInvoiceCreate() {
  logger.log('🙂 Received new invoice, starting processing');
}

function startInvoiceUpdate(eventType) {
  logger.log(`🙂 Received new invoice event ${eventType}, starting processing`);
}

function incorrectPayload(payload) {
  if (!payload.items.length) {
    logger.error(
      new Error('😞[Error] Missing at least one line item in items[]')
    );
  }
  if (!payload.email && !payload.uid) {
    logger.error(
      new Error(
        '😞[Error] Missing either a customer email address or Firebase Authentication uid'
      )
    );
  }
  if (payload.email && payload.uid) {
    logger.error(
      new Error(
        '😞[Error] Only either email or uid is permitted, you specified both.'
      )
    );
  }
}

function noEmailForUser(uid) {
  logger.error(
    new Error(`😞[Error] User [${uid}] is missing an email address.`)
  );
}

function stripeError(err) {
  logger.error(
    new Error('😞[Error] Error when making a request to the Stripe API:'),
    err
  );
}

function invoiceCreatedError(invoice) {
  logger.error(
    new Error('😞[Error] Error when creating the invoice:'),
    invoice
  );
}

function customerCreated(id, livemode) {
  logger.log(
    `👤 Created a new customer: https://dashboard.stripe.com${
      livemode ? '' : '/test'
    }/customers/${id}`
  );
}

function customerRetrieved(id, livemode) {
  logger.log(
    `🙋 Found existing customer by email: https://dashboard.stripe.com${
      livemode ? '' : '/test'
    }/customers/${id}`
  );
}

function invoiceCreated(id, livemode) {
  logger.log(
    `🧾 Created invoice: https://dashboard.stripe.com${
      livemode ? '' : '/test'
    }/invoices/${id}`
  );
}

function invoiceSent(id, email, hostedInvoiceUrl) {
  logger.log(`📧 Sent invoice ${id} to ${email}: ${hostedInvoiceUrl}`);
}

function badSignature(err) {
  logger.error(
    '😞[Error] Webhook signature verification failed. Is your Stripe webhook secret parameter configured correctly?',
    err
  );
}

function malformedEvent(event) {
  let err;

  if (!event?.data?.object) {
    err = new Error('Could not find event.data.object');
  } else if (!event?.type) {
    err = new Error('Could not find event.type');
  }

  logger.error('😞[Error] Malformed event', err);
}

function ignoreEvent(eventType) {
  logger.log(
    `🙈 Ignoring event "${eventType}" because it because it isn't a relevant part of the invoice lifecycle`
  );
}

function unexpectedInvoiceAmount(numInvoices, invoiceId) {
  logger.error(
    '😞[Error] could not find invoice',
    new Error(
      `Expected 1 invoice with ID "${invoiceId}", but found ${numInvoices}`
    )
  );
}

function statusUpdateComplete(invoiceId, newStatus, eventType) {
  logger.log(
    `🙂 Updated invoice "${invoiceId}" to status "${newStatus}" on event type "${eventType}"`
  );
}

module.exports = {
  startInvoiceCreate,
  startInvoiceUpdate,
  incorrectPayload,
  noEmailForUser,
  stripeError,
  invoiceCreatedError,
  customerCreated,
  customerRetrieved,
  invoiceCreated,
  invoiceSent,
  badSignature,
  malformedEvent,
  ignoreEvent,
  unexpectedInvoiceAmount,
  statusUpdateComplete,
};
