require("dotenv").config();

const cors = require("cors");
const express = require("express");
const bcrypt = require("bcrypt");
const Pool = require("pg").Pool;
const app = express();
const jwt = require("jsonwebtoken");
const serverPort = process.env.PORT || 8080;
const port = 5432; //db port
//const base64 = require("node-base64-image");
const http = require("http");
//const client = require("redis").createClient();
const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: ["http://10.15.55.136:3000", "http://192.168.1.200:3001"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Access-Control-Allow-Origin"],
    credentials: true,
  },
});

const pool = new Pool({
  user: "yfnktala",
  host: "tai.db.elephantsql.com",
  database: "yfnktala",
  password: process.env.DBPW,
  port: port,
});

const corsOptions = {
  origin: "*",
  credentials: true, //access-control-allow-credentials:true
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions)); // Use this after the variable declaration
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("Welcome to the API of YourTable!");
});

io.use((socket, next) => {
  const username = socket.handshake.auth.username;
  if (!username) {
    return next(new Error("invalid username"));
  }
  socket.username = username;
  next();
});

io.on("connection", (socket) => {
  // fetch existing users
  console.log("connection");
  const users = [];
  for (let [id, socket] of io.of("/").sockets) {
    users.push({
      userID: id,
      username: socket.username,
    });
  }
  console.log("SEND");
  io.emit("users", users);

  // notify existing users
  socket.broadcast.emit("user connected", {
    userID: socket.id,
    username: socket.username,
  });

  socket.on("abc", (data) => {
    console.log(data);
  });

  // forward the private message to the right recipient
  socket.on("private message", ({ content, to }) => {
    console.log("private message " + to);
    socket.to(to).emit("private message", {
      content,
      from: socket.id,
    });
  });

  // notify users upon disconnection
  socket.on("disconnect", () => {
    console.log("disconnect");
    socket.broadcast.emit("user disconnected", socket.id);
  });
});

//USERS ========================================================

app.get("/trySelect/:id", (req, res) => {
  pool.query(
    "SELECT * FROM customer WHERE CUSTOMER_USERNAME = $1",
    [req.params.id],
    function (err, row) {
      console.log(row.rowCount);
      if (row.rowCount < 1) {
        res.status(409).send("There is no User with " + req.params.id);
      } else {
        res.status(201).send("There is a User with " + req.params.id);
      }
    }
  );
});

app.get("/users", (req, res) => {
  if (verify(req)) {
    res.status(200).send("Allowed");
  } else {
    res.status(403).send("Forbidden");
  }
});

app.get("/bcrypt/:id", async (req, res) => {
  res.send(await bcrypt.hash(req.params.id, 5));
});

app.post("/users/register", express.urlencoded(), async function (req, res) {
  console.log("begin register");
  const hashedPW = await bcrypt.hash(req.body.password, 5);
  pool.query(
    "SELECT FROM CUSTOMER WHERE CUSTOMER_EMAIL = $1",
    [req.body.email],
    function (err, row) {
      if (err) {
        console.log(err);
        res.status(401).send(err);
        return;
      }
      if (row.rowCount > 0) {
        console.error("can't create user " + req.body.email);
        res.status(409).send("An user with that username already exists");
      } else {
        console.log("Can create user " + req.body.email);
        pool.query(
          "INSERT INTO CUSTOMER(CUSTOMER_FIRSTNAME,CUSTOMER_SECONDNAME,CUSTOMER_EMAIL,CUSTOMER_USERNAME,CUSTOMER_PASSWORD,CUSTOMER_PHONE,CUSTOMER_SALT) VALUES  ($1, $2, $3, $4, $5, $6,$7)",
          [
            req.body.firstname == undefined ? "Sample" : req.body.firstName,
            req.body.lastname == undefined ? "name" : req.body.lastname,
            req.body.email,
            req.body.username == undefined
              ? req.body.email.split("@")[0]
              : req.body.username,
            hashedPW,
            "+undefined",
            5,
          ],
          (error, results) => {
            if (error) {
              console.log(error);
              res.status(403);
            } else {
              login(req.body.email, req.body.password, res);
              console.log("User created!!");
            }
          }
        );
      }
    }
  );
});

