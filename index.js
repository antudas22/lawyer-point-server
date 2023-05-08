const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lmouiy1.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri)

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run(){

    try{
        const appointmentOptionCollection = client.db('lawyerPoint').collection('availableAppointments');

        app.get('/availableAppointments', async(req, res) => {
            const query = {};
            const options = await appointmentOptionCollection.find(query).toArray();
            res.send(options);
        })
    }
    finally{

    }
}
run().catch(console.log);


app.get('/', async(req, res) => {
    res.send('Lawyer Point server is running')
})

app.listen(port, () => console.log(`Lawyer Point running on ${port}`))