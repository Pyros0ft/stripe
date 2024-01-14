const admin = require('firebase-admin');
const functions = require('firebase-functions');
const Stripe = require('stripe');
const { InvoicePayload, OrderItem } = require('./interfaces');
const logs = require('./logs');
const config = require('./config');
const { relevantInvoiceEvents } = require('./events');

const stripe = new Stripe(config.stripeSecretKey, {
  apiVersion: '2020-03-02',
  appInfo: {
    name: 'Firebase Invertase firestore-stripe-invoices',
    version: '0.2.3',
  },
});

admin.initializeApp();

const createInvoice = async function ({
  customer,
  orderItems,
  daysUntilDue,
  idempotencyKey,
  default_tax_rates = [],
  transfer_data,
  description = '',
}) {
  try {
    const itemPromises = orderItems.map((item, index) => {
      return stripe.invoiceItems.create(
        {
          customer: customer.id,
          unit_amount: item.amount,
          currency: item.currency,
          quantity: item.quantity ?? 1,
          description: item.description,
          tax_rates: item.tax_rates ?? [],
        },
        { idempotencyKey: `invoiceItems-create-${idempotencyKey}-${index}` }
      );
    });

    await Promise.all(itemPromises);

    const invoiceCreateParams = {
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: daysUntilDue,
      auto_advance: true,
      default_tax_rates,
      description,
    };
    if (transfer_data) invoiceCreateParams.transfer_data = transfer_data;
    const invoice = await stripe.invoices.create(
      invoiceCreateParams,
      { idempotencyKey: `invoices-create-${idempotencyKey}` }
    );
    logs.invoiceCreated(invoice.id, invoice.livemode);
    return invoice;
  } catch (e) {
    logs.stripeError(e);
    return null;
  }
};

exports.sendInvoice = functions.handler.firestore.document.onCreate(
  async (snap, context) => {
    try {
      const payload = snap.data();
      const daysUntilDue = payload.daysUntilDue || config.daysUntilDue;

      if (
        (payload.email && payload.uid) ||
        !(payload.email || payload.uid) ||
        !payload.items.length
      ) {
        logs.incorrectPayload(payload);
        return;
      }

      const eventId = context.eventId;

      logs.startInvoiceCreate();

      let email;

      if (payload.uid) {
        const user = await admin.auth().getUser(payload.uid);
        email = user.email;
      } else {
        email = payload.email;
      }

      if (!email) {
        logs.noEmailForUser(payload.uid);
        return;
      }

      let customers = await stripe.customers.list({ email });
      let customer;

      if (customers.data.length) {
        customer = customers.data.find(
          (cus) => cus.currency === payload.items[0].currency
        );
        if (customer) logs.customerRetrieved(customer.id, customer.livemode);
      }
      if (!customer) {
        customer = await stripe.customers.create(
          {
            email,
            metadata: {
              createdBy: 'Created by the Firebase Extension: Send Invoices using Stripe',
            },
          },
          { idempotencyKey: `customers-create-${eventId}` }
        );

        logs.customerCreated(customer.id, customer.livemode);
      }

      const invoice = await createInvoice({
        customer,
        orderItems: payload.items,
        daysUntilDue,
        idempotencyKey: eventId,
        default_tax_rates: payload.default_tax_rates,
        transfer_data: payload.transfer_data,
        description: payload.description,
      });

      if (invoice) {
        const finalizedInvoice = await stripe.invoices.sendInvoice(invoice.id, {
          idempotencyKey: `invoices-sendInvoice-${eventId}`,
        });
        if (finalizedInvoice.status === 'open') {
          logs.invoiceSent(
            finalizedInvoice.id,
            email,
            finalizedInvoice.hosted_invoice_url
          );
        } else {
          logs.invoiceCreatedError(finalizedInvoice);
        }

        await snap.ref.update({
          stripeInvoiceId: finalizedInvoice.id,
          stripeInvoiceUrl: finalizedInvoice.hosted_invoice_url,
          stripeInvoiceRecord: `https://dashboard.stripe.com${
            invoice.livemode ? '' : '/test'
          }/invoices/${finalizedInvoice.id}`,
        });
      } else {
        logs.invoiceCreatedError();
      }
    } catch (e) {
      logs.stripeError(e);
    }
    return;
  }
);

exports.updateInvoice = functions.handler.https.onRequest(
  async (req, resp) => {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers['stripe-signature'],
        config.stripeWebhookSecret
      );
    } catch (err) {
      logs.badSignature(err);
      resp.status(401).send('Webhook Error: Invalid Secret');
      return;
    }

    let invoice;
    let eventType;

    try {
      invoice = event.data.object;
      eventType = event.type;
    } catch (err) {
      logs.malformedEvent(event);
      resp.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (!relevantInvoiceEvents.has(eventType)) {
      logs.ignoreEvent(eventType);
      resp.json({ received: true });
      return;
    }

    logs.startInvoiceUpdate(eventType);

    const invoicesInFirestore = await admin
      .firestore()
      .collection(config.invoicesCollectionPath)
      .where('stripeInvoiceId', '==', invoice.id)
      .get();

    if (invoicesInFirestore.size !== 1) {
      logs.unexpectedInvoiceAmount(invoicesInFirestore.size, invoice.id);
      resp.status(500).send(`Invoice not found.`);
      return;
    }

    const invoiceStatus =
      eventType === 'invoice.payment_failed'
        ? 'payment_failed'
        : invoice.status;

    const doc = invoicesInFirestore.docs[0];
    await doc.ref.update({
      stripeInvoiceStatus: invoiceStatus,
      lastStripeEvent: eventType,
    });

    logs.statusUpdateComplete(invoice.id, invoiceStatus, eventType);

    resp.json({ received: true });
  }
);
