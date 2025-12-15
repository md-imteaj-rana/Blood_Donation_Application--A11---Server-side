//This part is same for all the backend connection

const express = require('express');
const cors = require('cors')
require('dotenv').config()
const port = process.env.PORT || 5000

const app = express();
app.use(cors());
app.use(express.json())

// till here

// checking the connection to the homepage
app.get('/', (req, res) => {
    res.send("Blood Donation Application - A11 : Backend connected.")
})

app.listen(port, () => {
    console.log(`Server is running on port: ${port}.`)
})

// we can keep same till here

// new started