app.post(
  "/users/besitzer/register",
  express.urlencoded(),
  async function (req, res) {
    console.log("begin register");
    const hashedPW = await bcrypt.hash(req.body.password, 5);
    pool.query(
      "SELECT FROM restaurantowner WHERE owner_email = $1",
      [req.body.email],
      function (err, row) {
        if (err) {
          console.log(err);
          res.status(401).send(err);
          return;
        }
        if (row.rowCount > 0) {
          console.error("can't create user " + req.body.email);
          res.status(409).send("An user with that username already exists");
        } else {
          console.log("Can create user " + req.body.email);
          pool.query(
            "INSERT INTO restaurantowner(owner_firstname,owner_secondname,owner_email,owner_username,owner_password,owner_phone,owner_salt) VALUES  ($1, $2, $3, $4, $5, $6,$7)",
            [
              req.body.firstname == undefined ? "Sample" : req.body.firstName,
              req.body.lastname == undefined ? "name" : req.body.lastname,
              req.body.email,
              req.body.username == undefined
                ? req.body.email.split("@")[0]
                : req.body.username,
              hashedPW,
              "+undefined",
              5,
            ],
            (error, results) => {
              if (error) {
                console.log(error);
                res.status(403);
              } else {
                login(req.body.email, req.body.password, res);
                console.log("User created!!");
              }
            }
          );
        }
      }
    );
  }
);

app.post("/users/data/updateUserData", (req, res) => {
  const firstName = req.body.firstName;
  const lastName = req.body.lastName;
  const phone = req.body.phone;
  const email = req.body.email;
  const username =
    req.body.userName == undefined ? email.split("@")[0] : req.body.userName;
  console.log("name: " + username);

  pool.query(
    "UPDATE CUSTOMER SET customer_firstname = $1, customer_secondname = $2, customer_phone = $3, customer_username = $4 WHERE customer_email = $5",
    [firstName, lastName, phone, username, email],
    (error, results) => {
      if (error) {
        console.log(error);
        res.status(403).send(error);
      } else {
        console.log("Success");
        res.status(201).send("success");
      }
    }
  );
});

const login = (username, password, res) => {
  console.log("Trying to login with " + username + " and " + password);
  pool.query(
    `Select * from customer where customer_email = $1`,
    [username],
    async (error, results) => {
      if (error) {
        console.log("Error: " + error);
        return;
      }
      console.log("compare");
      bcrypt.compare(
        password,
        results.rows[0].customer_password,
        function (err, result) {
          if (result) {
            var payload = {
              username: username,
            };
            var token = jwt.sign(payload, process.env.TOKEN_SECRET, {
              algorithm: "HS256",
              expiresIn: "15d",
            });
            console.log("Success");
            console.log(token);
            var obj = {
              token: token,
              ID: results.rows[0].customer_id,
            };
            console.log(obj);

            res.status(200).json(obj);
          } else {
            console.log("Error: " + err);
            res.status(403).send(null);
          }
        }
      );
    }
  );
};

const loginBesitzer = (username, password, res) => {
  console.log("Trying to login with " + username + " and " + password);
  pool.query(
    `Select * from restaurantowner where owner_email = $1`,
    [username],
    async (error, results) => {
      if (error) {
        console.log("Error: " + error);
        return;
      }
      console.log("compare");
      bcrypt.compare(
        password,
        results.rows[0].owner_password,
        function (err, result) {
          if (result) {
            var payload = {
              username: username,
            };
            var token = jwt.sign(payload, process.env.TOKEN_SECRET, {
              algorithm: "HS256",
              expiresIn: "15d",
            });
            console.log("Success");
            console.log(token);
            var obj = {
              token: token,
              ID: results.rows[0].owner_id,
            };
            console.log(obj);

            res.status(200).json(obj);
          } else {
            console.log("Error: " + err);
            res.status(403).send(null);
          }
        }
      );
    }
  );
};

app.post("/users/login", express.urlencoded(), async function (req, res) {
  console.log("login");

  console.log(req.body);

  login(req.body.email, req.body.password, res);
});

