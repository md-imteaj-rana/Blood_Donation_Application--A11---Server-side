//This part is same for all the backend connection
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors')
require('dotenv').config()
const port = process.env.PORT || 3000
const stripe = require('stripe')(process.env.STRIPE_SECRECT);
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json())


// till here

//firebase sdk 2nd steps
const admin = require("firebase-admin");
//console.log(process.env.FB_SERVICE_KEY)
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Middleware
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if(!token){
    return res.status(401).send({message: 'Unauthorized access'})
  }

  try{
    const idToken = token.split(' ')[1]
    const decoded = await admin.auth().verifyIdToken(idToken)

    //console.log('decoded info', decoded)
    
    req.decoded_email = decoded.email;
    next();
  }
  catch(error){
    return res.status(401).send({message: 'Unauthorized access error'})
  }
}


// checking the connection to the homepage

app.get('/', (req, res) => {
    res.send("Blood Donation Application - A11 : Backend connected.")
})


app.listen(port, () => {
    console.log(`Server is running on port: ${port}.`)
})

// we can keep same till here

// new started

// Cluster

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@pawmarta10.t0jzost.mongodb.net/?appName=PawMartA10`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    // other api works 
    const database = client.db('BloodDonation-A11')
    const userCollections = database.collection('user')
    const requestsCollections = database.collection('requests')
    const fundingCollections = database.collection('fundings')

    app.post('/users', async (req, res)=>{
        const userInfo = req.body;
        userInfo.role = "donor";
        userInfo.status = "active";
        userInfo.createdAt = new Date();

        const result = await userCollections.insertOne(userInfo)

        res.send(result)

    })


    app.get('/users/role/:email', async (req, res) =>{
        const email = req.params.email

        const query = {email}
        const result = await userCollections.findOne(query)
        res.send(result)
    })

    // updating status 
    app.patch('/update/user/status', verifyFBToken, async (req, res) => {
    try {
      const { email, status } = req.body; // ✅ use req.body
      if (!email || !status) {
        return res.status(400).send({ message: "Email and status are required" });
      }

      const query = { email };
      const updateDoc = { $set: { status } };

      const result = await userCollections.updateOne(query, updateDoc);

      if (result.modifiedCount === 0) {
        return res.status(404).send({ message: "User not found or status unchanged" });
      }

      res.send({ message: "Status updated successfully", result });
    } catch (err) {
      console.error(err);
      res.status(500).send({ message: "Internal server error" });
    }
  });


    // user role update patch 
    app.patch('/update/user/role', verifyFBToken, async (req, res) => {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).send({ message: 'Email and role required' });
    }

    const query = { email };
    const updateDoc = {
      $set: { role }
    };

    const result = await userCollections.updateOne(query, updateDoc);
    res.send(result);
    });

    // requests
    app.post('/requests', verifyFBToken, async (req, res) => {
      const data = req.body;
      data.createdAt = new Date();
      data.donationStatus = 'Pending';
      const result = await requestsCollections.insertOne(data)
      res.send(result)
    })

    //my request
    app.get('/requests/:email', verifyFBToken, async (req, res) => {
      const email = req.params.email;
      
      const size = Number(req.query.size);
      const page = Number(req.query.page);
      const query = {requesterEmail: email};

      const result = await requestsCollections.find(query).limit(size).skip(size*page).toArray();
      
      const totalMyReq = await requestsCollections.countDocuments(query)
      res.send({request: result, totalMyReq})
    })

    //all req
    app.get('/requests', async (req, res) => {
    const result = await requestsCollections.find({}).toArray();
    res.send(result);
  });

    //all users
    app.get('/users', verifyFBToken, async (req, res) => {
    const result = await userCollections.find({}).toArray();
    res.status(200).send(result);
  });

  // Stripe payments
  app.post('/create-payment-checkout', async(req, res) => {
    const donationInfo = req.body;
    //console.log(donationInfo)
    const amount = parseInt(donationInfo.donateAmount)*100

    const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data:{
            name: 'Please Donate'
          }
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    metadata:{
      fundName:donationInfo?.fundName
    },
    customer_email:donationInfo?.fundEmail,
    success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
    });
    //console.log(session.url)
    res.send({url: session.url})
  })

  //payment success api to db
  app.post('/success-payment', async(req, res) => {
    const {session_id} = req.query;
    //console.log(session_id)
    const session = await stripe.checkout.sessions.retrieve(session_id);
    //console.log(session);

    // saving to db
    const transactionId = session.payment_intent;

    const isPaymentExist = await fundingCollections.findOne({transactionId})

    if(isPaymentExist){
      return
    }

    if(session.payment_status == 'paid'){
      const paymentInfo = {
        amount: session.amount_total/100,
        currency: session.currency,
        donorEmail: session.customer_email,
        donorName: session.customer_details.name,
        transactionId,
        payment_status:session.payment_status,
        paidAt: new Date()
      }

      const result = await fundingCollections.insertOne(paymentInfo)
      //console.log(session)
      res.send(result)

    }
    
  })

  // fetch funding details
  app.get('/fundings', async (req, res) => {
    const result = await fundingCollections.find({}).toArray();
    res.send(result);
  });

  // fetch for search request
  app.get('/search-request', async (req, res) => {
    const {bloodGroup, district, upazila} = req.query;
    const query = {}
    if(!query){
      return
    }
    if(bloodGroup){
      const fixed = bloodGroup.replace(/ /g, "+").trim();
      query.bloodGroup = fixed;
    }
    if(district){
      query.recipientDistrict = district;
    }
    if(upazila){
      query.recipientUpazila = upazila;
    }
    //console.log(query);
    const result = await requestsCollections.find(query).toArray();
    res.send(result)
  })

  // profile fetch users
  app.get('/users/:email', verifyFBToken, async (req, res) =>{
        const email = req.params.email

        const query = {email}
        const result = await userCollections.findOne(query)
        res.send(result)
    })

  // profile update patch api
  app.patch('/update/user', verifyFBToken, async (req, res) => {
  const email = req.query.email;
  const updatedInfo = req.body; 

  const filter = { email: email };
  const updateDoc = {
    $set: updatedInfo 
  };

  try {
    const result = await userCollections.updateOne(filter, updateDoc);
    console.log(result);
    
    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "User not found" });
    }
    
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Server error", error });
   }
  });

  //get requests by id
  app.get("/requestsdetails/:id", async (req, res) => {
  const { id } = req.params;
    console.log(id);
    
  const result = await requestsCollections.findOne({
    _id: new ObjectId(id),
  });

  res.send(result);
  });

  //patch requests status
  app.patch("/requestsdetails/:id", async (req, res) => {
  const { id } = req.params;
  const { donationStatus, requesterName, requesterEmail } = req.body;

  const updateDoc = {
    $set: {
      donationStatus,
      requesterName,
      requesterEmail,
    },
  };

  const result = await requestsCollections.updateOne(
    { _id: new ObjectId(id) },
    updateDoc
  );

  res.send(result);
  });


  // GET requests created by a donor (by email)
  app.get("/requests/donor/:email", async (req, res) => {
    const email = req.params.email;

    const result = await requestsCollections
      .find({ requesterEmail: email })
      .sort({ createdAt: -1 }) // recent first
      .toArray();

    res.send(result);
  });


  //confirm donation 
  app.patch("/requestsdetails/confirm/:id", async (req, res) => {
  const id = req.params.id;
  const { donorName, donorEmail } = req.body;

  const updateDoc = {
    $set: {
      donationStatus: "inprogress",
      donorName,
      donorEmail,
    },
  };

  const result = await requestsCollections.updateOne(
    { _id: new ObjectId(id) },
    updateDoc
  );

  res.send(result);
  });


  // delete donation requests
  app.get("/usersdelete/role/:email", async (req, res) => {
  const email = req.params.email;
  const user = await userCollections.findOne({ email });

  res.send({ role: user?.role || "donor" });
});

app.get("/deleterequests", async (req, res) => {
  const result = await requestsCollections.find().toArray();
  res.send(result);
});

app.delete("/deletingrequests/:id", verifyFBToken, async (req, res) => {
  const id = req.params.id;
  const userEmail = req.user.email;

  const request = await requestsCollections.findOne({
    _id: new ObjectId(id),
  });

  if (!request) {
    return res.status(404).send({ message: "Request not found" });
  }

  const user = await userCollections.findOne({ email: userEmail });

  // If not admin AND not owner
  if (
    user.role !== "admin" &&
    request.requesterEmail !== userEmail
  ) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  await requestsCollections.deleteOne({ _id: new ObjectId(id) });

  res.send({ message: "Request deleted successfully" });
});




  // update donation request
  app.patch("/requests/edit/:id", async (req, res) => {
  const id = req.params.id;

  const updatedData = req.body;

  const result = await requestsCollections.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedData }
  );

  res.send(result);
  });

  // admin dashboard data fetch 
  app.get("/admin/stats", verifyFBToken, async (req, res) => {
  try {
    // Total donors
    const totalDonors = await userCollections.countDocuments({
      role: "donor",
    });

    // Total blood requests
    const totalRequests = await requestsCollections.countDocuments();

    // Total funding amount
    const fundingResult = await fundingCollections
      .aggregate([
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
          },
        },
      ])
      .toArray();

    const totalFunding =
      fundingResult.length > 0 ? fundingResult[0].totalAmount : 0;

    res.send({
      totalDonors,
      totalFunding,
      totalRequests,
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to load admin stats" });
  }
  });

  // edit func

  //getting user role
  app.get("/users/role/:email", async (req, res) => {
  const email = req.params.email;

  const user = await userCollections.findOne({ email });

  res.send({ role: user?.role });
  });

  //get single donation request
  app.get("/requests/:id", async (req, res) => {
  const id = req.params.id;

  const result = await requestsCollections.findOne({
    _id: new ObjectId(id),
  });

  res.send(result);
  });

  // edit donation role wise
  app.patch("/requests/edit/:id", async (req, res) => {
  const id = req.params.id;
  const updateData = req.body;

  const result = await requestsCollections.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData }
  );

  res.send(result);
  });

  // volunteer only status update patch 
  app.patch("/requests/status/:id", async (req, res) => {
  const id = req.params.id;
  const { donationStatus } = req.body;

  const result = await requestsCollections.updateOne(
    { _id: new ObjectId(id) },
    { $set: { donationStatus } }
  );

  res.send(result);
  });

  // delete my req
  app.delete("/deletemyrequests/:id", verifyFBToken, async (req, res) => {
  const id = req.params.id;

  const query = {
    _id: new ObjectId(id),
    requesterEmail: req.user.email 
  };

  const result = await requestsCollections.deleteOne(query);

  if (result.deletedCount === 0) {
    return res.status(403).send({ message: "Forbidden delete attempt" });
  }

  res.send(result);
});


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);