const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.Stripe_Test_KEY);

const port = process.env.PORT || 5200;

//middleware
app.use(cors());
app.use(express.json());

console.log(process.env.ACCESS_TOKEN_SECRET);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xyn8hrw.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const serviceCollection = client.db("kidsDB").collection("services");
    const reviewCollection = client.db("kidsDB").collection("reviews");
    const nanniesCollection = client.db("kidsDB").collection("nannies");
    const bookingCollection = client.db("kidsDB").collection("bookings");
    const userCollection = client.db("kidsDB").collection("users");
    const paymentCollection = client.db("kidsDB").collection("payments");

    //jwt api
    app.post("/jwt", (req, res) => {
      try {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "2h",
        });
        res.send(token);
      } catch (err) {
        console.error("Error generating token", err);
        res.status(500).send({ err: true, message: "Internal Server Error" });
      }
    });

    const verifyToken = (req, res, next) => {
      const authorization = req.headers.authorization;
      if (!authorization) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorised access" });
      }

      //extracting the token from authorization header
      const token = authorization.split(" ")[1];

      //token verification
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ err: true, message: "invalid token" });
        }

        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      try {
        const email = req.decoded.email;
        const query = { email: email };
        const user = await userCollection.findOne(query);
        if (user?.role !== "admin") {
          res.status(403).send({ error: true, message: "Access Denied" });
        } else {
          next();
        }
      } catch (error) {
        console.error("Error verifying Admin", error);
        res.status(500).send({ error: true, message: "internal server error" });
      }
    };

    // users api
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", verifyToken, async (req, res) => {
      const user = req.body;
      console.log(user);
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      console.log("old user", existingUser);
      if (existingUser) {
        return res.send({ message: "Already an user" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateRole = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updateRole);
        res.send(result);
      }
    );

    //services api
    app.get("/services", async (req, res) => {
      const result = await serviceCollection.find().toArray();
      res.send(result);
    });

    app.post("/services", verifyToken, verifyAdmin, async (req, res) => {
      const newService = req.body;
      const result = await serviceCollection.insertOne(newService);
      res.send(result);
    });

    app.delete("/services/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await serviceCollection.deleteOne(query);
      res.send(result);
    });

    //reviews
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    app.post("/reviews", async (req, res) => {
      const newReview = req.body;
      const result = await reviewCollection.insertOne(newReview);
      res.send(result);
    });

    //nannies api
    app.get("/nannies", async (req, res) => {
      const result = await nanniesCollection.find().toArray();
      res.send(result);
    });

    //bookings collection

    app.get("/bookings", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/bookings", async (req, res) => {
      const bookingPackage = req.body;
      const result = await bookingCollection.insertOne(bookingPackage);
      res.send(result);
    });

    app.get("/allbookings", verifyToken, verifyAdmin, async (req, res) => {
      const allBookings = await bookingCollection.find().toArray();
      res.send(allBookings);
    });

    app.post("/allbookings", verifyToken, async (req, res) => {
      const bookings = req.body;
      console.log(bookings);
      const query = { status: bookings.status };
      const booked = await bookingCollection.findOne(query);
      console.log("BOOKED", booked);
      if (booked) {
        return res.send({ message: "already exists" });
      }
      const result = await bookingCollection.insertOne(bookings);
      res.send(result);
    });

    app.get("/allbookings/status/:id", async (req, res) => {
      const _id = req.params._id;
      const query = { _id: _id };
      const bookings = await bookingCollection.findOne(query);
      const result = { status: bookings?.status === req.body.status };
      res.send(result);
    });

    app.patch(
      "/allbookings/status/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: req.body.status,
          },
        };
        const result = await bookingCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    //stripe-payment

    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = price;
      console.log(amount);
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (err) {
        console.error("Error creating payment intent", err);
        res.status(500).send({ err: true, message: "Internal Server Error" });
      }
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = {
        _id: { $in: payment.bookedServices.map((id) => new ObjectId(id)) },
      };
      res.send({ insertResult });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("kids are running");
});

app.listen(port, () => {
  console.log(`Kid's nanny server is live on port No, ${port}`);
});