app.post(
  "/users/besitzer/login",
  express.urlencoded(),
  async function (req, res) {
    console.log("login");

    console.log(req.body);

    loginBesitzer(req.body.email, req.body.password, res);
  }
);

app.get("/users/data/:email", express.urlencoded(), async function (req, res) {
  const email = req.params.email;

  if (verify(req)) {
    pool.query(
      "SELECT * FROM CUSTOMER WHERE customer_email = $1",
      [email],
      function (err, row) {
        if (err) {
          res.status(405).send("No Data found");
        } else {
          res.status(201).send(row.rows[0]);
        }
      }
    );
  } else {
    res.send("not allowed");
  }
});

app.get(
  "/users/besitzer/data/:email",
  express.urlencoded(),
  async function (req, res) {
    const email = req.params.email;

    if (verify(req)) {
      pool.query(
        "SELECT * FROM restaurantowner WHERE owner_email = $1",
        [email],
        function (err, row) {
          if (err) {
            res.status(405).send("No Data found");
          } else {
            res.status(201).send(row.rows[0]);
          }
        }
      );
    } else {
      res.send("not allowed");
    }
  }
);

//RESTAURANTS ========================================================

//Get all restaurants
app.get("/restaurant", async function (req, res) {
  pool.query("SELECT * FROM restaurant order by id;", function (err, row) {
    if (err) {
      console.log(err);
      res.status(405).send("No Data found");
    } else {
      res.status(201).json(row.rows);
    }
  });
});

//Get all restaurants of one owner
//URL: id = owner_id
app.get("/restaurant/:id", async function (req, res) {
  pool.query(
    "Select * From restaurant where owner_id = $1",
    [req.params.id],
    function (err, row) {
      if (err) {
        console.log(err);
        res.status(405).send("No Data found");
      } else {
        res.status(201).json(row.rows);
      }
    }
  );
});

//Update Restaurantdata
app.post("/restaurants/data/updateRestaurantData", (req, res) => {
  const image = req.body.mainImage;
  const logo = req.body.logoImage;
  const name = req.body.name;
  const address = req.body.address;
  const id = req.body.id;
  const details = req.body.details;
  const layout = JSON.stringify(req.body.layout);
  const opening = JSON.stringify(req.body.opening);
  console.log(layout);
  console.log(opening);

  pool.query(
    "UPDATE RESTAURANT SET restaurant_name = $1, restaurant_address = $2, restaurant_logo = $3, restaurant_image = $4, details = $5, restaurant_layout = $6, opening = $7  WHERE id = $8",
    [name, address, logo, image, details, layout, opening, id],
    function (err, row) {
      if (err) {
        console.log(err);
        console.log("error");
        res.status(403).send(err);
      } else {
        console.log("UPDATED");
        res.status(201).send("success");
      }
    }
  );
});

//RESERVATIONS ========================================================

//Get Reservations from one Restaurant with tables and rooms
//HEADER: reservationdate = datum
//URL: id = restaurant_id
app.get("/reservations/:id", express.urlencoded(), async function (req, res) {
  var date = req.headers["reservationdate"];
  const token = date && date.split(" ")[1];
  console.log(token);
  console.log(date);
  console.log(req.header);
  pool.query(
    `select * from reservation where restaurant_id = $1 and reservation_date = $2 order by reservation_time`,
    [req.params.id, date],
    function (err, row) {
      if (err) {
        console.log(err);
        res.status(405).send("No Data found");
      } else {
        const data = row.rows;

        var obj = {};

        data.forEach((element) => {
          const room = element.reservation_room.toString();
          const table = element.reservation_table.toString();

          if (obj[room] == undefined) {
            obj[room] = {};
          }
          if (obj[room][table] == undefined) {
            obj[room][table] = [];
          }
          obj[room][table].push(element);
        });

        res.status(201).json(obj);
      }
    }
  );
});

