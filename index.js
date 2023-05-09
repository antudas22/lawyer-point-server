const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');

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

//verifyJWT

function verifyJWT(req, res, next){
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send('unauthorized access')
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
    if(err){
      return res.status(403).send({message: 'forbidden access'})
    }
    req.decoded = decoded;
    next();
  })
}

async function run(){

    try{
        const availableAppointmentsCollection = client.db('lawyerPoint').collection('availableAppointments');

        const reservesCollection = client.db('lawyerPoint').collection('reserves');

        const usersCollection = client.db('lawyerPoint').collection('users');

        app.get('/availableAppointments', async(req, res) => {
            const date = req.query.date;
            const query = {};
            const options = await availableAppointmentsCollection.find(query).toArray();
            const reserveQuery = {appointmentDate: date}
            const reserved = await reservesCollection.find(reserveQuery).toArray();
            options.forEach(option => {
              const optionReserved = reserved.filter(reserv => reserv.lawsuit === option.name);
              const reservedTimes = optionReserved.map(reserv => reserv.time)
              const remainingTimes = option.times.filter(time => !reservedTimes.includes(time))
              option.times = remainingTimes;
            })
            res.send(options);
        });

        app.get('/reserves', verifyJWT, async(req, res) => {
          const email = req.query.email;
          const decodedEmail = req.decoded.email;
          if(email !== decodedEmail){
            return res.status(403).send({message: 'forbidden access'});
          }
          const query = {email: email};
          const reserves = await reservesCollection.find(query).toArray();
          res.send(reserves);
        })

        app.post('/reserves', async(req, res) => {
          const reserve = req.body;
          const query = {
            appointmentDate: reserve.appointmentDate,
            email: reserve.email,
            lawsuit: reserve.lawsuit
          }

          const alreadyReserved = await reservesCollection.find(query).toArray();
          if(alreadyReserved.length){
            const message = `You have reserved an appointment on ${reserve.appointmentDate}`
            return res.send({acknowledged: false, message})
          }

          const result = await reservesCollection.insertOne(reserve);
          res.send(result);
        })

        app.get('/jwt', async(req, res) => {
          const email = req.query.email;
          const query = {email: email}
          const user = await usersCollection.findOne(query);
          if(user){
            const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '1h'})
            return res.send({accessToken: token});
          }
          res.status(403).send({accessToken: 'Unauthorized'})
        })

        app.post('/users', async(req, res) => {
          const user = req.body;
           const result = await usersCollection.insertOne(user);
           res.send(result);
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