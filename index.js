const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const stripe = require("stripe")(process.env.STRIPE_SK);

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

//verifyJWT middleware
const  verifyJWT = (req, res, next) =>{
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

        const lawyersCollection = client.db('lawyerPoint').collection('lawyers');

        const paymentsCollection = client.db('lawyerPoint').collection('payments');

        // verifyAdmin middleware
        const verifyAdmin = async (req, res, next) => {
          const decodedEmail = req.decoded.email;
          const query = {email: decodedEmail};
          const user = await usersCollection.findOne(query);

          if(user?.role !== 'admin'){
            return res.status(403).send({message: 'forbidden access'})
          }
          next()
        }

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

        app.get('/specialistIn', async(req, res) => {
          const query = {}
          const result = await availableAppointmentsCollection.find(query).project({name: 1}).toArray();
          res.send(result);
        })

        app.get('/reserves', verifyJWT, async(req, res) => {
          const email = req.query.email;
          const decodedEmail = req.decoded.email;
          if(email !== decodedEmail){
            return res.status(403).send({message: 'forbidden access'});
          }
          const query = {email: email};
          const reserves = await reservesCollection.find(query).toArray();
          res.send(reserves);
        });

        app.get('/reserves/:id', async(req, res) => {
          const id = req.params.id;
          const query = {_id: new ObjectId(id)};
          const reserve = await reservesCollection.findOne(query);
          res.send(reserve);

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
        });

        //stripe
        app.post('/create-payment-intent', async(req, res) => {
          const reserve = req.body;
          const fee = reserve.fee;
          const amount = fee * 100;
          const paymentIntent = await stripe.paymentIntents.create({
            currency: 'usd',
            amount: amount,
            "payment_method_types": [
              "card"
            ]
          });
          res.send({
            clientSecret: paymentIntent.client_secret,
          });
        });

        app.post('/payments', async(req, res) => {
          const payment = req.body;
          const result = await paymentsCollection.insertOne(payment);
          const id = payment.reserveId
          const filter = {_id: new ObjectId(id)}
          const updatedDoc = {
            $set: {
              paid: true,
              transactionId: payment.transactionId
            }
          }
          const updatedResult = await reservesCollection.updateOne(filter, updatedDoc)
          res.send(result);
        })

        app.get('/completedPayments', verifyJWT, async(req, res) => {
          const email = req.query.email;
          const decodedEmail = req.decoded.email;
          if(email !== decodedEmail){
            return res.status(403).send({message: 'forbidden access'});
          }
          const query = {email: email};
          const result = await paymentsCollection.find(query).toArray();
          res.send(result.reverse());
        });

        app.get('/jwt', async(req, res) => {
          const email = req.query.email;
          const query = {email: email}
          const user = await usersCollection.findOne(query);
          if(user){
            const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '1h'})
            return res.send({accessToken: token});
          }
          res.status(403).send({accessToken: 'Unauthorized'})
        });

        app.get('/users', async(req, res) => {
          const query = {};
          const users = await usersCollection.find(query).toArray();
          res.send(users);
        });

        app.get('/users/admin/:email', async(req, res) => {
          const email = req.params.email;
          const query = { email }
          const user = await usersCollection.findOne(query);
          res.send({isAdmin: user?.role === 'admin'});
        })

        app.post('/users', async(req, res) => {
          const user = req.body;
          const email = user.email;
          const filter = await usersCollection.find({email}).toArray();
          if(filter.length === 0){
            const result = await usersCollection.insertOne(user);
            res.send(result);
          }
          res.send(user);
            
        });

        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async(req, res) => {
          const id = req.params.id;
          const filter = { _id: new ObjectId(id) }
          const options = {upsert: true};
          const updatedDoc = {
            $set: {
              role: 'admin'
            }
          }
          const result = await usersCollection.updateOne(filter, updatedDoc, options);
          res.send(result);
        });

        app.put('/users/user/:id', verifyJWT, verifyAdmin, async(req, res) => {
          const id = req.params.id;
          const filter = { _id: new ObjectId(id) }
          const options = {upsert: true};
          const updatedDoc = {
            $set: {
              role: 'user'
            }
          }
          const result = await usersCollection.updateOne(filter, updatedDoc, options);
          res.send(result);
        });

        app.get('/lawyers', verifyJWT, verifyAdmin, async(req, res) => {
          const query = {};
          const lawyers = await lawyersCollection.find(query).toArray();
          res.send(lawyers);

        })

        app.post('/lawyers', verifyJWT, verifyAdmin, async(req, res) => {
          const lawyer = req.body;
          const result = await lawyersCollection.insertOne(lawyer);
          res.send(result)
        });

        app.delete('/lawyers/:id', verifyJWT, verifyAdmin, async(req, res) => {
          const id = req.params.id;
          const filter = { _id: new ObjectId(id) };
          const result = await lawyersCollection.deleteOne(filter);
          res.send(result)
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