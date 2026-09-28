const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  mongoose.set("strictQuery", true);

  try {
    console.log("🔌 Attempting MongoDB connection...");
    console.log("MongoDB URI exists:", !!uri);
    console.log("MongoDB URI starts with:", uri.substring(0, 20));

    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      family: 4,
    });

    console.log(
      `✅ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`
    );

    return conn;
  } catch (error) {
    console.error("❌ MongoDB CONNECTION FAILED");
    console.error("Name:", error.name);
    console.error("Message:", error.message);

    if (error.reason) {
      console.error("Reason:", error.reason);
    }

    throw error;
  }
};

module.exports = connectDB;