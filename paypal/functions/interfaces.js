// Define your interfaces here
// Example: InvoicePayload and OrderItem
// Modify or extend as per your requirements

// interfaces.js
// Example interfaces for illustration purposes

// InvoicePayload interface
exports.InvoicePayload = {
  email: String,
  uid: String,
  items: [OrderItem],
  daysUntilDue: Number,
  default_tax_rates: [String],
  transfer_data: {
    destination: String,
    amount: Number,
  },
  description: String,
};

// OrderItem interface
exports.OrderItem = {
  amount: Number,
  currency: String,
  quantity: Number,
  description: String,
  tax_rates: [String],
};
