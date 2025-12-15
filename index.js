//This part is same for all the backend connection

const express = require('express');
const cors = require('cors')
require('dotenv').config()
const port = process.env.PORT || 5000

const app = express();
app.use(cors());
app.use(express.json())

// till here

// new started