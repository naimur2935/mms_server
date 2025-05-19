const express = require('express');
const cors = require("cors");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Middleware to verify token
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ message: "Forbidden" });
    req.user = decoded; // { email, role }
    next();
  });
};


async function run() {
  try {
    await client.connect();

    const database = client.db("meal-managements");
    const allUsers = database.collection("users");
    const allMeals = database.collection("meals");
    const allBills = database.collection("bills");
    const allCosts = database.collection("costs");


    // All users routes

    // 🔐 Register user with encrypted password
    app.post("/Users", async (req, res) => {
      const { email, password } = req.body;
      const query = { email };
      const userExists = await allUsers.findOne(query);

      if (userExists) {
        return res.status(409).send({ message: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await allUsers.insertOne({
        ...req?.body,
        password: hashedPassword,
      });

      res.send(result);
    });

    // 🔐 Login route with JWT
    app.post("/login", async (req, res) => {
      const { email, password } = req.body;
      const user = await allUsers.findOne({ email });
      console.log(req.body)
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).send({ message: "Invalid credentials" });
      }

      // ✅ Generate JWT token
      const token = jwt.sign(
        { email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.send({
        message: "Login successful",
        token,
        user
      });
    });

    app.get("/Users", async (req, res) => {
      const result = await allUsers.find().toArray();
      res.send(result);
    });

    app.get("/Users/:email", async (req, res) => {
      const query = { email: req.params.email };
      const result = await allUsers.findOne(query);
      res.send(result);
    });

    app.get("/auth", verifyJWT, async (req, res) => {
      const user = await allUsers.findOne({ email: req.user.email });

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }
      const { password, ...userWithoutPassword } = user; // optional: omit password
      res.send(userWithoutPassword);
    });


    // PATCH /users/:id
    app.patch("/users/:id", async (req, res) => {
      try {
        const { id } = req?.params;
        const user_current = await allUsers?.findOne({ _id: new ObjectId(id) });
        const {
          name,
          email,
          phone,
          password,
          role,
          rented_sit,
          sit_rent,
          joining_date
        } = req.body;

        const updateDoc = {
          $set: {
            name: name || user_current?.name,
            email: email || user_current?.email,
            phone: phone || user_current?.phone,
            role: role || user_current?.role,
            rented_sit: rented_sit || user_current?.rented_sit,
            sit_rent: sit_rent || user_current?.sit_rent,
            joining_date: joining_date || user_current?.joining_date
          },
        };

        if (user_current?.password !== password) {
          const hashed = await bcrypt.hash(password, 10);
          // If password is included, hash it again
          if (hashed !== user_current?.password) {
            updateDoc.$set.password = hashed;
          };
        }

        const result = await allUsers.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ message: "User updated", modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.delete("/users/:id", async (req, res) => {
      const result = await allUsers?.deleteOne({ _id: new ObjectId(req?.params?.id) });
      res.send(result);
    })


    // All meals routes

    // ✅ POST a meal
    app.post("/meals", async (req, res) => {
      const { email, date, breakfast, lunch, dinner } = req.body;

      if (!email || !date) {
        return res.status(400).send({ message: "Missing fields" });
      }
      console.log(req?.body)
      const query = { email, date };
      const existing = await allMeals.findOne(query);

      if (existing) {
        const update = await allMeals?.updateOne({ _id: new ObjectId(existing?._id) }, { $set: { breakfast, lunch, dinner } })
        return res.send(update);
      }

      const result = await allMeals.insertOne(req?.body);
      res.send({ message: "Meal recorded", data: result });
    });

    // ✅ UPDATE a meal by email + date
    app.patch("/meals", async (req, res) => {
      const { email, date, mealCount } = req.body;

      if (!email || !date || !mealCount) {
        return res.status(400).send({ message: "Missing fields" });
      }

      const query = { email, date };
      const update = { $set: { mealCount } };
      const result = await allMeals.updateOne(query, update, { upsert: true });

      res.send({ message: "Meal updated", data: result });
    });

    // ✅ GET meals by date
    app.get("/meals", async (req, res) => {
      const { month } = req.query;

      let query = {};

      if (month) {
        const [year, mon] = month.split("-");
        const start = new Date(`${year}-${mon}-01`);
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);

        query.date = {
          $gte: start.toISOString().split("T")[0],
          $lt: end.toISOString().split("T")[0],
        };
      }

      const result = await allMeals.find(query).toArray();
      res.send(result);
    });

    // ✅ GET meal by email + date
    app.get("/meals/:email/:date", async (req, res) => {
      const { email, date } = req.params;
      const result = await allMeals.findOne({ email, date });
      res.send(result || {});
    });



    app.post("/bills", async (req, res) => {
      try {
        const bill = req.body;
        const result = await allBills.insertOne(bill);
        res.send({ message: "Bill created", insertedId: result.insertedId });
      } catch (error) {
        console.error("Error creating bill:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/bills", async (req, res) => {
      try {
        const { month } = req.query;

        let query = {};

        if (month) {
          const [year, mon] = month.split("-");
          const start = new Date(`${year}-${mon}-01`);
          const end = new Date(start);
          end.setMonth(end.getMonth() + 1);

          query.date = {
            $gte: start.toISOString().split("T")[0],
            $lt: end.toISOString().split("T")[0],
          };
        }

        const result = await allBills.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching bills:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.patch("/bills/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedFields = req.body;

        const result = await allBills.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedFields }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Bill not found" });
        }

        res.send({ message: "Bill updated", modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Error updating bill:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.delete("/bills/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await allBills.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Bill not found" });
        }

        res.send({ message: "Bill deleted" });
      } catch (error) {
        console.error("Error deleting bill:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });



    app.post("/costs", async (req, res) => {
      try {
        const cost = req.body;
        const result = await allCosts.insertOne(cost);
        res.send({ message: "Cost added", insertedId: result.insertedId });
      } catch (error) {
        console.error("Error adding cost:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/costs", async (req, res) => {
      try {

        const { month } = req.query;

        let query = {};

        if (month) {
          const [year, mon] = month.split("-");
          const start = new Date(`${year}-${mon}-01`);
          const end = new Date(start);
          end.setMonth(end.getMonth() + 1);

          query.date = {
            $gte: start.toISOString().split("T")[0],
            $lt: end.toISOString().split("T")[0],
          };
        }

        const result = await allCosts.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error getting costs:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.patch("/costs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedFields = req.body;

        const result = await allCosts.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedFields }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Cost not found" });
        }

        res.send({ message: "Cost updated", modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Error updating cost:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.delete("/costs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await allCosts.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Cost not found" });
        }

        res.send({ message: "Cost deleted" });
      } catch (error) {
        console.error("Error deleting cost:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });



    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('SEU Communication Server is open...');
});

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