//Get Reservations from one Customer
//URL: id = customer_id
app.get("/reservation/:id", async function (req, res) {
  pool.query(
    "Select r.customer_id, r.restaurant_id, r.reservation_date,r.reservation_time,r.reservation_personcount,r.reservation_table,r.reservation_room,r.reservation_extra,rt.restaurant_name, rt.restaurant_logo,c.customer_firstname,c.customer_secondname, c.customer_email from reservation r join restaurant rt on rt.id = r.restaurant_id join customer c on c.customer_id = r.customer_id  where c.customer_id = $1 order by r.reservation_date",
    [req.params.id],
    function (err, row) {
      if (err) {
        console.log(err);
        res.status(405).send("No Data found");
      } else {
        res.status(201).json(row.rows);
      }
    }
  );
});

//Get all Reservations
app.get("/reservations", express.urlencoded(), async function (req, res) {
  pool.query(
    "Select r.customer_id, r.restaurant_id, r.reservation_date,r.reservation_time,r.reservation_personcount,r.reservation_table,r.reservation_room,r.reservation_extra,rt.restaurant_name, rt.restaurant_logo,c.customer_firstname,c.customer_secondname, c.customer_email from reservation r join restaurant rt on rt.id = r.restaurant_id join customer c on c.customer_id = r.customer_id",
    function (err, row) {
      if (err) {
        res.status(405).send("No Data found");
      } else {
        res.status(201).json(row.rows);
      }
    }
  );
});

app.post("/reservation", (req, res) => {
  const restaurantID = req.body.restaurant_id;
  const customerID = req.body.customer_id;
  const reservation_time = req.body.reservation_time;
  const reservation_date = req.body.reservation_date;
  const reservation_table = req.body.reservation_table;
  const reservation_extra = req.body.reservation_extra;
  const reservation_personCount = req.body.reservation_personCount;
  const reservation_room = req.body.reservation_room;
  console.log(req.body);
  pool.query(
    "INSERT INTO reservation VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [
      restaurantID,
      customerID,
      reservation_time,
      reservation_date,
      reservation_table,
      reservation_extra,
      reservation_personCount,
      "null",
      reservation_room,
    ],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(301).send("KEY ERROR");
      } else {
        console.log("SUCC");
        res.status(200).send("Erledigt");
      }
    }
  );
});

app.post("/reservation/delete", (req, res) => {
  const restaurantID = req.body.restaurant_id;
  const customerID = req.body.customer_id;
  const reservation_time = req.body.reservation_time;
  const reservation_date = req.body.reservation_date;

  console.log(restaurantID);
  console.log(customerID);
  console.log(req.body);
  pool.query(
    "DELETE FROM reservation WHERE restaurant_id = $1 and customer_id = $2 and reservation_time = $3 and reservation_date = $4 ",
    [restaurantID, customerID, reservation_time, reservation_date],
    (err, result) => {
      console.log();
      if (err) {
        console.log(err);
        res.status(301).send(err);
      } else {
        console.log("SUCC");
        res.status(200).send("Erledigt");
      }
    }
  );
});

//COMMENTS ========================================================

app.get("/comments/:id", express.urlencoded(), async function (req, res) {
  pool.query(
    "SELECT c.*, cu.customer_username FROM _comment c join customer cu on cu.customer_id = c.customer_id  where _restaurant_id = $1",
    [req.params.id],
    function (err, row) {
      if (err) {
        res.status(405).send("No Data found");
      } else {
        res.status(201).json(row.rows);
      }
    }
  );
});

app.post("/comments/:id", express.urlencoded(), async function (req, res) {
  console.log(req.body);
  pool.query(
    "INSERT INTO _comment (_restaurant_id,customer_id,_comment,_date,stars,title ) VALUES ($1,$2,$3,$4,$5,$6)",
    [
      req.params.id,
      req.body.customer_id,
      req.body._comment,
      req.body._date,
      req.body.stars,
      req.body.title,
    ],
    function (err, row) {
      if (err) {
        console.log(err);
        res.status(301).send(err);
      } else {
        console.log("SUCC");
        res.status(200).send("Erledigt");
      }
    }
  );
});

//========================================================

const verify = (req) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  try {
    jwt.verify(token, process.env.TOKEN_SECRET, { algorithm: "HS256" });
    return true;
  } catch {
    return false;
  }
};

server.listen(serverPort, () => {
  console.log("Server successfully running on port " + serverPort);
});
