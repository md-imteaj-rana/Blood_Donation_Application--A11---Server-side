//This part is same for all the backend connection
const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors')
require('dotenv').config()
const port = process.env.PORT || 3000

const app = express();
app.use(cors());
app.use(express.json())


// till here

//firebase sdk 2nd steps
const admin = require("firebase-admin");
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

    console.log('decoded info', decoded)
    
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

    app.post('/users', async (req, res)=>{
        const userInfo = req.body;
        userInfo.role = "donor";
        userInfo.status = "active";
        userInfo.createdAt = new Date();

        const result = await userCollections.insertOne(userInfo)

        res.send(result)

    })


    app.get('/users/role/:email', async (req, res) =>{
        const email = req.params

        const query = {email:email}
        const result = await userCollections.findOne(query)
        res.send(result)
    })

    // requests
    app.post('/requests', verifyFBToken, async (req, res) => {
      const data = req.body;
      data.createdAt = new Date();
      data.donationStatus = 'Pending';
      const result = await requestsCollections.insertOne(data)
      res.send(result)
    })

    app.get('/requests/:email', verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = {requesterEmail: email};

      const result = await requestsCollections.find(query).toArray();
      res.send(result)
    })

    //all req
    app.get('/requests', async (req, res) => {
    const result = await requestsCollections.find({}).toArray();
    res.send(result);
  });

    //all users
    app.get('/users', async (req, res) => {
    const result = await userCollections.find({}).toArray();
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