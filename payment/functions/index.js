/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.secret_key);

admin.initializeApp();

exports.handlePayment = functions.https.onRequest(async (req, res) => {
  try {
    // Extract user ID and payment token from the request
    const { userId, token } = req.body;

    // Retrieve user details from Firestore
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      res.status(404).send('User not found');
      return;
    }

    // Create a new customer in Stripe
    const customer = await stripe.customers.create({
      email: userData.email,
      source: token,
    });

    // Charge the customer (you may customize this based on your requirements)
    const charge = await stripe.charges.create({
      amount: 1000, // Example amount in cents
      currency: 'usd',
      customer: customer.id,
      description: 'Example Payment',
    });

    // Save payment details in Firestore (you may customize this based on your requirements)
    await admin.firestore().collection('payments').add({
      userId,
      amount: charge.amount,
      paymentMethod: charge.payment_method,
      paymentIntent: charge.payment_intent,
      paymentStatus: charge.status,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send('Payment successful!');
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).send('Error processing payment');
  }
});
