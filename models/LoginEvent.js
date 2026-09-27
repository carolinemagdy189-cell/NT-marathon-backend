const mongoose = require("mongoose");

/** One document per successful login (for "who entered the website today"). */
const loginEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    loginAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { versionKey: false }
);

const LoginEvent = mongoose.model("LoginEvent", loginEventSchema);

module.exports = LoginEvent;
